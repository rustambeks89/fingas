-- [CREATED BY CODEX - 2026-05-25]
-- Project: Fingas
-- Purpose: Repair/refresh cashflow_categories in case the target database
-- missed 0014_directories.sql or PostgREST schema cache was not reloaded.

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

alter table public.cashflow_categories enable row level security;

drop policy if exists cashflow_categories_sel on public.cashflow_categories;
create policy cashflow_categories_sel on public.cashflow_categories
  for select
  using (organization_id = public.fingas_current_org());

drop policy if exists cashflow_categories_ins on public.cashflow_categories;
create policy cashflow_categories_ins on public.cashflow_categories
  for insert
  with check (
    organization_id = public.fingas_current_org()
    and (public.fingas_is_owner() or public.fingas_has_perm('settings','can_edit'))
  );

drop policy if exists cashflow_categories_upd on public.cashflow_categories;
create policy cashflow_categories_upd on public.cashflow_categories
  for update
  using (
    organization_id = public.fingas_current_org()
    and (public.fingas_is_owner() or public.fingas_has_perm('settings','can_edit'))
  )
  with check (organization_id = public.fingas_current_org());

drop policy if exists cashflow_categories_del on public.cashflow_categories;
create policy cashflow_categories_del on public.cashflow_categories
  for delete
  using (
    organization_id = public.fingas_current_org()
    and (public.fingas_is_owner() or public.fingas_has_perm('settings','can_delete'))
  );

notify pgrst, 'reload schema';
