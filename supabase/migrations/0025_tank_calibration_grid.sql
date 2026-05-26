-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose: Градуировочная таблица резервуаров — соответствие «высота уровня
--   в см → объём в литрах». Используется при поступлении и инвентаризации,
--   чтобы пересчитать замеры (см) в литры по реальной форме резервуара.
--
--   Также добавляем SQL-функцию public.fingas_tank_liters_at_cm(tank, cm),
--   которая делает кусочно-линейную интерполяцию между двумя соседними
--   точками таблицы. Если cm выходит за пределы — возвращает null.

------------------------------------------------------------------------------
-- 1. Таблица tank_calibration_grid
------------------------------------------------------------------------------
create table if not exists public.tank_calibration_grid (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id      uuid not null references public.stations(id) on delete cascade,
  tank_id         uuid not null references public.tanks(id) on delete cascade,
  height_cm       numeric(8,2) not null check (height_cm >= 0),
  liters          numeric(14,3) not null check (liters >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tank_id, height_cm)
);

create index if not exists idx_tank_calib_grid_tank   on public.tank_calibration_grid (tank_id, height_cm);
create index if not exists idx_tank_calib_grid_org    on public.tank_calibration_grid (organization_id);

drop trigger if exists trg_tank_calib_grid_updated_at on public.tank_calibration_grid;
create trigger trg_tank_calib_grid_updated_at
  before update on public.tank_calibration_grid
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- 2. RLS
------------------------------------------------------------------------------
alter table public.tank_calibration_grid enable row level security;

drop policy if exists tank_calib_grid_sel on public.tank_calibration_grid;
create policy tank_calib_grid_sel on public.tank_calibration_grid for select
  using (organization_id = public.fingas_current_org());

drop policy if exists tank_calib_grid_ins on public.tank_calibration_grid;
create policy tank_calib_grid_ins on public.tank_calibration_grid for insert
  with check (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('settings','can_edit')
  );

drop policy if exists tank_calib_grid_upd on public.tank_calibration_grid;
create policy tank_calib_grid_upd on public.tank_calibration_grid for update
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('settings','can_edit')
  )
  with check (organization_id = public.fingas_current_org());

drop policy if exists tank_calib_grid_del on public.tank_calibration_grid;
create policy tank_calib_grid_del on public.tank_calibration_grid for delete
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('settings','can_edit')
  );

------------------------------------------------------------------------------
-- 3. Интерполяционная функция — высота (см) → литры по таблице бака
------------------------------------------------------------------------------
create or replace function public.fingas_tank_liters_at_cm(
  p_tank_id uuid,
  p_height_cm numeric
) returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_low_cm numeric;
  v_low_l  numeric;
  v_high_cm numeric;
  v_high_l  numeric;
begin
  if p_tank_id is null or p_height_cm is null then
    return null;
  end if;

  -- Точное совпадение
  select liters into v_low_l
    from public.tank_calibration_grid
    where tank_id = p_tank_id and height_cm = p_height_cm
    limit 1;
  if found then
    return v_low_l;
  end if;

  -- Нижний соседний узел
  select height_cm, liters
    into v_low_cm, v_low_l
    from public.tank_calibration_grid
    where tank_id = p_tank_id and height_cm < p_height_cm
    order by height_cm desc
    limit 1;

  -- Верхний соседний узел
  select height_cm, liters
    into v_high_cm, v_high_l
    from public.tank_calibration_grid
    where tank_id = p_tank_id and height_cm > p_height_cm
    order by height_cm asc
    limit 1;

  if v_low_cm is null or v_high_cm is null then
    return null; -- запрошенная высота за пределами таблицы
  end if;

  return v_low_l
    + (v_high_l - v_low_l) * (p_height_cm - v_low_cm) / (v_high_cm - v_low_cm);
end;
$$;

notify pgrst, 'reload schema';
