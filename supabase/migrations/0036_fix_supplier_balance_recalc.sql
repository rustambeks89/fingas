-- [CREATED BY ANTIGRAVITY CLI - 2026-05-28]
-- Project: Fingas
-- Purpose:
--   1. Пересоздать все триггерные функции для поставщиков с set row_security = off
--      (без этого они не срабатывают из-за RLS-политик на таблице profiles).
--   2. Пересчитать поле balance в counterparties для всех поставщиков с нуля,
--      опираясь только на фактические данные в БД:
--        balance = SUM(fuel_supply.total_amount) - SUM(cashflow.amount WHERE operation_type='supplier_payment')
--   Запускать в Supabase Dashboard → SQL Editor.
--   Идемпотентно — можно запускать повторно.

------------------------------------------------------------------------------
-- 1. fingas_fuel_supply_balance — INSERT: увеличить долг при поступлении
------------------------------------------------------------------------------
create or replace function public.fingas_fuel_supply_balance()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.supplier_id is null then
    return new;
  end if;
  update public.counterparties
    set balance = balance + coalesce(new.total_amount, 0)
    where id = new.supplier_id;
  return new;
end;
$$;

drop trigger if exists trg_fingas_fuel_supply_balance on public.fuel_supply;
create trigger trg_fingas_fuel_supply_balance
  after insert on public.fuel_supply
  for each row execute function public.fingas_fuel_supply_balance();

------------------------------------------------------------------------------
-- 2. fingas_fuel_supply_balance_undo — DELETE: уменьшить долг при удалении
------------------------------------------------------------------------------
create or replace function public.fingas_fuel_supply_balance_undo()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if old.supplier_id is null then
    return old;
  end if;
  update public.counterparties
     set balance = balance - coalesce(old.total_amount, 0)
   where id = old.supplier_id;
  return old;
end;
$$;

drop trigger if exists trg_fingas_fuel_supply_balance_undo on public.fuel_supply;
create trigger trg_fingas_fuel_supply_balance_undo
  after delete on public.fuel_supply
  for each row execute function public.fingas_fuel_supply_balance_undo();

------------------------------------------------------------------------------
-- 3. fingas_fuel_supply_balance_update — UPDATE supplier_id/total
------------------------------------------------------------------------------
create or replace function public.fingas_fuel_supply_balance_update()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if coalesce(old.supplier_id::text, '') is distinct from coalesce(new.supplier_id::text, '')
     or coalesce(old.total_amount, 0) is distinct from coalesce(new.total_amount, 0)
  then
    if old.supplier_id is not null then
      update public.counterparties
         set balance = balance - coalesce(old.total_amount, 0)
       where id = old.supplier_id;
    end if;
    if new.supplier_id is not null then
      update public.counterparties
         set balance = balance + coalesce(new.total_amount, 0)
       where id = new.supplier_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fingas_fuel_supply_balance_update on public.fuel_supply;
create trigger trg_fingas_fuel_supply_balance_update
  after update of supplier_id, liters_actual, price_per_liter, total_amount on public.fuel_supply
  for each row execute function public.fingas_fuel_supply_balance_update();

------------------------------------------------------------------------------
-- 4. fingas_shadow_supplier_payment — INSERT: запись оплаты → cashflow
------------------------------------------------------------------------------
create or replace function public.fingas_shadow_supplier_payment()
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
     counterparty_id, note, status, created_by, cashflow_category)
    values
    (new.organization_id, new.station_id, new.date, 'supplier_payment',
     new.amount, new.supplier_id, new.note, 'confirmed', new.created_by,
     'Оплата поставщику')
    returning id into v_cf_id;
  new.cashflow_id := v_cf_id;
  return new;
end;
$$;

drop trigger if exists trg_fingas_shadow_supplier_payment on public.supplier_payments;
create trigger trg_fingas_shadow_supplier_payment
  before insert on public.supplier_payments
  for each row execute function public.fingas_shadow_supplier_payment();

------------------------------------------------------------------------------
-- 5. fingas_supplier_payment_balance — INSERT: уменьшить долг при оплате
------------------------------------------------------------------------------
create or replace function public.fingas_supplier_payment_balance()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.counterparties
    set balance = balance - coalesce(new.amount, 0)
    where id = new.supplier_id;
  return new;
end;
$$;

drop trigger if exists trg_fingas_supplier_balance on public.supplier_payments;
create trigger trg_fingas_supplier_balance
  after insert on public.supplier_payments
  for each row execute function public.fingas_supplier_payment_balance();

------------------------------------------------------------------------------
-- 6. ПЕРЕСЧЁТ БАЛАНСА ВСЕХ ПОСТАВЩИКОВ С НУЛЯ
--    balance = Σ fuel_supply.total_amount  -  Σ cashflow.amount (supplier_payment)
--    Это гарантированно исправляет все расхождения.
------------------------------------------------------------------------------
update public.counterparties c
set balance = coalesce((
    select sum(fs.total_amount)
    from public.fuel_supply fs
    where fs.supplier_id = c.id
), 0)
- coalesce((
    select sum(cf.amount)
    from public.cashflow cf
    where cf.counterparty_id = c.id
      and cf.operation_type = 'supplier_payment'
), 0)
where c.type = 'supplier';

notify pgrst, 'reload schema';
