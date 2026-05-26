-- [CREATED BY CLAUDE CLI - 2026-05-26]
-- Project: Fingas
-- Purpose: Починить удаление supplier_payment через cashflow:
--   1) На supplier_payments были только SELECT/INSERT policies — UPDATE/DELETE
--      молча проваливались RLS-ом, и платёж оставался в истории поставщика
--      даже после удаления cashflow-строки.
--   2) Триггер из 0018 висел на AFTER DELETE cashflow, а supplier_payments.cashflow_id
--      имеет FK ON DELETE SET NULL — к моменту срабатывания триггера ссылка уже
--      обнулена и `where cashflow_id = old.id` ничего не находит → ни возврата
--      баланса, ни удаления supplier_payment не происходит.
--
-- Идемпотентно.

------------------------------------------------------------------------------
-- 1. UPDATE / DELETE политики для supplier_payments.
------------------------------------------------------------------------------
drop policy if exists supplier_pay_upd on public.supplier_payments;
create policy supplier_pay_upd on public.supplier_payments for update
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_edit')
  )
  with check (organization_id = public.fingas_current_org());

drop policy if exists supplier_pay_del on public.supplier_payments;
create policy supplier_pay_del on public.supplier_payments for delete
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_delete')
  );

------------------------------------------------------------------------------
-- 2. Триггер на BEFORE DELETE cashflow — отыграть баланс и удалить
--    supplier_payment ДО того как FK обнулит cashflow_id.
------------------------------------------------------------------------------
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

-- Пересоздаём триггер на BEFORE (старый сидел на AFTER и не срабатывал).
drop trigger if exists trg_fingas_sync_supplier_payment_cashflow_delete on public.cashflow;
create trigger trg_fingas_sync_supplier_payment_cashflow_delete
  before delete on public.cashflow
  for each row execute function public.fingas_sync_supplier_payment_cashflow_delete();

notify pgrst, 'reload schema';
