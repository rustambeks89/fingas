-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose:
--   1. При удалении fuel_supply откатывать долг поставщика
--      (counterparties.balance -= total_amount). Раньше существовал только
--      INSERT-триггер (миграция 0010 → fingas_fuel_supply_balance), который
--      ДОБАВЛЯЛ к долгу. На удаление поставки долг не возвращался.
--   2. Добавить DELETE-политику на counterparties, чтобы клиент мог реально
--      удалять контрагентов (раньше клиент-метод делал update active=false
--      потому что delete падал/молчал из-за отсутствия RLS).

------------------------------------------------------------------------------
-- 1. AFTER DELETE on fuel_supply — откат долга.
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
-- 2. (Опционально) Пересчёт долга при UPDATE supplier_id/total
--    (раньше тоже игнорировался — теперь возвращаем разницу старому
--    поставщику и добавляем новому).
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
  after update of supplier_id, liters_actual, price_per_liter on public.fuel_supply
  for each row execute function public.fingas_fuel_supply_balance_update();

------------------------------------------------------------------------------
-- 3. DELETE-политика на counterparties.
------------------------------------------------------------------------------
drop policy if exists counterparties_delete on public.counterparties;
create policy counterparties_delete on public.counterparties for delete
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_delete')
  );

notify pgrst, 'reload schema';
