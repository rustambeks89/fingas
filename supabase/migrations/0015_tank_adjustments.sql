-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Manual corrections to a tank's physical balance.
--   Formula: balance = supplies − sales + calibrations + Σ adjustments
--   When book vs physical diverges (после ливня, пролив, недолив, поверка не
--   попавшая в систему) — заводится строка корректировки со знаком и
--   причиной.

create table if not exists public.tank_adjustments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id      uuid references public.stations(id) on delete set null,
  tank_id         uuid references public.tanks(id) on delete cascade,
  fuel_code       text,                              -- redundant for fast filter
  date            date not null default current_date,
  liters          numeric(14,3) not null,            -- может быть + или −
  reason          text not null,                     -- "Полив дождём", "Недолив поставщиком", "Расхождение"
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tank_adj_org      on public.tank_adjustments (organization_id);
create index if not exists idx_tank_adj_tank     on public.tank_adjustments (tank_id);
create index if not exists idx_tank_adj_station  on public.tank_adjustments (station_id);
create index if not exists idx_tank_adj_date     on public.tank_adjustments (date);

drop trigger if exists trg_tank_adjustments_updated_at on public.tank_adjustments;
create trigger trg_tank_adjustments_updated_at
  before update on public.tank_adjustments
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------------
alter table public.tank_adjustments enable row level security;

drop policy if exists tank_adj_sel on public.tank_adjustments;
create policy tank_adj_sel on public.tank_adjustments
  for select
  using (organization_id = public.fingas_current_org()
         and public.fingas_has_perm('fuel_balances','can_view'));

drop policy if exists tank_adj_ins on public.tank_adjustments;
create policy tank_adj_ins on public.tank_adjustments
  for insert
  with check (organization_id = public.fingas_current_org()
              and public.fingas_has_perm('fuel_balances','can_create'));

drop policy if exists tank_adj_upd on public.tank_adjustments;
create policy tank_adj_upd on public.tank_adjustments
  for update
  using (organization_id = public.fingas_current_org()
         and public.fingas_has_perm('fuel_balances','can_edit'))
  with check (organization_id = public.fingas_current_org());

drop policy if exists tank_adj_del on public.tank_adjustments;
create policy tank_adj_del on public.tank_adjustments
  for delete
  using (organization_id = public.fingas_current_org()
         and public.fingas_has_perm('fuel_balances','can_delete'));
