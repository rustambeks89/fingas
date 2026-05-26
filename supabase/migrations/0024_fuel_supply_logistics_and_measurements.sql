-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose: Расширить fuel_supply под учёт замеров и логистики.
--   * measurement_before_liters / measurement_after_liters — физические
--     показания резервуара до и после слива (для контроля расхождения
--     с накладной).
--   * logistics_cost — стоимость доставки. В долг поставщика НЕ идёт
--     (перевозчику платят отдельно), но участвует в расчёте себестоимости
--     топлива.
--   * cost_per_liter_total — generated: (total_amount + logistics_cost) /
--     liters_actual, для удобства витрин и отчётов P&L.

alter table public.fuel_supply
  add column if not exists measurement_before_liters numeric(14,3),
  add column if not exists measurement_after_liters  numeric(14,3),
  add column if not exists logistics_cost            numeric(14,2) not null default 0;

-- Себестоимость одного литра с учётом доставки. Защита от деления на ноль.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'fuel_supply'
       and column_name  = 'cost_per_liter_total'
  ) then
    alter table public.fuel_supply
      add column cost_per_liter_total numeric(14,4)
      generated always as (
        case
          when coalesce(liters_actual, 0) = 0 then null
          else (liters_actual * price_per_liter + coalesce(logistics_cost, 0))
               / liters_actual
        end
      ) stored;
  end if;
end$$;

notify pgrst, 'reload schema';
