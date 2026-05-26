-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Business automation triggers:
--   1. On shift_reports insert → auto-create payroll row for the operator
--      (fixed_shift_rate OR piecework × expected_liters).
--   2. On supplier_payments insert → shadow into cashflow as supplier_payment.
--   3. On tax_payments insert → shadow into cashflow as tax.
--   4. On profile pending_approval → notify all owners of the org.
--   5. On shift_reports insert/update → notify owners + admins.
--   6. On cashflow collection pending_confirmation → notify owners.
--
-- All triggers are idempotent (drop+create). Cashflow shadowing is one-way:
-- updating the source does not currently rewrite the cashflow row.

------------------------------------------------------------------------------
-- 1. Auto-payroll on shift close
------------------------------------------------------------------------------
create or replace function public.fingas_auto_payroll_on_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_session public.shift_sessions;
  v_amount  numeric(14,2) := 0;
  v_period  date;
begin
  select * into v_session from public.shift_sessions where id = new.shift_session_id;
  if not found then return new; end if;

  select * into v_profile from public.profiles where user_id = v_session.operator_user_id;
  if not found then return new; end if;

  v_period := coalesce(v_session.opened_at::date, current_date);

  if v_profile.salary_type = 'fixed' then
    v_amount := coalesce(v_profile.fixed_shift_rate, 0);
  elsif v_profile.salary_type = 'piecework' then
    v_amount := coalesce(v_profile.liter_rate, 0) * coalesce(new.expected_liters, 0);
  end if;

  if v_amount <= 0 then
    return new;
  end if;

  insert into public.payroll
    (organization_id, station_id, user_id, shift_session_id, period, salary_type,
     liters, rate, accrued)
    values
    (v_session.organization_id, v_session.station_id, v_session.operator_user_id,
     v_session.id, v_period, v_profile.salary_type,
     case when v_profile.salary_type = 'piecework' then new.expected_liters end,
     case when v_profile.salary_type = 'piecework' then v_profile.liter_rate
          else v_profile.fixed_shift_rate end,
     v_amount)
    on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_fingas_auto_payroll on public.shift_reports;
create trigger trg_fingas_auto_payroll
  after insert on public.shift_reports
  for each row execute function public.fingas_auto_payroll_on_close();

------------------------------------------------------------------------------
-- 2. Shadow supplier_payments → cashflow
------------------------------------------------------------------------------
create or replace function public.fingas_shadow_supplier_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cf_id uuid;
begin
  if new.cashflow_id is not null then
    return new; -- already linked
  end if;
  insert into public.cashflow
    (organization_id, station_id, date, operation_type, amount,
     counterparty_id, note, status, created_by, cashflow_category)
    values
    (new.organization_id, new.station_id, new.date, 'supplier_payment',
     new.amount, new.supplier_id, new.note, 'confirmed', new.created_by,
     'Оплата поставщику')
    returning id into v_cf_id;
  new.cashflow_id := v_cf_id;
  return new;
end;
$$;

drop trigger if exists trg_fingas_shadow_supplier_payment on public.supplier_payments;
create trigger trg_fingas_shadow_supplier_payment
  before insert on public.supplier_payments
  for each row execute function public.fingas_shadow_supplier_payment();

-- And reduce counterparty balance
create or replace function public.fingas_supplier_payment_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.counterparties
    set balance = balance - new.amount
    where id = new.supplier_id;
  return new;
end;
$$;

drop trigger if exists trg_fingas_supplier_balance on public.supplier_payments;
create trigger trg_fingas_supplier_balance
  after insert on public.supplier_payments
  for each row execute function public.fingas_supplier_payment_balance();

------------------------------------------------------------------------------
-- 3. Shadow tax_payments → cashflow
------------------------------------------------------------------------------
create or replace function public.fingas_shadow_tax_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cashflow
    (organization_id, station_id, date, operation_type, amount,
     note, status, created_by, cashflow_category)
    values
    (new.organization_id, new.station_id, new.payment_date, 'tax',
     new.amount, coalesce(new.note, new.tax_type), 'confirmed', new.created_by,
     new.tax_type);
  return new;
end;
$$;

drop trigger if exists trg_fingas_shadow_tax on public.tax_payments;
create trigger trg_fingas_shadow_tax
  after insert on public.tax_payments
  for each row execute function public.fingas_shadow_tax_payment();

------------------------------------------------------------------------------
-- 4. Increase supplier balance when fuel_supply is added
------------------------------------------------------------------------------
create or replace function public.fingas_fuel_supply_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supplier_id is null then
    return new;
  end if;
  update public.counterparties
    set balance = balance + new.total_amount
    where id = new.supplier_id;
  return new;
end;
$$;

drop trigger if exists trg_fingas_fuel_supply_balance on public.fuel_supply;
create trigger trg_fingas_fuel_supply_balance
  after insert on public.fuel_supply
  for each row execute function public.fingas_fuel_supply_balance();

------------------------------------------------------------------------------
-- 5. Notifications generators
--    Helper: notify_owners writes one notifications row per owner of the org.
------------------------------------------------------------------------------
create or replace function public.fingas_notify_owners(
  p_org uuid,
  p_station uuid,
  p_event text,
  p_title text,
  p_body text,
  p_link text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications
    (organization_id, station_id, recipient_user_id, recipient_role,
     event_type, title, body, link)
  select
    p_org, p_station, p.user_id, 'owner',
    p_event, p_title, p_body, p_link
  from public.profiles p
  where p.organization_id = p_org
    and p.role = 'owner'
    and p.status = 'active';
end;
$$;

-- 5a. New employee request → notify owners
create or replace function public.fingas_notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending_approval'
     and new.organization_id is not null
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.organization_id is distinct from new.organization_id
     ) then
    perform public.fingas_notify_owners(
      new.organization_id, null, 'employee_request',
      'Новая заявка сотрудника',
      coalesce(new.full_name, new.email, 'Сотрудник') || ' ждёт одобрения',
      '/employees'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fingas_notify_new_request on public.profiles;
create trigger trg_fingas_notify_new_request
  after insert or update of organization_id, status on public.profiles
  for each row execute function public.fingas_notify_new_request();

-- 5b. Shift submitted → notify owners + admins
create or replace function public.fingas_notify_shift_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_diff numeric;
begin
  v_diff := coalesce(new.total_difference, 0);
  v_status :=
    case
      when new.result_status = 'shortage' then 'Недостача'
      when new.result_status = 'overage'  then 'Излишек'
      when new.result_status = 'ok'       then 'Сошлось'
      else 'Закрыта'
    end;
  perform public.fingas_notify_owners(
    new.organization_id, new.station_id, 'shift_submitted',
    'Смена закрыта: ' || v_status,
    'Расхождение: ' || abs(v_diff)::text,
    '/shifts'
  );
  return new;
end;
$$;

drop trigger if exists trg_fingas_notify_shift_submitted on public.shift_reports;
create trigger trg_fingas_notify_shift_submitted
  after insert on public.shift_reports
  for each row execute function public.fingas_notify_shift_submitted();

-- 5c. Pending collection → notify owners
create or replace function public.fingas_notify_pending_collection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.operation_type = 'collection' and new.status = 'pending_confirmation' then
    perform public.fingas_notify_owners(
      new.organization_id, new.station_id, 'collection_pending',
      'Инкассация на подтверждение',
      'Сумма: ' || new.amount::text,
      '/collections'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fingas_notify_pending_collection on public.cashflow;
create trigger trg_fingas_notify_pending_collection
  after insert on public.cashflow
  for each row execute function public.fingas_notify_pending_collection();

------------------------------------------------------------------------------
-- 6. RPC: owner reviews shift_reports
------------------------------------------------------------------------------
create or replace function public.fingas_review_shift(
  p_report_id uuid,
  p_decision text   -- 'approved' | 'rejected'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.shift_reports;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'decision must be approved or rejected';
  end if;
  select * into v_report from public.shift_reports where id = p_report_id;
  if not found then raise exception 'shift_report not found'; end if;

  if not (public.fingas_is_owner() or public.fingas_has_perm('shifts','can_approve')) then
    raise exception 'not allowed';
  end if;

  update public.shift_reports
     set approved_by = auth.uid(),
         approved_at = now(),
         result_status = case when p_decision = 'rejected' then 'needs_review' else result_status end
   where id = p_report_id;

  update public.shift_sessions
     set status = p_decision
   where id = v_report.shift_session_id;
end;
$$;
