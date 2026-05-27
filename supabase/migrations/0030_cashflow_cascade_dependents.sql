-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose: При удалении cashflow-строки чистить все зависимые записи:
--   * supplier_payments — уже сделано в миграциях 0022/0023 (с возвратом
--     долга поставщику). Не трогаем.
--   * payroll        — запись о выплате/начислении должна исчезнуть.
--   * tax_payments   — налоговая выплата должна исчезнуть.
--
-- Также для будущих налоговых операций добавляем колонку cashflow_id
-- и обновляем shadow-триггер, чтобы связь сразу проставлялась.

------------------------------------------------------------------------------
-- 1. tax_payments.cashflow_id  — двусторонняя связь
------------------------------------------------------------------------------
alter table public.tax_payments
  add column if not exists cashflow_id uuid references public.cashflow(id) on delete set null;

create index if not exists idx_tax_payments_cashflow on public.tax_payments(cashflow_id);

------------------------------------------------------------------------------
-- 2. Обновлённый shadow-триггер для tax_payments — сохраняет cashflow_id.
------------------------------------------------------------------------------
create or replace function public.fingas_shadow_tax_payment()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_cf_id uuid;
begin
  if new.cashflow_id is not null then
    return new;
  end if;
  insert into public.cashflow
    (organization_id, station_id, date, operation_type, amount,
     note, status, created_by, cashflow_category)
    values
    (new.organization_id, new.station_id, new.payment_date, 'tax',
     new.amount, coalesce(new.note, new.tax_type), 'confirmed', new.created_by,
     new.tax_type)
    returning id into v_cf_id;
  new.cashflow_id := v_cf_id;
  return new;
end;
$$;

drop trigger if exists trg_fingas_shadow_tax on public.tax_payments;
create trigger trg_fingas_shadow_tax
  before insert on public.tax_payments
  for each row execute function public.fingas_shadow_tax_payment();

------------------------------------------------------------------------------
-- 3. BEFORE DELETE на cashflow — каскадная зачистка зависимых записей.
------------------------------------------------------------------------------
create or replace function public.fingas_cleanup_dependents_on_cashflow_delete()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- Выплаты/начисления зарплаты. Просто удаляем запись — payroll не
  -- имеет каскадных балансовых триггеров, остаток считается на лету.
  delete from public.payroll where cashflow_id = old.id;

  -- Налоговые выплаты. Аналогично — удаляем запись.
  delete from public.tax_payments where cashflow_id = old.id;

  return old;
end;
$$;

drop trigger if exists trg_fingas_cleanup_dependents_on_cashflow_delete on public.cashflow;
create trigger trg_fingas_cleanup_dependents_on_cashflow_delete
  before delete on public.cashflow
  for each row execute function public.fingas_cleanup_dependents_on_cashflow_delete();

------------------------------------------------------------------------------
-- 4. Бэкфилл существующих tax_payments — попробовать найти shadow-cashflow
--    по совпадению (org, station, payment_date=date, amount, type='tax')
--    и привязать.
------------------------------------------------------------------------------
update public.tax_payments tp
   set cashflow_id = c.id
  from public.cashflow c
  where tp.cashflow_id is null
    and c.operation_type = 'tax'
    and c.organization_id = tp.organization_id
    and coalesce(c.station_id::text, '') = coalesce(tp.station_id::text, '')
    and c.date = tp.payment_date
    and c.amount = tp.amount;

notify pgrst, 'reload schema';
