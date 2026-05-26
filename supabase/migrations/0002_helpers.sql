-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Pre-schema helpers (only those needed by table triggers in 0003).
-- User/profile-aware helpers live in 0004_auth_helpers.sql because they
-- reference the profiles table.

create or replace function public.trigger_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
