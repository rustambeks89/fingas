-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose: Серверный расчёт остатков по бакам — один RPC вместо 5× supabase-запросов
--   на каждый резервуар. На дашборде это убирает основной тормоз: раньше
--   computePhysicalBalance() для 4 баков делал ~17 round-trip'ов плюс выкачку
--   до 50 000 строк azs_selling в JS только ради SUM(Volume). Теперь всё SUM-ится
--   в Postgres за один call.
--
-- Возвращает по строке на бак:
--   tank_id, supplies, sales, calibrations, adjustments, liters
-- Идемпотентно.

create or replace function public.fingas_tank_balances(
  p_organization_id uuid,
  p_station_id      uuid default null
)
returns table (
  tank_id      uuid,
  supplies     numeric,
  sales        numeric,
  calibrations numeric,
  adjustments  numeric,
  liters       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with active_tanks as (
    select t.id,
           t.station_id,
           coalesce(t.fuel_code, ft.code) as fuel_code,
           s.external_station_id           as shop_key
      from public.tanks t
      left join public.fuel_types ft on ft.id = t.fuel_type_id
      left join public.stations  s   on s.id = t.station_id
     where t.organization_id = p_organization_id
       and t.active = true
       and (p_station_id is null or t.station_id = p_station_id)
  ),
  sup as (
    select at.id as tank_id,
           coalesce(sum(fs.liters_actual), 0) as supplies
      from active_tanks at
      left join public.fuel_supply fs
        on fs.tank_id = at.id
        or (fs.tank_id is null
            and fs.station_id = at.station_id
            and fs.fuel_type  = at.fuel_code)
     group by at.id
  ),
  sal as (
    select at.id as tank_id,
           coalesce(sum(z."Volume"), 0) as sales
      from active_tanks at
      left join public.azs_selling z
        on at.shop_key is not null
       and z."ShopKey"  = at.shop_key
       and z."FuelName" = at.fuel_code
     group by at.id
  ),
  cal as (
    select at.id as tank_id,
           coalesce(sum(c.volume), 0) as calibrations
      from active_tanks at
      left join public.calibrations c
        on c.station_id = at.station_id
       and c.fuel       = at.fuel_code
     group by at.id
  ),
  adj as (
    select at.id as tank_id,
           coalesce(sum(a.liters), 0) as adjustments
      from active_tanks at
      left join public.tank_adjustments a
        on a.tank_id = at.id
     group by at.id
  )
  select
    at.id as tank_id,
    sup.supplies,
    sal.sales,
    cal.calibrations,
    adj.adjustments,
    (sup.supplies - sal.sales + cal.calibrations + adj.adjustments) as liters
  from active_tanks at
  join sup on sup.tank_id = at.id
  join sal on sal.tank_id = at.id
  join cal on cal.tank_id = at.id
  join adj on adj.tank_id = at.id;
$$;

grant execute on function public.fingas_tank_balances(uuid, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
