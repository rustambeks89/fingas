-- [CREATED BY ANTIGRAVITY CLI - 2026-05-28]
-- Project: Fingas
-- Purpose: Consolidate cascade deletion of supplier_payments and restore supplier balance
--   directly into the primary BEFORE DELETE trigger of the cashflow table.
--   This eliminates any RLS, trigger execution order (alphabetical), or foreign key
--   (ON DELETE SET NULL) timing conflicts.

------------------------------------------------------------------------------
-- 1. Consolidated BEFORE DELETE trigger function on cashflow
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
begin
  -- A. Payroll payouts/accruals.
  delete from public.payroll where cashflow_id = old.id;

  -- B. Tax payments.
  delete from public.tax_payments where cashflow_id = old.id;

  -- C. Supplier payments (supplier_payments).
  -- Must run BEFORE the row is deleted and the FK cashflow_id ON DELETE SET NULL nullifies the link.
  if old.operation_type = 'supplier_payment' then
    select supplier_id, amount
      into v_supplier, v_amount
      from public.supplier_payments
      where cashflow_id = old.id;

    if found then
      -- Since the payment is being deleted, we owe the supplier again (balance increases).
      if v_supplier is not null then
        update public.counterparties
           set balance = balance + coalesce(v_amount, 0)
         where id = v_supplier;
      end if;

      delete from public.supplier_payments
       where cashflow_id = old.id;
    end if;
  end if;

  return old;
end;
$$;

-- Recreate the trigger to bind the updated function
drop trigger if exists trg_fingas_cleanup_dependents_on_cashflow_delete on public.cashflow;
create trigger trg_fingas_cleanup_dependents_on_cashflow_delete
  before delete on public.cashflow
  for each row execute function public.fingas_cleanup_dependents_on_cashflow_delete();

------------------------------------------------------------------------------
-- 2. Cleanup any orphaned supplier payments left behind due to the previous bug
------------------------------------------------------------------------------
delete from public.supplier_payments where cashflow_id is null;

notify pgrst, 'reload schema';
