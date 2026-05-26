-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Align shift_reports with the reality of the AZS/SNK system —
-- shifts are opened automatically on the POS, written into MySQL, and synced
-- into azs_selling as ShiftKey. The app NEVER opens a shift; it only does
-- close-out reconciliation (cash count vs expected sales).
--
-- Changes:
--   1. Allow shift_reports rows without a shift_session_id (legacy column).
--   2. Add external_shift_key (matches azs_selling.ShiftKey).
--   3. Unique (org, station, shift_key) so each shift has at most one report.
--   4. New RPC fingas_closeout_by_shift_key(p_shift_key, p_payload jsonb).
--
-- The old fingas_close_shift(session_id) RPC stays as-is for back-compat.

alter table public.shift_reports
  add column if not exists external_shift_key integer;

alter table public.shift_reports
  alter column shift_session_id drop not null;

create unique index if not exists ux_shift_reports_external_key
  on public.shift_reports (organization_id, station_id, external_shift_key)
  where external_shift_key is not null;

------------------------------------------------------------------------------
-- RPC: close-out by ShiftKey
--   * Looks up caller's org + station from profiles.
--   * Resolves ShopKey via stations.external_station_id (optional filter).
--   * Sums azs_selling for ShiftKey to compute expected revenue + liters.
--   * Upserts into shift_reports keyed on (org, station, external_shift_key).
------------------------------------------------------------------------------
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
  v_has_selling   boolean;
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

  v_has_selling := exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'azs_selling'
  );

  if v_has_selling then
    execute format($S$
      select coalesce(sum(s."ShopCost"),0)::numeric(14,2),
             coalesce(sum(s."Volume"),0)::numeric(14,3)
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
  'Close-out reconciliation for an automatically-opened POS shift (azs_selling.ShiftKey). Upserts shift_reports.';
