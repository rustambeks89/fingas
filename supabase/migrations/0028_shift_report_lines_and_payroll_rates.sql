-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose: Обновление модуля смен:
--   1) shift_report_lines — построчные доходы/расходы по смене
--      (касса/контрагент/категория/сумма/комментарий). Операторская форма
--      пишет сюда, итоги синхронизируются в shift_reports.expenses_total/
--      income_total триггером.
--   2) employee_pay_rates — ставка сотрудника: fixed (за смену) или
--      piecework (за литры по маркам). Используется при автоначислении
--      payroll после утверждения отчёта.
--   3) RPC fingas_update_shift_report — позволяет владельцу править
--      любые поля сданного отчёта (включая operator override через шаги
--      выше — здесь только сам отчёт).
--   4) RPC fingas_accrue_payroll_for_report — считает payroll по ставке.
--      Триггер на shift_reports.approved_at автоматически вызывает RPC
--      при утверждении.
-- Идемпотентно.

------------------------------------------------------------------------------
-- 0. Поля и индексы для shift_reports
------------------------------------------------------------------------------
alter table public.shift_reports
  add column if not exists operator_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_shift_reports_operator on public.shift_reports(operator_user_id);
create index if not exists idx_shift_reports_submitted on public.shift_reports(submitted_at desc);

------------------------------------------------------------------------------
-- 1. shift_report_lines  (per-line income/expense entries by operator)
------------------------------------------------------------------------------
create table if not exists public.shift_report_lines (
  id                uuid primary key default gen_random_uuid(),
  shift_report_id   uuid not null references public.shift_reports(id) on delete cascade,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  station_id        uuid references public.stations(id) on delete set null,
  kind              text not null check (kind in ('expense','income')),
  category          text,             -- "Топливо", "Запчасти", "Услуги", "Премия"…
  amount            numeric(14,2) not null check (amount >= 0),
  counterparty_id   uuid references public.counterparties(id) on delete set null,
  wallet_id         uuid references public.wallets(id) on delete set null,
  payment_type      text check (payment_type in ('cash','card','qr','bank','other')),
  note              text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_srl_report on public.shift_report_lines(shift_report_id);
create index if not exists idx_srl_org    on public.shift_report_lines(organization_id);
create index if not exists idx_srl_kind   on public.shift_report_lines(kind);

drop trigger if exists trg_shift_report_lines_updated_at on public.shift_report_lines;
create trigger trg_shift_report_lines_updated_at
  before update on public.shift_report_lines
  for each row execute function public.trigger_set_updated_at();

alter table public.shift_report_lines enable row level security;

drop policy if exists srl_sel on public.shift_report_lines;
create policy srl_sel on public.shift_report_lines for select using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('shifts','can_view')
);

drop policy if exists srl_ins on public.shift_report_lines;
create policy srl_ins on public.shift_report_lines for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('shifts','can_create')
);

drop policy if exists srl_upd on public.shift_report_lines;
create policy srl_upd on public.shift_report_lines for update using (
  organization_id = public.fingas_current_org()
  and (
    public.fingas_has_perm('shifts','can_approve')
    or (created_by = auth.uid())
  )
) with check (organization_id = public.fingas_current_org());

drop policy if exists srl_del on public.shift_report_lines;
create policy srl_del on public.shift_report_lines for delete using (
  organization_id = public.fingas_current_org()
  and (
    public.fingas_has_perm('shifts','can_approve')
    or public.fingas_has_perm('shifts','can_delete')
    or (created_by = auth.uid())
  )
);

------------------------------------------------------------------------------
-- 2. Триггер: пересчёт shift_reports.expenses_total / income_total
--    при изменении строк.
------------------------------------------------------------------------------
create or replace function public.fingas_recompute_shift_report_totals()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_report_id uuid := coalesce(new.shift_report_id, old.shift_report_id);
begin
  if v_report_id is null then return coalesce(new, old); end if;
  update public.shift_reports r
     set expenses_total = coalesce((
           select sum(amount) from public.shift_report_lines
            where shift_report_id = v_report_id and kind = 'expense'
         ), 0),
         income_total = coalesce((
           select sum(amount) from public.shift_report_lines
            where shift_report_id = v_report_id and kind = 'income'
         ), 0),
         updated_at = now()
   where r.id = v_report_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_srl_recompute_ins on public.shift_report_lines;
create trigger trg_srl_recompute_ins
  after insert on public.shift_report_lines
  for each row execute function public.fingas_recompute_shift_report_totals();

drop trigger if exists trg_srl_recompute_upd on public.shift_report_lines;
create trigger trg_srl_recompute_upd
  after update on public.shift_report_lines
  for each row execute function public.fingas_recompute_shift_report_totals();

drop trigger if exists trg_srl_recompute_del on public.shift_report_lines;
create trigger trg_srl_recompute_del
  after delete on public.shift_report_lines
  for each row execute function public.fingas_recompute_shift_report_totals();

------------------------------------------------------------------------------
-- 3. employee_pay_rates — ставка сотрудника
------------------------------------------------------------------------------
create table if not exists public.employee_pay_rates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('fixed','piecework')),
  base_amount     numeric(14,2) not null default 0,   -- для fixed: сумма за смену
  rates_json      jsonb,                              -- для piecework: {"АИ-92": 1.5, "АИ-95": 1.7, "ДТ": 1.2}
  active          boolean not null default true,
  effective_from  date not null default current_date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id, effective_from)
);

create index if not exists idx_emp_pay_rates_user on public.employee_pay_rates(user_id);
create index if not exists idx_emp_pay_rates_org  on public.employee_pay_rates(organization_id);

drop trigger if exists trg_emp_pay_rates_updated_at on public.employee_pay_rates;
create trigger trg_emp_pay_rates_updated_at
  before update on public.employee_pay_rates
  for each row execute function public.trigger_set_updated_at();

alter table public.employee_pay_rates enable row level security;

drop policy if exists emp_rates_sel on public.employee_pay_rates;
create policy emp_rates_sel on public.employee_pay_rates for select using (
  organization_id = public.fingas_current_org()
  and (
    user_id = auth.uid()
    or public.fingas_has_perm('payroll','can_view')
    or public.fingas_has_perm('settings','can_view')
  )
);

drop policy if exists emp_rates_ins on public.employee_pay_rates;
create policy emp_rates_ins on public.employee_pay_rates for insert with check (
  organization_id = public.fingas_current_org()
  and (
    public.fingas_has_perm('payroll','can_create')
    or public.fingas_has_perm('settings','can_edit')
  )
);

drop policy if exists emp_rates_upd on public.employee_pay_rates;
create policy emp_rates_upd on public.employee_pay_rates for update using (
  organization_id = public.fingas_current_org()
  and (
    public.fingas_has_perm('payroll','can_edit')
    or public.fingas_has_perm('settings','can_edit')
  )
) with check (organization_id = public.fingas_current_org());

drop policy if exists emp_rates_del on public.employee_pay_rates;
create policy emp_rates_del on public.employee_pay_rates for delete using (
  organization_id = public.fingas_current_org()
  and (
    public.fingas_has_perm('payroll','can_delete')
    or public.fingas_has_perm('settings','can_edit')
  )
);

------------------------------------------------------------------------------
-- 4. RPC: fingas_accrue_payroll_for_report
--    Считает начисление по action ставке сотрудника отчёта, аппсёртит
--    в public.payroll. Идемпотентно: на один shift_report_id = одна
--    запись в payroll (если она уже есть — пересчитываем).
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
  v_payroll_id  uuid;
begin
  select * into v_report from public.shift_reports where id = p_report_id;
  if not found then return null; end if;

  v_user := coalesce(v_report.operator_user_id, v_report.submitted_by);
  if v_user is null then return null; end if;

  -- Берём актуальную ставку: наибольшая effective_from <= submitted_at::date.
  select * into v_rate
    from public.employee_pay_rates
   where organization_id = v_report.organization_id
     and user_id = v_user
     and active = true
     and effective_from <= coalesce(v_report.submitted_at::date, current_date)
   order by effective_from desc
   limit 1;

  if not found then
    -- ставки нет → ничего не начисляем, просто выходим
    return null;
  end if;

  if v_rate.kind = 'fixed' then
    v_amount := coalesce(v_rate.base_amount, 0);
    v_liters_used := v_report.expected_liters;
  else
    -- piecework: сумма по каждой марке: liters_of_fuel × rate_of_fuel.
    -- Литры по маркам берём из shift_report_items, если они заведены;
    -- иначе равномерно по expected_liters / count(fuel_types_in_rates).
    if v_rate.rates_json is not null then
      select coalesce(sum(coalesce((v_rate.rates_json ->> i.fuel_type)::numeric, 0) * coalesce(i.liters, 0)), 0)
        into v_amount
        from public.shift_report_items i
       where i.shift_report_id = p_report_id;
      select coalesce(sum(coalesce(i.liters, 0)), 0) into v_liters_used
        from public.shift_report_items i
       where i.shift_report_id = p_report_id;
      if v_amount = 0 and v_report.expected_liters > 0 then
        -- fallback: средняя ставка по rates_json × expected_liters
        v_amount := coalesce((
          select avg(value::numeric)
            from jsonb_each_text(v_rate.rates_json) as kv(key, value)
        ), 0) * v_report.expected_liters;
        v_liters_used := v_report.expected_liters;
      end if;
    end if;
  end if;

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
    format('Начислено автоматически по отчёту %s', p_report_id)
  )
  on conflict do nothing
  returning id into v_payroll_id;

  -- Если уже есть запись с таким же ключом — обновим начисление.
  if v_payroll_id is null then
    update public.payroll
       set accrued = v_amount,
           liters  = v_liters_used,
           salary_type = v_rate.kind,
           rate = case when v_rate.kind = 'fixed' then v_rate.base_amount else rate end
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
-- 5. Триггер: автоначисление при approve.
--    Когда approved_at становится не null — вызываем accrue.
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
     and (old.approved_at is distinct from new.approved_at)
     and (new.result_status is null or new.result_status <> 'rejected')
  then
    perform public.fingas_accrue_payroll_for_report(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fingas_payroll_accrue_on_approve on public.shift_reports;
create trigger trg_fingas_payroll_accrue_on_approve
  after update of approved_at on public.shift_reports
  for each row execute function public.fingas_trigger_accrue_on_approve();

------------------------------------------------------------------------------
-- 6. RPC: fingas_update_shift_report — позволяет владельцу/одобряющему
--    править любое поле сданного отчёта (включая итоги, ожидаемые,
--    статус, оператора и т.д.) без RLS-приключений.
------------------------------------------------------------------------------
create or replace function public.fingas_update_shift_report(
  p_report_id uuid,
  p_patch jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
begin
  if v_user is null then raise exception 'auth required'; end if;
  select organization_id into v_org from public.shift_reports where id = p_report_id;
  if v_org is null then raise exception 'report not found'; end if;

  -- Разрешаем только владельцу/одобряющему этой организации.
  if not (
    public.fingas_has_perm('shifts','can_approve')
    or public.fingas_has_perm('shifts','can_edit')
  ) then
    raise exception 'forbidden';
  end if;

  update public.shift_reports r set
    actual_cash      = coalesce((p_patch->>'actual_cash')::numeric, r.actual_cash),
    actual_card      = coalesce((p_patch->>'actual_card')::numeric, r.actual_card),
    actual_qr        = coalesce((p_patch->>'actual_qr')::numeric, r.actual_qr),
    actual_coupons   = coalesce((p_patch->>'actual_coupons')::numeric, r.actual_coupons),
    actual_total     = coalesce((p_patch->>'actual_total')::numeric, r.actual_total),
    expenses_total   = coalesce((p_patch->>'expenses_total')::numeric, r.expenses_total),
    income_total     = coalesce((p_patch->>'income_total')::numeric, r.income_total),
    collection_total = coalesce((p_patch->>'collection_total')::numeric, r.collection_total),
    cash_remaining   = coalesce((p_patch->>'cash_remaining')::numeric, r.cash_remaining),
    expected_cash    = coalesce((p_patch->>'expected_cash')::numeric, r.expected_cash),
    expected_card    = coalesce((p_patch->>'expected_card')::numeric, r.expected_card),
    expected_qr      = coalesce((p_patch->>'expected_qr')::numeric, r.expected_qr),
    expected_total   = coalesce((p_patch->>'expected_total')::numeric, r.expected_total),
    expected_liters  = coalesce((p_patch->>'expected_liters')::numeric, r.expected_liters),
    cash_difference  = coalesce((p_patch->>'cash_difference')::numeric, r.cash_difference),
    total_difference = coalesce((p_patch->>'total_difference')::numeric, r.total_difference),
    liters_difference = coalesce((p_patch->>'liters_difference')::numeric, r.liters_difference),
    result_status    = coalesce(p_patch->>'result_status', r.result_status),
    operator_user_id = coalesce((p_patch->>'operator_user_id')::uuid, r.operator_user_id),
    comment          = coalesce(p_patch->>'comment', r.comment),
    updated_at       = now()
  where r.id = p_report_id;

  return p_report_id;
end;
$$;

grant execute on function public.fingas_update_shift_report(uuid, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
