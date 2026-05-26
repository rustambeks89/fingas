-- [CREATED BY CODEX - 2026-05-26]
-- Project: Fingas
-- Purpose: Keep cashflow <-> supplier_payments in sync on update/delete.
-- If a cashflow row created from supplier_payment is deleted, remove the linked
-- supplier_payments row and restore supplier balance.

create or replace function public.fingas_sync_supplier_payment_cashflow_update()
returns trigger
language plpgsql
security definer
set search_path = public
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

drop trigger if exists trg_fingas_sync_supplier_payment_cashflow_update on public.cashflow;
create trigger trg_fingas_sync_supplier_payment_cashflow_update
  after update on public.cashflow
  for each row execute function public.fingas_sync_supplier_payment_cashflow_update();

create or replace function public.fingas_sync_supplier_payment_cashflow_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  v_amount numeric(14,2);
begin
  if old.operation_type <> 'supplier_payment' then
    return old;
  end if;

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

  return old;
end;
$$;

drop trigger if exists trg_fingas_sync_supplier_payment_cashflow_delete on public.cashflow;
create trigger trg_fingas_sync_supplier_payment_cashflow_delete
  after delete on public.cashflow
  for each row execute function public.fingas_sync_supplier_payment_cashflow_delete();

notify pgrst, 'reload schema';
