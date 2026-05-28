-- [CREATED BY ANTIGRAVITY CLI - 2026-05-28]
-- Project: Fingas
-- Purpose: Исправить неправильное название топлива "92е5" на "АИ-95" во всех таблицах БД.
-- Запускать в Supabase Dashboard → SQL Editor.
-- Идемпотентно — можно запускать повторно.

-- fuel_supply
update public.fuel_supply set fuel_type = 'АИ-95' where fuel_type = '92е5';

-- tanks
update public.tanks set fuel_code = 'АИ-95' where fuel_code = '92е5';

-- tank_measurements
update public.tank_measurements set fuel_type = 'АИ-95' where fuel_type = '92е5';

-- calibrations (безопасно — только если таблица и колонка существуют)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'calibrations'
      and column_name = 'fuel'
  ) then
    update public.calibrations set fuel = 'АИ-95' where fuel = '92е5';
  end if;
end $$;

notify pgrst, 'reload schema';
