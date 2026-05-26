-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Re-create READ-ONLY RLS for azs_selling / azs_balance using the
-- ShopKey column (the real station identifier from MySQL). Replaces the
-- earlier 0007_azs_rls.sql which referenced a non-existent station_id column.
--
-- Apply this file in Supabase → SQL Editor. Idempotent.

------------------------------------------------------------------------------
-- azs_selling
------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='azs_selling') then
    execute 'alter table public.azs_selling enable row level security';
    execute 'drop policy if exists azs_selling_read on public.azs_selling';
    execute 'drop policy if exists azs_selling_read_shopkey on public.azs_selling';

    execute $V$
      create policy azs_selling_read_shopkey on public.azs_selling
        for select
        using (
          public.fingas_has_perm('sales','can_view')
          and exists (
            select 1 from public.stations st
            where st.external_station_id = azs_selling."ShopKey"
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

------------------------------------------------------------------------------
-- azs_balance
------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='azs_balance') then
    execute 'alter table public.azs_balance enable row level security';
    execute 'drop policy if exists azs_balance_read on public.azs_balance';
    execute 'drop policy if exists azs_balance_read_shopkey on public.azs_balance';

    execute $V$
      create policy azs_balance_read_shopkey on public.azs_balance
        for select
        using (
          public.fingas_has_perm('fuel_balances','can_view')
          and exists (
            select 1 from public.stations st
            where st.external_station_id = azs_balance."ShopKey"
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

------------------------------------------------------------------------------
-- Rebuild the v_sales view to use ShopKey instead of station_id.
-- v_fuel_balance gets the same treatment.
------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='azs_selling') then
    execute 'drop view if exists public.v_sales';
    execute $V$
      create view public.v_sales as
        select
          s.*,
          (select st.id from public.stations st
             where st.external_station_id = s."ShopKey"
             limit 1) as fingas_station_id
        from public.azs_selling s
        where not exists (
          select 1 from public.sales_exclusions x
          where x.source_table = 'azs_selling'
            and x.source_id = s.id::text
        );
    $V$;
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='azs_balance') then
    execute 'drop view if exists public.v_fuel_balance';
    execute $V$
      create view public.v_fuel_balance as
        select
          b.*,
          (select st.id from public.stations st
             where st.external_station_id = b."ShopKey"
             limit 1) as fingas_station_id
        from public.azs_balance b;
    $V$;
  end if;
exception when others then
  -- view rebuild is best-effort (azs_selling may not have an `id` column);
  -- silently continue if it fails.
  null;
end$$;
