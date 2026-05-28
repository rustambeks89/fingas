-- [CREATED BY ANTIGRAVITY CLI - 2026-05-28]
-- Project: Fingas
-- Purpose: Fix row-level security (RLS) policies / recursive check lockups inside trigger functions
--   associated with supplier payments, counterparties (supplier) balance, and fuel supplies
--   by explicitly adding SET row_security = off to SECURITY DEFINER functions.
--
--   Without SET row_security = off, active RLS policies on counterparties, cashflow, and profiles
--   are checked during triggers even when called within security definer context, causing
--   either policy failures (e.g. if the operator lacks cashflow permission) or infinite
--   recursion loops (e.g. current_org -> profiles RLS -> current_org). This results in
--   indefinitely hanging/blocking queries during supplier payment creation.

------------------------------------------------------------------------------
-- 1. shadow supplier_payments -> cashflow trigger
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
    return new; -- already linked
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

------------------------------------------------------------------------------
-- 2. reduce counterparty balance trigger
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
    set balance = balance - new.amount
    where id = new.supplier_id;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 3. sync supplier_payments & counterparties on cashflow update trigger
------------------------------------------------------------------------------
create or replace function public.fingas_sync_supplier_payment_cashflow_update()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_old_supplier uuid;
  v_new_supplier uuid;
begin
  if old.operation_type <> 'supplier_payment' and new.operation_type <> 'supplier_payment' then
    return new;
  end if;

  select supplier_id into v_old_supplier
    from public.supplier_payments
    where cashflow_id = old.id;

  if not found then
    return new;
  end if;

  v_new_supplier := coalesce(new.counterparty_id, v_old_supplier);

  if v_old_supplier is distinct from v_new_supplier then
    if v_old_supplier is not null then
      update public.counterparties
        set balance = balance + coalesce(old.amount, 0)
        where id = v_old_supplier;
    end if;

    if v_new_supplier is not null then
      update public.counterparties
        set balance = balance - coalesce(new.amount, 0)
        where id = v_new_supplier;
    end if;
  else
    update public.counterparties
      set balance = balance + coalesce(old.amount, 0) - coalesce(new.amount, 0)
      where id = v_old_supplier;
  end if;

  update public.supplier_payments
    set
      supplier_id = coalesce(new.counterparty_id, supplier_id),
      organization_id = coalesce(new.organization_id, organization_id),
      station_id = coalesce(new.station_id, station_id),
      amount = coalesce(new.amount, amount),
      date = coalesce(new.date, date),
      note = new.note,
      created_by = coalesce(new.created_by, created_by)
    where cashflow_id = old.id;

  return new;
end;
$$;

------------------------------------------------------------------------------
-- 4. increase supplier balance on fuel supply insertion trigger
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
    set balance = balance + new.total_amount
    where id = new.supplier_id;
  return new;
end;
$$;

notify pgrst, 'reload schema';
