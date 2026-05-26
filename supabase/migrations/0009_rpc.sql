-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: RPC functions exposed to the frontend via supabase.rpc().
--   * fingas_apply_role_template(p_user, p_role)  -- owner seeds toggles
--   * fingas_close_shift(p_shift_session_id, payload jsonb) -- compute
--     expected vs actual and write the result back to shift_reports

------------------------------------------------------------------------------
-- Apply a role template to a user's permission toggles.
-- Owners call this from the Employees → Permissions screen as a starting
-- point. They can then flip individual toggles afterwards.
------------------------------------------------------------------------------
create or replace function public.fingas_apply_role_template(
  p_user uuid,
  p_role text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if not public.fingas_is_owner() then
    raise exception 'Only owner can apply role templates';
  end if;

  select organization_id into v_org from public.profiles where user_id = p_user;
  if v_org is null then
    raise exception 'Target user has no organization';
  end if;
  if v_org <> public.fingas_current_org() then
    raise exception 'Cross-organization assignment forbidden';
  end if;

  -- wipe and re-seed
  delete from public.user_permissions where user_id = p_user;

  if p_role = 'owner' then
    -- owner is implicit; no rows needed
    return;
  end if;

  if p_role = 'admin' then
    insert into public.user_permissions (user_id, organization_id, module, can_view, can_create, can_edit, can_approve, can_upload) values
      (p_user, v_org, 'dashboard',          true, false, false, false, false),
      (p_user, v_org, 'shifts',             true, true,  true,  true,  false),
      (p_user, v_org, 'sales',              true, false, false, false, false),
      (p_user, v_org, 'fuel_supply',        true, true,  true,  false, true),
      (p_user, v_org, 'tank_measurements',  true, true,  false, false, true),
      (p_user, v_org, 'calibrations',       true, true,  false, false, false),
      (p_user, v_org, 'fuel_balances',      true, false, false, false, false),
      (p_user, v_org, 'collections',        true, true,  false, false, true),
      (p_user, v_org, 'documents',          true, false, false, false, true),
      (p_user, v_org, 'employees',          true, false, false, false, false),
      (p_user, v_org, 'notifications',      true, false, false, false, false);
    return;
  end if;

  if p_role = 'operator' then
    insert into public.user_permissions (user_id, organization_id, module, can_view, can_create, can_edit, can_upload) values
      (p_user, v_org, 'dashboard',     true, false, false, false),
      (p_user, v_org, 'shifts',        true, true,  true,  false),
      (p_user, v_org, 'sales',         true, false, false, false),
      (p_user, v_org, 'documents',     true, false, false, true),
      (p_user, v_org, 'notifications', true, false, false, false);
    return;
  end if;

  if p_role = 'accountant' then
    insert into public.user_permissions (user_id, organization_id, module, can_view, can_create, can_edit, can_export, can_upload) values
      (p_user, v_org, 'dashboard',     true, false, false, false, false),
      (p_user, v_org, 'sales',         true, false, false, true,  false),
      (p_user, v_org, 'cashflow',      true, true,  false, true,  false),
      (p_user, v_org, 'pl',            true, false, false, true,  false),
      (p_user, v_org, 'taxes',         true, true,  true,  true,  false),
      (p_user, v_org, 'suppliers',     true, true,  true,  true,  false),
      (p_user, v_org, 'documents',     true, false, false, false, true),
      (p_user, v_org, 'notifications', true, false, false, false, false);
    return;
  end if;

  raise exception 'Unknown role %', p_role;
end;
$$;

------------------------------------------------------------------------------
-- Close-out: compute expected vs. actual from azs_selling and write back.
-- p_session_id : shift_sessions.id
-- p_payload    : jsonb with actual_cash, actual_card, ... (operator inputs)
-- Returns the updated shift_reports row id.
--
-- Falls back to (expected = 0) if azs_selling is not synced into this project.
------------------------------------------------------------------------------
create or replace function public.fingas_close_shift(
  p_session_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session     public.shift_sessions;
  v_expected    numeric(14,2) := 0;
  v_liters      numeric(14,3) := 0;
  v_actual_total numeric(14,2);
  v_diff        numeric(14,2);
  v_liters_diff numeric(14,3) := 0;
  v_status      text;
  v_report_id   uuid;
  v_has_sales   boolean;
  v_ext_station integer;
begin
  select * into v_session from public.shift_sessions where id = p_session_id;
  if not found then
    raise exception 'Shift session not found';
  end if;
  if v_session.operator_user_id <> auth.uid()
     and not public.fingas_has_perm('shifts','can_edit') then
    raise exception 'Not allowed to close this shift';
  end if;

  select external_station_id into v_ext_station
    from public.stations where id = v_session.station_id;

  v_has_sales := exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'azs_selling'
  );

  if v_has_sales and v_ext_station is not null then
    execute format($S$
      select coalesce(sum(s."ShopCost"),0)::numeric, coalesce(sum(s."Volume"),0)::numeric
        from public.azs_selling s
        where s.station_id = $1
          and s."TransactionDatetime" >= $2
          and s."TransactionDatetime" <= coalesce($3, now())
          and not exists (
            select 1 from public.sales_exclusions x
            where x.source_table = 'azs_selling' and x.source_id = s.id::text
          )
    $S$)
    into v_expected, v_liters
    using v_ext_station, v_session.opened_at, now();
  end if;

  v_actual_total := coalesce((p_payload->>'actual_total')::numeric, 0);
  v_diff := v_actual_total - v_expected;

  if abs(v_diff) < 1 then
    v_status := 'ok';
  elsif v_diff < 0 then
    v_status := 'shortage';
  else
    v_status := 'overage';
  end if;

  insert into public.shift_reports (
    shift_session_id, organization_id, station_id, submitted_by,
    actual_cash, actual_card, actual_qr, actual_coupons, actual_total,
    expenses_total, income_total, collection_total, cash_remaining,
    expected_total, expected_liters,
    cash_difference, total_difference, liters_difference,
    result_status, comment
  ) values (
    p_session_id, v_session.organization_id, v_session.station_id, auth.uid(),
    coalesce((p_payload->>'actual_cash')::numeric, 0),
    coalesce((p_payload->>'actual_card')::numeric, 0),
    coalesce((p_payload->>'actual_qr')::numeric, 0),
    coalesce((p_payload->>'actual_coupons')::numeric, 0),
    v_actual_total,
    coalesce((p_payload->>'expenses_total')::numeric, 0),
    coalesce((p_payload->>'income_total')::numeric, 0),
    coalesce((p_payload->>'collection_total')::numeric, 0),
    coalesce((p_payload->>'cash_remaining')::numeric, 0),
    v_expected, v_liters,
    coalesce((p_payload->>'actual_cash')::numeric, 0) - v_expected,
    v_diff, v_liters_diff,
    v_status,
    p_payload->>'comment'
  )
  on conflict (shift_session_id) do update set
    actual_cash = excluded.actual_cash,
    actual_card = excluded.actual_card,
    actual_qr = excluded.actual_qr,
    actual_coupons = excluded.actual_coupons,
    actual_total = excluded.actual_total,
    expected_total = excluded.expected_total,
    expected_liters = excluded.expected_liters,
    cash_difference = excluded.cash_difference,
    total_difference = excluded.total_difference,
    result_status = excluded.result_status,
    comment = excluded.comment,
    updated_at = now()
  returning id into v_report_id;

  update public.shift_sessions
    set status = 'submitted', closed_at = now()
    where id = p_session_id;

  return v_report_id;
end;
$$;

comment on function public.fingas_close_shift(uuid, jsonb) is
  'Blind close-out: operator submits actuals; we compute expected vs azs_selling and write shift_reports.';
