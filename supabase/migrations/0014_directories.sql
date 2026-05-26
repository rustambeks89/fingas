-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Reference directories to make forms clean and tanks visualisable:
--   * fuel_types          — список видов топлива с цветом для UI
--   * tanks               — физические резервуары, привязаны к АЗС + вид топлива
--   * cashflow_categories — статьи прихода / расхода для cashflow
--   * tax_types           — налоговые виды с ставкой/периодом
--
-- All tables: org-scoped, soft-delete via active=false, RLS by has_perm.
-- Idempotent — apply via Supabase SQL Editor.

------------------------------------------------------------------------------
-- fuel_types
------------------------------------------------------------------------------
create table if not exists public.fuel_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,                -- "АИ-92", "ДТ", "Газ"
  name            text not null,
  color           text default '#FF4D3D',        -- for UI badges / tank fill
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
  number           integer,                       -- "Резервуар №1"
  name             text not null,
  fuel_type_id     uuid references public.fuel_types(id) on delete set null,
  fuel_code        text,                          -- copy of fuel_types.code for legacy queries
  capacity_liters  numeric(12,2) not null default 0,
  min_liters       numeric(12,2) not null default 0,        -- ниже — предупреждение
  critical_liters  numeric(12,2) not null default 0,        -- ниже — критично
  external_tank_id integer,                       -- ссылка на номер резервуара в POS
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

------------------------------------------------------------------------------
-- cashflow_categories
------------------------------------------------------------------------------
create table if not exists public.cashflow_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            text not null check (kind in ('income','expense','both')),
  name            text not null,
  parent_id       uuid references public.cashflow_categories(id) on delete set null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists ux_cashflow_categories_org_name
  on public.cashflow_categories (organization_id, kind, name);

drop trigger if exists trg_cashflow_categories_updated_at on public.cashflow_categories;
create trigger trg_cashflow_categories_updated_at
  before update on public.cashflow_categories
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- tax_types
------------------------------------------------------------------------------
create table if not exists public.tax_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,                                -- "НДС", "НсП", "Соцфонд"
  rate            numeric(8,4) default 0,                       -- 0.12, 1000.00, etc.
  rate_kind       text not null default 'percent' check (rate_kind in ('percent','fixed')),
  period          text default 'month' check (period in ('day','week','month','quarter','year','one_off')),
  applies_to      text default 'revenue' check (applies_to in ('revenue','profit','salary','property','land','other')),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists ux_tax_types_org_name
  on public.tax_types (organization_id, name);

drop trigger if exists trg_tax_types_updated_at on public.tax_types;
create trigger trg_tax_types_updated_at
  before update on public.tax_types
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------------
alter table public.fuel_types          enable row level security;
alter table public.tanks               enable row level security;
alter table public.cashflow_categories enable row level security;
alter table public.tax_types           enable row level security;

-- generic select: anyone in org
do $$
declare
  t text;
begin
  foreach t in array array['fuel_types','tanks','cashflow_categories','tax_types']
  loop
    execute format('drop policy if exists %I_sel on public.%I', t, t);
    execute format($f$
      create policy %I_sel on public.%I
        for select
        using (organization_id = public.fingas_current_org());
    $f$, t, t);

    -- write: settings.can_edit (or shifts.can_edit for tanks/fuel — practical)
    execute format('drop policy if exists %I_ins on public.%I', t, t);
    execute format($f$
      create policy %I_ins on public.%I
        for insert
        with check (
          organization_id = public.fingas_current_org()
          and (public.fingas_is_owner() or public.fingas_has_perm('settings','can_edit'))
        );
    $f$, t, t);

    execute format('drop policy if exists %I_upd on public.%I', t, t);
    execute format($f$
      create policy %I_upd on public.%I
        for update
        using (
          organization_id = public.fingas_current_org()
          and (public.fingas_is_owner() or public.fingas_has_perm('settings','can_edit'))
        )
        with check (organization_id = public.fingas_current_org());
    $f$, t, t);

    execute format('drop policy if exists %I_del on public.%I', t, t);
    execute format($f$
      create policy %I_del on public.%I
        for delete
        using (
          organization_id = public.fingas_current_org()
          and (public.fingas_is_owner() or public.fingas_has_perm('settings','can_delete'))
        );
    $f$, t, t);
  end loop;
end$$;

------------------------------------------------------------------------------
-- Helper view: tank summary = latest reading from azs_balance per tank's
-- fuel_code + station ShopKey, plus tank metadata. Used by dashboard.
--
-- Falls back to no row if azs_balance is empty.
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
