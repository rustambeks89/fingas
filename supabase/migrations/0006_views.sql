-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Read-only views that unify access to the MySQL-synced azs_* tables
-- without renaming or altering them. Use these views in the app instead of
-- selecting raw azs_* whenever you need shift-aware or station-mapped data.
--
-- IMPORTANT: We DO NOT create or alter azs_selling / azs_balance here.
-- They are owned by the Python sync script and must remain untouched.
--
-- These views are created with `create or replace` and use IF-EXISTS guards so
-- they degrade gracefully if a particular azs_* table is not yet synced into
-- this Supabase project.

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'azs_selling') then
    execute $V$
      create or replace view public.v_sales as
        select
          s.*,
          coalesce(
            (select st.id from public.stations st
             where st.external_station_id = s.station_id
             limit 1),
            null
          ) as fingas_station_id
        from public.azs_selling s
        where not exists (
          select 1 from public.sales_exclusions x
          where x.source_table = 'azs_selling'
            and x.source_id = s.id::text
        );
    $V$;
  else
    raise notice 'azs_selling not present yet — skipping v_sales';
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'azs_balance') then
    execute $V$
      create or replace view public.v_fuel_balance as
        select
          b.*,
          coalesce(
            (select st.id from public.stations st
             where st.external_station_id = b.station_id
             limit 1),
            null
          ) as fingas_station_id
        from public.azs_balance b;
    $V$;
  else
    raise notice 'azs_balance not present yet — skipping v_fuel_balance';
  end if;
end$$;
