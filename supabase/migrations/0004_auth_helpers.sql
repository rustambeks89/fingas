-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Auth/profile-aware helpers used by every RLS policy in 0005_rls.sql.
--   * fingas_current_profile()       -- returns the caller's profile row
--   * fingas_current_org()           -- caller's organization_id
--   * fingas_current_station()
--   * fingas_current_role()
--   * fingas_is_active()             -- status = active AND can_login
--   * fingas_is_owner()
--   * fingas_can_view_all_stations()
--   * fingas_has_perm(module, action)
--
-- All are SECURITY DEFINER so they can read profiles even when the caller's
-- own RLS policy on profiles is restrictive.

create or replace function public.fingas_current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.fingas_current_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.fingas_current_station()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select station_id
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.fingas_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.fingas_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select status = 'active' and can_login
     from public.profiles
     where user_id = auth.uid()
     limit 1),
    false);
$$;

create or replace function public.fingas_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'owner' and status = 'active' and can_login
     from public.profiles
     where user_id = auth.uid()
     limit 1),
    false);
$$;

create or replace function public.fingas_can_view_all_stations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select can_view_all_stations or role = 'owner'
     from public.profiles
     where user_id = auth.uid()
     limit 1),
    false);
$$;

-- Generic permission check used by RLS policies.
--   module : 'cashflow', 'shifts', ... (see lib/constants.js MODULES)
--   action : 'can_view' | 'can_create' | 'can_edit' | 'can_delete' |
--            'can_approve' | 'can_export' | 'can_upload'
-- Owners always pass. Inactive / non-login users always fail.
create or replace function public.fingas_has_perm(p_module text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role   text;
  v_active boolean;
  v_value  boolean;
  v_sql    text;
begin
  select role, (status = 'active' and can_login)
    into v_role, v_active
    from public.profiles
    where user_id = auth.uid()
    limit 1;

  if v_active is not true then
    return false;
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  if p_action not in (
    'can_view','can_create','can_edit','can_delete',
    'can_approve','can_export','can_upload'
  ) then
    return false;
  end if;

  v_sql := format(
    'select %I from public.user_permissions where user_id = auth.uid() and module = $1 limit 1',
    p_action
  );
  execute v_sql into v_value using p_module;
  return coalesce(v_value, false);
end;
$$;

comment on function public.fingas_has_perm(text, text) is
  'Returns true if the current auth user has the given toggle permission. Owners always true.';

-- Convenience: same row checked from another user's perspective (for the
-- owner UI to preview what an employee can do).
create or replace function public.fingas_has_perm_for(p_user uuid, p_module text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role   text;
  v_active boolean;
  v_value  boolean;
  v_sql    text;
begin
  select role, (status = 'active' and can_login)
    into v_role, v_active
    from public.profiles
    where user_id = p_user
    limit 1;

  if v_active is not true then return false; end if;
  if v_role = 'owner' then return true; end if;

  if p_action not in (
    'can_view','can_create','can_edit','can_delete',
    'can_approve','can_export','can_upload'
  ) then return false; end if;

  v_sql := format(
    'select %I from public.user_permissions where user_id = $1 and module = $2 limit 1',
    p_action
  );
  execute v_sql into v_value using p_user, p_module;
  return coalesce(v_value, false);
end;
$$;
