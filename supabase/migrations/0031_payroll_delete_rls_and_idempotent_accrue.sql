-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose:
--   1. Добавить DELETE-политики на payroll и tax_payments — иначе клиент
--      и каскадный триггер из 0030 не могут удалить строки и удаление
--      «тихо» молчит.
--   2. Сделать fingas_accrue_payroll_for_report ИДЕМПОТЕНТНЫМ через
--      уникальный индекс по (organization_id, user_id, shift_session_id,
--      period). Раньше каждое нажатие «Пересчитать» создавало новую строку.
--   3. Дедуплицировать уже накопленные строки.

------------------------------------------------------------------------------
-- 1. RLS DELETE
------------------------------------------------------------------------------
drop policy if exists payroll_del on public.payroll;
create policy payroll_del on public.payroll for delete
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('payroll','can_delete')
  );

drop policy if exists tax_pay_del on public.tax_payments;
create policy tax_pay_del on public.tax_payments for delete
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('taxes','can_delete')
  );

------------------------------------------------------------------------------
-- 2. Дедуп: оставляем по одной авто-строке на (org, user, session, period).
--    Берём ту, что с max(accrued), остальные удаляем.
------------------------------------------------------------------------------
with ranked as (
  select id,
         row_number() over (
           partition by organization_id, user_id, coalesce(shift_session_id::text, ''), period
           order by accrued desc, created_at asc
         ) as rn
    from public.payroll
   where paid = 0
)
delete from public.payroll p
 using ranked r
 where p.id = r.id
   and r.rn > 1;

------------------------------------------------------------------------------
-- 3. Уникальный индекс — только для авто-начислений (paid = 0).
--    Ручные выплаты (paid > 0) не должны конфликтовать.
------------------------------------------------------------------------------
create unique index if not exists uniq_payroll_auto_accrual
  on public.payroll (organization_id, user_id, coalesce(shift_session_id::text, ''), period)
  where paid = 0;

------------------------------------------------------------------------------
-- 4. Идемпотентный RPC: UPSERT через новый индекс.
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
  v_period      date;
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

  v_amount := coalesce(v_amount, 0) + coalesce(v_report.total_difference, 0);
  if v_amount < 0 then v_amount := 0; end if;
  v_period := coalesce(v_report.submitted_at::date, current_date);

  -- Ищем существующую авто-строку и обновляем; иначе вставляем.
  select id into v_payroll_id
    from public.payroll
   where organization_id = v_report.organization_id
     and user_id = v_user
     and coalesce(shift_session_id::text, '') = coalesce(v_report.shift_session_id::text, '')
     and period = v_period
     and paid = 0
   limit 1;

  if v_payroll_id is not null then
    update public.payroll
       set accrued = v_amount,
           liters  = v_liters_used,
           salary_type = v_rate.kind,
           rate = case when v_rate.kind = 'fixed' then v_rate.base_amount else rate end,
           note = format('Авто-начисление по отчёту %s · diff=%s', p_report_id, v_report.total_difference)
     where id = v_payroll_id;
  else
    insert into public.payroll (
      organization_id, station_id, user_id, shift_session_id, period,
      salary_type, liters, rate, accrued, note
    ) values (
      v_report.organization_id,
      v_report.station_id,
      v_user,
      v_report.shift_session_id,
      v_period,
      v_rate.kind,
      v_liters_used,
      case when v_rate.kind = 'fixed' then v_rate.base_amount else null end,
      v_amount,
      format('Авто-начисление по отчёту %s · diff=%s', p_report_id, v_report.total_difference)
    )
    returning id into v_payroll_id;
  end if;

  return v_payroll_id;
end;
$$;

grant execute on function public.fingas_accrue_payroll_for_report(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
