-- [CREATED BY CLAUDE CLI - 2026-06-04]
-- Project: Fingas
-- Purpose: Закрыть последнюю дыру в каскадах supplier ↔ cashflow.
-- До этой миграции counterparties.balance пересчитывался только при
-- INSERT supplier_payments (миграция 0036) и DELETE cashflow (0034).
-- При UPDATE существующей оплаты (например, исправили сумму с 5000 на 3000)
-- баланс оставался старым. Карточка поставщика показывала неверный долг.
--
-- Триггеры:
--   1) AFTER UPDATE on supplier_payments
--      — если amount изменился: balance += (old.amount - new.amount).
--   2) AFTER UPDATE on cashflow WHEN operation_type='supplier_payment'
--      — если amount изменился: balance += (old.amount - new.amount).
--      Поддерживаем редактирование напрямую из CashflowScreen / SupplierDetail.

create or replace function public.fingas_supplier_payment_balance_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_delta numeric(14,2);
begin
  v_delta := coalesce(old.amount, 0) - coalesce(new.amount, 0);
  if v_delta = 0 and old.supplier_id is not distinct from new.supplier_id then
    return new;
  end if;

  -- Если поменялся supplier_id — возвращаем долг старому, снимаем новому.
  if old.supplier_id is distinct from new.supplier_id then
    if old.supplier_id is not null then
      update public.counterparties
         set balance = balance + coalesce(old.amount, 0)
       where id = old.supplier_id;
    end if;
    if new.supplier_id is not null then
      update public.counterparties
         set balance = balance - coalesce(new.amount, 0)
       where id = new.supplier_id;
    end if;
    return new;
  end if;

  -- supplier тот же, изменилась только сумма.
  if new.supplier_id is not null then
    update public.counterparties
       set balance = balance + v_delta
     where id = new.supplier_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fingas_supplier_payment_balance_upd on public.supplier_payments;
create trigger trg_fingas_supplier_payment_balance_upd
  after update of amount, supplier_id on public.supplier_payments
  for each row execute function public.fingas_supplier_payment_balance_on_update();

------------------------------------------------------------------------------
-- 2. Та же логика, но для прямого редактирования cashflow-строки оплаты.
--    CashflowScreen.jsx / SupplierDetailScreen.jsx редактируют именно cashflow,
--    а не supplier_payments (там нет всех полей).
------------------------------------------------------------------------------
create or replace function public.fingas_cashflow_supplier_payment_balance_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_delta numeric(14,2);
begin
  if old.operation_type is distinct from 'supplier_payment'
     and new.operation_type is distinct from 'supplier_payment' then
    return new;
  end if;

  -- Переключение operation_type само по себе не меняем — считаем это
  -- редким и допускаем, что владелец сам пересчитает баланс. Здесь
  -- закрываем только частый кейс: amount или counterparty_id.

  v_delta := coalesce(old.amount, 0) - coalesce(new.amount, 0);

  if old.counterparty_id is distinct from new.counterparty_id then
    if old.counterparty_id is not null and old.operation_type = 'supplier_payment' then
      update public.counterparties
         set balance = balance + coalesce(old.amount, 0)
       where id = old.counterparty_id;
    end if;
    if new.counterparty_id is not null and new.operation_type = 'supplier_payment' then
      update public.counterparties
         set balance = balance - coalesce(new.amount, 0)
       where id = new.counterparty_id;
    end if;

    -- Синхронизируем supplier_payments-копию, если она есть.
    update public.supplier_payments
       set amount = new.amount,
           supplier_id = new.counterparty_id,
           date = new.date,
           note = new.note,
           station_id = new.station_id
     where cashflow_id = new.id;

    return new;
  end if;

  if v_delta <> 0 and new.operation_type = 'supplier_payment'
     and new.counterparty_id is not null then
    update public.counterparties
       set balance = balance + v_delta
     where id = new.counterparty_id;

    update public.supplier_payments
       set amount = new.amount,
           date = new.date,
           note = new.note,
           station_id = new.station_id
     where cashflow_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fingas_cashflow_supplier_payment_balance_upd on public.cashflow;
create trigger trg_fingas_cashflow_supplier_payment_balance_upd
  after update of amount, counterparty_id, operation_type, date, note, station_id on public.cashflow
  for each row execute function public.fingas_cashflow_supplier_payment_balance_on_update();

notify pgrst, 'reload schema';
