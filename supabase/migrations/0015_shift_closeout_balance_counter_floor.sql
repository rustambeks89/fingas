-- [CREATED BY CODEX - 2026-05-25]
-- Project: Fingas
-- Purpose: Recompute POS shift close-out expectations from the proper source:
-- current/open shifts use azs_selling; archived shifts use azs_balance with
-- only real TRK counter rows. Rows with BeginBalance/EndBalance <= 1_000_000
-- are treated as residual/service records and excluded from liters/revenue.

create or replace function public.fingas_closeout_by_shift_key(
  p_shift_key integer,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org           uuid;
  v_station_id    uuid;
  v_shop_key      integer;
  v_user          uuid := auth.uid();
  v_expected      numeric(14,2) := 0;
  v_liters        numeric(14,3) := 0;
  v_actual_total  numeric(14,2);
  v_actual_cash   numeric(14,2);
  v_diff          numeric(14,2);
  v_status        text;
  v_report_id     uuid;
  v_has_balance   boolean;
  v_has_selling   boolean;
  v_balance_rows  integer := 0;
  v_counter_floor constant numeric := 1000000;
begin
  if v_user is null then
    raise exception 'auth required';
  end if;

  select organization_id, station_id into v_org, v_station_id
    from public.profiles where user_id = v_user limit 1;

  if v_org is null then
    raise exception 'No organization for current user';
  end if;

  if v_station_id is not null then
    select external_station_id into v_shop_key
      from public.stations where id = v_station_id;
  end if;

  v_has_balance := exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'azs_balance'
  );
  v_has_selling := exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'azs_selling'
  );

  if v_has_balance then
    execute format($S$
      select
        coalesce(sum(coalesce(b."EndPrice", 0)), 0)::numeric(14,2),
        coalesce(sum(greatest(coalesce(b."EndBalance", 0) - coalesce(b."BeginBalance", 0), 0)), 0)::numeric(14,3),
        count(*)::integer
      from public.azs_balance b
      where b."ShiftKey" = $1
        and ($2::integer is null or b."ShopKey" = $2)
        and b."BeginBalance" > $3
        and b."EndBalance" > $3
    $S$)
    into v_expected, v_liters, v_balance_rows
    using p_shift_key, v_shop_key, v_counter_floor;
  end if;

  if v_balance_rows = 0 and v_has_selling then
    execute format($S$
      select
        coalesce(sum(s."ShopCost"), 0)::numeric(14,2),
        coalesce(sum(s."Volume"), 0)::numeric(14,3)
      from public.azs_selling s
      where s."ShiftKey" = $1
        and ($2::integer is null or s."ShopKey" = $2)
    $S$)
    into v_expected, v_liters
    using p_shift_key, v_shop_key;
  end if;

  v_actual_cash := coalesce((p_payload->>'actual_cash')::numeric, 0);
  v_actual_total := coalesce((p_payload->>'actual_total')::numeric,
                             v_actual_cash
                             + coalesce((p_payload->>'actual_card')::numeric, 0)
                             + coalesce((p_payload->>'actual_qr')::numeric, 0)
                             + coalesce((p_payload->>'actual_coupons')::numeric, 0));
  v_diff := v_actual_total - v_expected;

  v_status := case
    when abs(v_diff) < 1 then 'ok'
    when v_diff < 0 then 'shortage'
    else 'overage'
  end;

  insert into public.shift_reports (
    external_shift_key, organization_id, station_id, submitted_by,
    actual_cash, actual_card, actual_qr, actual_coupons, actual_total,
    expenses_total, income_total, collection_total, cash_remaining,
    expected_total, expected_liters,
    cash_difference, total_difference, liters_difference,
    result_status, comment
  ) values (
    p_shift_key, v_org, v_station_id, v_user,
    v_actual_cash,
    coalesce((p_payload->>'actual_card')::numeric, 0),
    coalesce((p_payload->>'actual_qr')::numeric, 0),
    coalesce((p_payload->>'actual_coupons')::numeric, 0),
    v_actual_total,
    coalesce((p_payload->>'expenses_total')::numeric, 0),
    coalesce((p_payload->>'income_total')::numeric, 0),
    coalesce((p_payload->>'collection_total')::numeric, 0),
    coalesce((p_payload->>'cash_remaining')::numeric, 0),
    v_expected, v_liters,
    v_actual_cash - v_expected,
    v_diff, 0,
    v_status,
    p_payload->>'comment'
  )
  on conflict (organization_id, station_id, external_shift_key)
  where external_shift_key is not null
  do update set
    actual_cash = excluded.actual_cash,
    actual_card = excluded.actual_card,
    actual_qr = excluded.actual_qr,
    actual_coupons = excluded.actual_coupons,
    actual_total = excluded.actual_total,
    expenses_total = excluded.expenses_total,
    income_total = excluded.income_total,
    collection_total = excluded.collection_total,
    cash_remaining = excluded.cash_remaining,
    expected_total = excluded.expected_total,
    expected_liters = excluded.expected_liters,
    cash_difference = excluded.cash_difference,
    total_difference = excluded.total_difference,
    result_status = excluded.result_status,
    comment = excluded.comment,
    updated_at = now()
  returning id into v_report_id;

  return v_report_id;
end;
$$;

comment on function public.fingas_closeout_by_shift_key(integer, jsonb) is
  'Close-out reconciliation for a POS shift. Uses valid azs_balance rows for archived shifts, falling back to azs_selling for the current/open shift.';
