-- Ensure tank directory tables exist even if 0014 was not applied yet.

------------------------------------------------------------------------------
-- fuel_types
------------------------------------------------------------------------------
create table if not exists public.fuel_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,
  name            text not null,
  color           text default '#FF4D3D',
  octane          integer,
  sort_order      integer default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists ux_fuel_types_org_code
  on public.fuel_types (organization_id, code);

drop trigger if exists trg_fuel_types_updated_at on public.fuel_types;
create trigger trg_fuel_types_updated_at
  before update on public.fuel_types
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- tanks
------------------------------------------------------------------------------
create table if not exists public.tanks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  station_id       uuid not null references public.stations(id) on delete cascade,
  number           integer,
  name             text not null,
  fuel_type_id     uuid references public.fuel_types(id) on delete set null,
  fuel_code        text,
  capacity_liters  numeric(12,2) not null default 0,
  min_liters       numeric(12,2) not null default 0,
  critical_liters  numeric(12,2) not null default 0,
  external_tank_id integer,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_tanks_station on public.tanks (station_id);
create index if not exists idx_tanks_org on public.tanks (organization_id);

drop trigger if exists trg_tanks_updated_at on public.tanks;
create trigger trg_tanks_updated_at
  before update on public.tanks
  for each row execute function public.trigger_set_updated_at();

alter table public.fuel_types enable row level security;
alter table public.tanks enable row level security;

drop policy if exists fuel_types_sel on public.fuel_types;
create policy fuel_types_sel on public.fuel_types
  for select
  using (organization_id = public.fingas_current_org());

drop policy if exists fuel_types_ins on public.fuel_types;
create policy fuel_types_ins on public.fuel_types
  for insert
  with check (
    organization_id = public.fingas_current_org()
    and (public.fingas_is_owner() or public.fingas_has_perm('settings', 'can_edit'))
  );

drop policy if exists fuel_types_upd on public.fuel_types;
create policy fuel_types_upd on public.fuel_types
  for update
  using (
    organization_id = public.fingas_current_org()
    and (public.fingas_is_owner() or public.fingas_has_perm('settings', 'can_edit'))
  )
  with check (organization_id = public.fingas_current_org());

drop policy if exists fuel_types_del on public.fuel_types;
create policy fuel_types_del on public.fuel_types
  for delete
  using (
    organization_id = public.fingas_current_org()
    and (public.fingas_is_owner() or public.fingas_has_perm('settings', 'can_delete'))
  );

drop policy if exists tanks_sel on public.tanks;
create policy tanks_sel on public.tanks
  for select
  using (organization_id = public.fingas_current_org());

drop policy if exists tanks_ins on public.tanks;
create policy tanks_ins on public.tanks
  for insert
  with check (
    organization_id = public.fingas_current_org()
    and (public.fingas_is_owner() or public.fingas_has_perm('settings', 'can_edit'))
  );

drop policy if exists tanks_upd on public.tanks;
create policy tanks_upd on public.tanks
  for update
  using (
    organization_id = public.fingas_current_org()
    and (public.fingas_is_owner() or public.fingas_has_perm('settings', 'can_edit'))
  )
  with check (organization_id = public.fingas_current_org());

drop policy if exists tanks_del on public.tanks;
create policy tanks_del on public.tanks
  for delete
  using (
    organization_id = public.fingas_current_org()
    and (public.fingas_is_owner() or public.fingas_has_perm('settings', 'can_delete'))
  );

------------------------------------------------------------------------------
-- v_tank_status
------------------------------------------------------------------------------
create or replace view public.v_tank_status as
  select
    t.id              as tank_id,
    t.organization_id,
    t.station_id,
    t.number,
    t.name,
    t.fuel_code,
    t.capacity_liters,
    t.min_liters,
    t.critical_liters,
    coalesce((
      select b."EndBalance"
      from public.azs_balance b
      where b."FuelName" = t.fuel_code
        and b."EndBalance" > 1000000
        and b."ShopKey" = (
          select s.external_station_id from public.stations s where s.id = t.station_id
        )
      order by b.synced_at desc nulls last
      limit 1
    ), 0) as last_end_balance,
    (
      select b.synced_at
      from public.azs_balance b
      where b."FuelName" = t.fuel_code
        and b."ShopKey" = (
          select s.external_station_id from public.stations s where s.id = t.station_id
        )
      order by b.synced_at desc nulls last
      limit 1
    ) as last_synced_at
  from public.tanks t
  where t.active;
