-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose:
--   1. Авто-утверждение сменного отчёта сразу при сдаче — больше не нужен
--      отдельный шаг approve, владелец может править через RPC
--      fingas_update_shift_report если оператор ошибся.
--   2. Автоначисление payroll: для сдельной ставки берём per-fuel литры из
--      azs_balance по ShiftKey, умножаем на ставку по марке. Плюс прибавляем
--      total_difference (со знаком) — недостача уменьшает зарплату, излишек
--      увеличивает.
--   3. Триггер payroll-начисления теперь срабатывает и на INSERT с approved_at,
--      не только на UPDATE.

------------------------------------------------------------------------------
-- 1. Closeout RPC: авто-approve + operator_user_id
------------------------------------------------------------------------------
create or replace function public.fingas_closeout_by_shift_key(
  p_shift_key integer,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
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
        coalesce(sum(greatest(coalesce(b."EndBalance",0) - coalesce(b."BeginBalance",0), 0) * coalesce(b."EndPrice", 0)), 0)::numeric(14,2),
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
    external_shift_key, organization_id, station_id,
    submitted_by, operator_user_id,
    actual_cash, actual_card, actual_qr, actual_coupons, actual_total,
    expenses_total, income_total, collection_total, cash_remaining,
    expected_total, expected_liters,
    cash_difference, total_difference, liters_difference,
    result_status, comment,
    approved_by, approved_at
  ) values (
    p_shift_key, v_org, v_station_id,
    v_user, v_user,
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
    p_payload->>'comment',
    v_user, now()
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
    operator_user_id = coalesce(public.shift_reports.operator_user_id, excluded.operator_user_id),
    approved_by = coalesce(public.shift_reports.approved_by, excluded.approved_by),
    approved_at = coalesce(public.shift_reports.approved_at, excluded.approved_at),
    updated_at = now()
  returning id into v_report_id;

  return v_report_id;
end;
$$;

------------------------------------------------------------------------------
-- 2. Улучшенный fingas_accrue_payroll_for_report:
--    piecework → per-fuel литры из azs_balance × per-fuel ставки
--    плюс total_difference (со знаком).
------------------------------------------------------------------------------
create or replace function public.fingas_accrue_payroll_for_report(
  p_report_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_report      public.shift_reports%rowtype;
  v_user        uuid;
  v_rate        public.employee_pay_rates%rowtype;
  v_amount      numeric(14,2) := 0;
  v_liters_used numeric(14,3) := 0;
  v_shop_key    integer;
  v_payroll_id  uuid;
  v_counter_floor constant numeric := 1000000;
begin
  select * into v_report from public.shift_reports where id = p_report_id;
  if not found then return null; end if;

  v_user := coalesce(v_report.operator_user_id, v_report.submitted_by);
  if v_user is null then return null; end if;

  select * into v_rate
    from public.employee_pay_rates
   where organization_id = v_report.organization_id
     and user_id = v_user
     and active = true
     and effective_from <= coalesce(v_report.submitted_at::date, current_date)
   order by effective_from desc
   limit 1;

  if not found then
    return null;
  end if;

  if v_rate.kind = 'fixed' then
    v_amount := coalesce(v_rate.base_amount, 0);
    v_liters_used := v_report.expected_liters;
  else
    -- piecework: ищем литры по маркам в azs_balance/azs_selling для ShiftKey
    select external_station_id into v_shop_key
      from public.stations where id = v_report.station_id;

    if exists (select 1 from information_schema.tables
                where table_schema='public' and table_name='azs_balance') then
      execute format($S$
        select
          coalesce(sum(
            greatest(coalesce(b."EndBalance",0) - coalesce(b."BeginBalance",0), 0)
            * coalesce(($1::jsonb ->> b."FuelName")::numeric, 0)
          ), 0)::numeric(14,2),
          coalesce(sum(greatest(coalesce(b."EndBalance",0) - coalesce(b."BeginBalance",0), 0)), 0)::numeric(14,3)
        from public.azs_balance b
        where b."ShiftKey" = $2
          and ($3::integer is null or b."ShopKey" = $3)
          and b."BeginBalance" > $4
          and b."EndBalance" > $4
      $S$)
      into v_amount, v_liters_used
      using v_rate.rates_json, v_report.external_shift_key, v_shop_key, v_counter_floor;
    end if;

    if (v_amount is null or v_amount = 0)
       and exists (select 1 from information_schema.tables
                    where table_schema='public' and table_name='azs_selling') then
      execute format($S$
        select
          coalesce(sum(coalesce(s."Volume",0) * coalesce(($1::jsonb ->> s."FuelName")::numeric, 0)), 0)::numeric(14,2),
          coalesce(sum(coalesce(s."Volume",0)), 0)::numeric(14,3)
        from public.azs_selling s
        where s."ShiftKey" = $2
          and ($3::integer is null or s."ShopKey" = $3)
      $S$)
      into v_amount, v_liters_used
      using v_rate.rates_json, v_report.external_shift_key, v_shop_key;
    end if;
  end if;

  -- Плюс расхождение по кассе (со знаком). Недостача уменьшает, излишек
  -- увеличивает зарплату — оператор сам отвечает за расхождения по кассе.
  v_amount := coalesce(v_amount, 0) + coalesce(v_report.total_difference, 0);
  if v_amount < 0 then v_amount := 0; end if;

  -- Upsert по (organization_id, user_id, period) — одна запись на отчёт-день.
  insert into public.payroll (
    organization_id, station_id, user_id, shift_session_id, period,
    salary_type, liters, rate, accrued, note
  ) values (
    v_report.organization_id,
    v_report.station_id,
    v_user,
    v_report.shift_session_id,
    coalesce(v_report.submitted_at::date, current_date),
    v_rate.kind,
    v_liters_used,
    case when v_rate.kind = 'fixed' then v_rate.base_amount else null end,
    v_amount,
    format('Авто-начисление по отчёту %s · diff=%s', p_report_id, v_report.total_difference)
  )
  on conflict do nothing
  returning id into v_payroll_id;

  if v_payroll_id is null then
    update public.payroll
       set accrued = v_amount,
           liters  = v_liters_used,
           salary_type = v_rate.kind,
           rate = case when v_rate.kind = 'fixed' then v_rate.base_amount else rate end,
           note = format('Авто-начисление по отчёту %s · diff=%s', p_report_id, v_report.total_difference)
     where organization_id = v_report.organization_id
       and user_id = v_user
       and coalesce(shift_session_id::text, '') = coalesce(v_report.shift_session_id::text, '')
       and period = coalesce(v_report.submitted_at::date, current_date)
     returning id into v_payroll_id;
  end if;

  return v_payroll_id;
end;
$$;

grant execute on function public.fingas_accrue_payroll_for_report(uuid) to anon, authenticated, service_role;

------------------------------------------------------------------------------
-- 3. Триггер начисления — теперь и на INSERT с approved_at.
------------------------------------------------------------------------------
create or replace function public.fingas_trigger_accrue_on_approve()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if (new.approved_at is not null)
     and (new.result_status is null or new.result_status <> 'rejected')
     and (tg_op = 'INSERT' or old.approved_at is distinct from new.approved_at)
  then
    perform public.fingas_accrue_payroll_for_report(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fingas_payroll_accrue_on_approve on public.shift_reports;
create trigger trg_fingas_payroll_accrue_on_approve
  after insert or update of approved_at on public.shift_reports
  for each row execute function public.fingas_trigger_accrue_on_approve();

notify pgrst, 'reload schema';
