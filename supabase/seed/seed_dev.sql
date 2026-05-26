-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Optional dev seed — create one organization and one Pit Stop station.
-- Run AFTER you have created your owner auth user via Supabase Studio and
-- replace OWNER_AUTH_UUID below with the auth.users.id of that user.

-- 1) Owner user
do $$
declare
  v_owner uuid := '8647e8b5-ca78-438f-a00d-7e34bb3196df'::uuid; -- <-- replace me
  v_org   uuid;
  v_station uuid;
begin
  if v_owner is null then
    raise exception 'Set v_owner to your real auth.users.id first';
  end if;

  insert into public.organizations (name, owner_user_id)
    values ('fingas Demo', v_owner)
    returning id into v_org;

  insert into public.stations (organization_id, name, city, external_station_id)
    values (v_org, 'Pit Stop', 'Ош', 8)
    returning id into v_station;

  insert into public.profiles (user_id, organization_id, station_id, full_name, role, status, can_login, can_view_all_stations)
    values (v_owner, v_org, v_station, 'Owner', 'owner', 'active', true, true)
    on conflict (user_id) do update set
      organization_id = excluded.organization_id,
      station_id = excluded.station_id,
      role = 'owner',
      status = 'active',
      can_login = true,
      can_view_all_stations = true;

  insert into public.wallets (organization_id, station_id, name, kind) values
    (v_org, v_station, 'Касса АЗС', 'cash_register'),
    (v_org, v_station, 'Сейф',      'safe'),
    (v_org, null,      'Карт-счет', 'card'),
    (v_org, null,      'Р/счет',    'bank'),
    (v_org, null,      'Кошелёк владельца', 'owner');
end$$;
