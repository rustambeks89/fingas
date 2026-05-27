-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose: Автоматическая синхронизация смен с кэшфлоу и перерасчет начислений зарплаты.
--   1) Добавление связующих полей в public.cashflow
--   2) Триггер на автосинхронизацию shift_report_lines и расхождений в cashflow при утверждении смены
--   3) Корректировка триггера автоначисления payroll для поддержки перерасчета при редактировании смены

------------------------------------------------------------------------------
-- 1. Добавление связующих колонок в public.cashflow
------------------------------------------------------------------------------
alter table public.cashflow
  add column if not exists shift_report_id uuid references public.shift_reports(id) on delete cascade,
  add column if not exists shift_report_line_id uuid;

create index if not exists idx_cashflow_shift_report on public.cashflow(shift_report_id);

------------------------------------------------------------------------------
-- 2. Функция триггера автосинхронизации смен с кэшфлоу
------------------------------------------------------------------------------
create or replace function public.fingas_sync_shift_report_to_cashflow()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_line record;
  v_wallet_id uuid;
  v_default_wallet_id uuid;
begin
  -- 1. Всегда удаляем старые записи по этой смене в кэшфлоу для избежания дубликатов (идемпотентность)
  delete from public.cashflow where shift_report_id = new.id;

  -- 2. Если смена утверждена и не отклонена
  if new.approved_at is not null and (new.result_status is null or new.result_status <> 'rejected') then
    
    -- Получаем дефолтный кассовый кошелек организации для подстраховки
    select id into v_default_wallet_id 
      from public.wallets 
     where organization_id = new.organization_id 
       and active = true 
     order by created_at asc 
     limit 1;

    -- Переносим каждую строку доходов/расходов смены
    for v_line in 
      select * from public.shift_report_lines where shift_report_id = new.id
    loop
      v_wallet_id := coalesce(v_line.wallet_id, v_default_wallet_id);
      
      insert into public.cashflow (
        organization_id,
        station_id,
        date,
        operation_type,
        payment_type,
        wallet_from,
        wallet_to,
        cashflow_category,
        amount,
        counterparty_id,
        note,
        status,
        created_by,
        shift_report_id,
        shift_report_line_id
      ) values (
        new.organization_id,
        new.station_id,
        coalesce(new.submitted_at::date, current_date),
        v_line.kind,
        coalesce(v_line.payment_type, 'cash'),
        case when v_line.kind = 'expense' then v_wallet_id else null end,
        case when v_line.kind = 'income' then v_wallet_id else null end,
        coalesce(v_line.category, 'Разное'),
        v_line.amount,
        v_line.counterparty_id,
        coalesce(v_line.note, 'По смене №' || new.external_shift_key),
        'confirmed',
        coalesce(v_line.created_by, new.submitted_by),
        new.id,
        v_line.id
      );
    end loop;

    -- Обрабатываем финансовые расхождения смены (недостачи и излишки)
    -- total_difference = ожидалось - факт. 
    -- Если > 0 -> Недостача (расход), если < 0 -> Излишек (приход).
    if new.total_difference is not null and new.total_difference <> 0 then
      insert into public.cashflow (
        organization_id,
        station_id,
        date,
        operation_type,
        payment_type,
        wallet_from,
        wallet_to,
        cashflow_category,
        amount,
        note,
        status,
        created_by,
        shift_report_id
      ) values (
        new.organization_id,
        new.station_id,
        coalesce(new.submitted_at::date, current_date),
        case when new.total_difference > 0 then 'expense' else 'income' end,
        'cash',
        case when new.total_difference > 0 then v_default_wallet_id else null end,
        case when new.total_difference < 0 then v_default_wallet_id else null end,
        'Расхождение смены',
        abs(new.total_difference),
        case when new.total_difference > 0 
             then 'Недостача средств по смене №' || new.external_shift_key 
             else 'Излишек средств по смене №' || new.external_shift_key 
        end,
        'confirmed',
        new.submitted_by,
        new.id
      );
    end if;

  end if;

  return new;
end;
$$;

-- Подключаем триггер к shift_reports
drop trigger if exists trg_fingas_shift_report_cashflow_sync on public.shift_reports;
create trigger trg_fingas_shift_report_cashflow_sync
  after update of approved_at, result_status, total_difference on public.shift_reports
  for each row execute function public.fingas_sync_shift_report_to_cashflow();

------------------------------------------------------------------------------
-- 3. Доработка триггера автоначисления payroll для мгновенного перерасчета
------------------------------------------------------------------------------
create or replace function public.fingas_trigger_accrue_on_approve()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- Перерассчитываем payroll при первом утверждении ИЛИ если утвержденная смена обновляется
  if (new.approved_at is not null)
     and (
       (old.approved_at is distinct from new.approved_at) or
       (old.expected_liters is distinct from new.expected_liters) or
       (old.operator_user_id is distinct from new.operator_user_id) or
       (old.submitted_at is distinct from new.submitted_at)
     )
     and (new.result_status is null or new.result_status <> 'rejected')
  then
    perform public.fingas_accrue_payroll_for_report(new.id);
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
