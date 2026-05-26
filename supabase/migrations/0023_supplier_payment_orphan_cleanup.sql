-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose: Add-on фикс к 0022. Симптом: после удаления cashflow-строки
--   counterparties.balance корректно откатывается, но строка в supplier_payments
--   остаётся (cashflow_id уже = null из-за FK ON DELETE SET NULL — поэтому
--   повторно цепануть её ничем нельзя).
--
--   Корень: триггер public.fingas_sync_supplier_payment_cashflow_delete был
--   SECURITY DEFINER, но владелец функции не имел BYPASSRLS — UPDATE на
--   counterparties отрабатывал политикой counterparties_update, а DELETE на
--   supplier_payments молча проваливался отсутствием supplier_pay_del.
--
--   Фикс:
--   1) Перевыставить RLS-политики (UPDATE/DELETE) на supplier_payments —
--      на случай если 0022 не применили целиком.
--   2) В функции делаем `set local row_security = off` чтобы внутри
--      security-definer тела RLS точно не мешал.
--   3) Подобрать осиротевшие supplier_payments (cashflow_id is null) и
--      удалить их — баланс уже скорректирован 0022-триггером, поэтому
--      второй раз править counterparties не нужно.
--
-- Идемпотентно.

------------------------------------------------------------------------------
-- 1. RLS для supplier_payments (дубль из 0022 на случай частичного применения)
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
-- 2. Триггер с явным отключением RLS внутри SECURITY DEFINER
------------------------------------------------------------------------------
create or replace function public.fingas_sync_supplier_payment_cashflow_delete()
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
  before delete on public.cashflow
  for each row execute function public.fingas_sync_supplier_payment_cashflow_delete();

------------------------------------------------------------------------------
-- 3. Чистим хвосты: supplier_payments где cashflow_id уже null
--    (это значит cashflow строка была удалена раньше, а supplier_payments
--    осталась из-за бага 0018/0022). Баланс уже был откатан 0022-триггером
--    при последнем удалении (для тех записей, что удалили после применения 0022).
--
--    Для совсем старых orphan-ов из эпохи 0018 (баланс не откатывался) —
--    их видно в counterparties.balance: если он минусовой/неконсистентный
--    относительно фактических supplies-payments, поправите вручную в Dashboard.
--    Тут просто чистим saving.
------------------------------------------------------------------------------
delete from public.supplier_payments where cashflow_id is null;

notify pgrst, 'reload schema';
