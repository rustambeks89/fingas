-- [CREATED BY CLAUDE CLI - 2026-06-04]
-- Project: Fingas
-- Purpose: автоматическая синхронизация в cashflow:
--   1) shift_report_lines (доход/расход внутри смены)
--      → cashflow с привязкой к shift_session_id;
--   2) payroll.paid (выплата зарплаты по факту)
--      → cashflow с operation_type='salary'.
--
-- До этой миграции расходы оператора оставались в shift_report_lines и не
-- попадали в cashflow, а выплата зарплаты вообще не порождала движение
-- денег автоматически. Теперь обе цепочки замкнуты.
--
-- Двусторонняя каскадная зачистка:
--   * удаление shift_report_lines → удаляется соответствующий cashflow;
--   * удаление cashflow.source='shift_report_line:<id>' → удаляется строка;
--   * удаление cashflow.source='payroll_payout:<id>' → cashflow_id и paid
--     в payroll сбрасываются (запись начисления остаётся).
--
-- Защита от рекурсии — через pg_trigger_depth().

------------------------------------------------------------------------------
-- 1. Синхронизация shift_report_lines → cashflow
------------------------------------------------------------------------------
create or replace function public.fingas_sync_shift_line_to_cashflow()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_report public.shift_reports;
  v_op_date date;
  v_cf_id uuid;
  v_existing uuid;
  v_source text;
begin
  -- INSERT / UPDATE — обновляем или создаём парную cashflow-запись.
  if tg_op in ('INSERT','UPDATE') then
    select * into v_report
      from public.shift_reports
      where id = new.shift_report_id;
    if not found then
      return new;
    end if;

    v_op_date := coalesce(v_report.submitted_at::date, current_date);
    v_source := 'shift_report_line:' || new.id::text;

    -- Ищем уже существующую cashflow-запись по source. Если есть — UPDATE,
    -- если нет — INSERT. Уникальной БД-связи нет, поэтому source = ключ.
    select id into v_existing
      from public.cashflow
      where source = v_source
      limit 1;

    if v_existing is not null then
      update public.cashflow
         set amount           = new.amount,
             date             = v_op_date,
             cashflow_category = new.category,
             counterparty_id  = new.counterparty_id,
             wallet_from      = case when new.kind = 'expense' then new.wallet_id else null end,
             wallet_to        = case when new.kind = 'income'  then new.wallet_id else null end,
             payment_type     = new.payment_type,
             note             = new.note,
             station_id       = new.station_id,
             shift_session_id = v_report.shift_session_id,
             operation_type   = case when new.kind = 'income' then 'income' else 'expense' end
       where id = v_existing;
    else
      insert into public.cashflow
        (organization_id, station_id, date, operation_type, amount,
         counterparty_id, wallet_from, wallet_to, payment_type,
         cashflow_category, note, status, created_by,
         shift_session_id, source)
        values
        (new.organization_id, new.station_id, v_op_date,
         case when new.kind = 'income' then 'income' else 'expense' end,
         new.amount,
         new.counterparty_id,
         case when new.kind = 'expense' then new.wallet_id else null end,
         case when new.kind = 'income'  then new.wallet_id else null end,
         new.payment_type, new.category, new.note, 'confirmed', new.created_by,
         v_report.shift_session_id, v_source)
        returning id into v_cf_id;
    end if;

    return new;
  end if;

  -- DELETE — снимаем парную cashflow. Не дёргаем cashflow-триггер DELETE
  -- ниже по цепочке (pg_trigger_depth защищает от взаимного вызова).
  if tg_op = 'DELETE' then
    v_source := 'shift_report_line:' || old.id::text;
    delete from public.cashflow where source = v_source;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_fingas_sync_shift_line_to_cashflow_iu on public.shift_report_lines;
create trigger trg_fingas_sync_shift_line_to_cashflow_iu
  after insert or update on public.shift_report_lines
  for each row execute function public.fingas_sync_shift_line_to_cashflow();

drop trigger if exists trg_fingas_sync_shift_line_to_cashflow_del on public.shift_report_lines;
create trigger trg_fingas_sync_shift_line_to_cashflow_del
  after delete on public.shift_report_lines
  for each row execute function public.fingas_sync_shift_line_to_cashflow();

------------------------------------------------------------------------------
-- 2. Синхронизация payroll.paid → cashflow (выплата зарплаты)
--    Срабатывает только когда сумма выплаты выросла (или впервые задана).
--    Запись в cashflow создаётся на дельту (новая выплата - предыдущая),
--    чтобы повторные выплаты не задваивали движение.
------------------------------------------------------------------------------
create or replace function public.fingas_sync_payroll_payout_to_cashflow()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_delta numeric(14,2);
  v_cf_id uuid;
  v_payout_date date;
begin
  v_delta := coalesce(new.paid, 0) - coalesce(old.paid, 0);
  if v_delta <= 0 then
    return new;
  end if;

  v_payout_date := coalesce(new.paid_at::date, current_date);

  insert into public.cashflow
    (organization_id, station_id, date, operation_type, amount,
     note, status, created_by, cashflow_category, shift_session_id, source)
    values
    (new.organization_id, new.station_id, v_payout_date, 'salary',
     v_delta, coalesce(new.note, 'Выплата зарплаты'), 'confirmed', auth.uid(),
     'Зарплата', new.shift_session_id,
     'payroll_payout:' || new.id::text)
    returning id into v_cf_id;

  -- Первая выплата → сохраняем связь cashflow_id. Дельта-выплаты
  -- (доплаты) не перетирают исходную ссылку.
  if new.cashflow_id is null then
    update public.payroll
       set cashflow_id = v_cf_id
     where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fingas_sync_payroll_payout on public.payroll;
create trigger trg_fingas_sync_payroll_payout
  after update of paid, paid_at on public.payroll
  for each row execute function public.fingas_sync_payroll_payout_to_cashflow();

------------------------------------------------------------------------------
-- 3. Обновляем cleanup-функцию cashflow.delete:
--    * если cashflow создан из shift_report_line → удалить строку
--      (с защитой от рекурсии через pg_trigger_depth);
--    * если cashflow создан из payroll_payout → НЕ удалять запись payroll,
--      а откатить выплату (paid = paid - amount, cashflow_id = null).
--      Это сохраняет историю начислений.
------------------------------------------------------------------------------
create or replace function public.fingas_cleanup_dependents_on_cashflow_delete()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_supplier uuid;
  v_amount numeric(14,2);
  v_src text;
  v_src_id uuid;
begin
  -- A. Старые завязки (payroll по cashflow_id) — оставляем как было
  --    для записей БЕЗ source-маркера (миграция назад-совместима).
  delete from public.payroll
    where cashflow_id = old.id
      and (old.source is null or old.source not like 'payroll_payout:%');

  -- B. Tax payments.
  delete from public.tax_payments where cashflow_id = old.id;

  -- C. Supplier payments.
  if old.operation_type = 'supplier_payment' then
    select supplier_id, amount
      into v_supplier, v_amount
      from public.supplier_payments
      where cashflow_id = old.id;

    if found then
      if v_supplier is not null then
        update public.counterparties
           set balance = balance + coalesce(v_amount, 0)
         where id = v_supplier;
      end if;

      delete from public.supplier_payments
       where cashflow_id = old.id;
    end if;
  end if;

  -- D. Авто-источники (новые в 0039)
  v_src := coalesce(old.source, '');

  if v_src like 'shift_report_line:%' and pg_trigger_depth() < 2 then
    v_src_id := nullif(split_part(v_src, ':', 2), '')::uuid;
    if v_src_id is not null then
      delete from public.shift_report_lines where id = v_src_id;
    end if;
  end if;

  if v_src like 'payroll_payout:%' then
    v_src_id := nullif(split_part(v_src, ':', 2), '')::uuid;
    if v_src_id is not null then
      -- Откат выплаты: paid уменьшается, ссылка сбрасывается.
      update public.payroll
         set paid = greatest(0, coalesce(paid, 0) - coalesce(old.amount, 0)),
             cashflow_id = case when cashflow_id = old.id then null else cashflow_id end,
             paid_at = case
                         when greatest(0, coalesce(paid, 0) - coalesce(old.amount, 0)) = 0
                         then null else paid_at end
       where id = v_src_id;
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_fingas_cleanup_dependents_on_cashflow_delete on public.cashflow;
create trigger trg_fingas_cleanup_dependents_on_cashflow_delete
  before delete on public.cashflow
  for each row execute function public.fingas_cleanup_dependents_on_cashflow_delete();

notify pgrst, 'reload schema';
