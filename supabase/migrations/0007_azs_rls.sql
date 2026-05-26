-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Enable RLS on MySQL-synced source tables with READ-ONLY policies.
--   * No INSERT/UPDATE/DELETE policies — writes are reserved for the service
--     role (the python sync script bypasses RLS by using SUPABASE_SERVICE_KEY).
--   * Reads are scoped to the caller's organization via the stations table
--     mapping (external_station_id).
--
-- Guarded with IF-EXISTS so the migration is safe to run before the sync has
-- created the tables.

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'azs_selling') then
    execute 'alter table public.azs_selling enable row level security';

    execute 'drop policy if exists azs_selling_read on public.azs_selling';
    execute $V$
      create policy azs_selling_read on public.azs_selling
        for select
        using (
          public.fingas_has_perm('sales','can_view')
          and exists (
            select 1 from public.stations st
            where st.external_station_id = azs_selling.station_id
              and st.organization_id = public.fingas_current_org()
              and (
                public.fingas_can_view_all_stations()
                or st.id = public.fingas_current_station()
              )
          )
        );
    $V$;
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'azs_balance') then
    execute 'alter table public.azs_balance enable row level security';

    execute 'drop policy if exists azs_balance_read on public.azs_balance';
    execute $V$
      create policy azs_balance_read on public.azs_balance
        for select
        using (
          public.fingas_has_perm('fuel_balances','can_view')
          and exists (
            select 1 from public.stations st
            where st.external_station_id = azs_balance.station_id
              and st.organization_id = public.fingas_current_org()
              and (
                public.fingas_can_view_all_stations()
                or st.id = public.fingas_current_station()
              )
          )
        );
    $V$;
  end if;
end$$;
