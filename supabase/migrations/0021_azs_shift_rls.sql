-- [CREATED BY CLAUDE CLI - 2026-05-26]
-- Project: Fingas
-- Purpose: READ-ONLY RLS for azs_shift (синхронизируется из MySQL и хранит
-- авторитетные даты открытия/закрытия смены и имя оператора). Без политики
-- RLS-enabled таблица режет весь архив смен. Идемпотентно.

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='azs_shift') then
    execute 'alter table public.azs_shift enable row level security';
    execute 'drop policy if exists azs_shift_read on public.azs_shift';
    execute 'drop policy if exists azs_shift_read_shopkey on public.azs_shift';

    execute $V$
      create policy azs_shift_read_shopkey on public.azs_shift
        for select
        using (
          public.fingas_has_perm('shifts','can_view')
          and exists (
            select 1 from public.stations st
            where st.external_station_id = azs_shift."ShopKey"
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
