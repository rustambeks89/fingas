-- [CREATED BY CODEX - 2026-05-25]
-- Project: Fingas
-- Purpose: Let unauthenticated / not-yet-approved employees browse the active
-- organization and station catalog during self-registration without exposing
-- the full tables.

create or replace function public.fingas_public_organizations()
returns table (
  id uuid,
  name text
)
language sql
security definer
set search_path = public
as $$
  select o.id, o.name
  from public.organizations o
  where o.active = true
  order by o.name;
$$;

grant execute on function public.fingas_public_organizations() to anon, authenticated;

create or replace function public.fingas_public_stations(p_organization_id uuid default null)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  city text
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.organization_id, s.name, s.city
  from public.stations s
  join public.organizations o on o.id = s.organization_id
  where s.active = true
    and o.active = true
    and (p_organization_id is null or s.organization_id = p_organization_id)
  order by s.name;
$$;

grant execute on function public.fingas_public_stations(uuid) to anon, authenticated;
