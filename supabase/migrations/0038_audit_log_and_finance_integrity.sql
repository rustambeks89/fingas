-- [CREATED BY CLAUDE CLI - 2026-06-04]
-- Project: Fingas
-- Purpose: финансовая целостность учётной системы АЗС.
--   1) Журнал аудита `audit_log` + универсальный триггер
--      `fingas_record_audit()` на критичных таблицах (cashflow,
--      supplier_payments, tax_payments, payroll, fuel_supply,
--      shift_reports, shift_report_lines). Пишем кто/когда/что/old/new.
--   2) Колонка `deleted_at` на финансовых таблицах — задел под
--      soft-delete. На этом шаге только колонка; политики/views
--      не трогаем, чтобы не сломать рабочую логику.
--   3) Связка cashflow ↔ shift_sessions: колонка `cashflow.shift_session_id`.
--      Без неё нельзя ответить «расход X пришёл с какой смены». Используется
--      в миграции 0039 для автосинхронизации shift_report_lines → cashflow.
--   4) Индексы по типичным управленческим выборкам
--      (история по контрагенту, по поставщику, по смене).
--
-- Идемпотентно. Аддитивно. RLS не меняем — read доступ к новой
-- таблице audit_log ограничен только владельцами.

------------------------------------------------------------------------------
-- 1. audit_log table
------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id              bigserial primary key,
  organization_id uuid,
  station_id      uuid,
  table_name      text not null,
  row_id          uuid,
  operation       text not null check (operation in ('INSERT','UPDATE','DELETE')),
  user_id         uuid references auth.users(id) on delete set null,
  old_data        jsonb,
  new_data        jsonb,
  diff            jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_audit_log_table     on public.audit_log(table_name, created_at desc);
create index if not exists idx_audit_log_row       on public.audit_log(table_name, row_id);
create index if not exists idx_audit_log_user      on public.audit_log(user_id, created_at desc);
create index if not exists idx_audit_log_org_date  on public.audit_log(organization_id, created_at desc);

alter table public.audit_log enable row level security;

-- Owners (и роли с can_approve в Settings) видят журнал в рамках своей org.
drop policy if exists audit_log_sel on public.audit_log;
create policy audit_log_sel on public.audit_log for select using (
  organization_id = public.fingas_current_org()
  and (
    public.fingas_is_owner()
    or public.fingas_has_perm('settings','can_view')
  )
);

-- Никто не пишет в audit_log напрямую — только триггер (SECURITY DEFINER).
-- На INSERT/UPDATE/DELETE через клиента — отказ.
drop policy if exists audit_log_ins on public.audit_log;
create policy audit_log_ins on public.audit_log for insert with check (false);

drop policy if exists audit_log_upd on public.audit_log;
create policy audit_log_upd on public.audit_log for update using (false);

drop policy if exists audit_log_del on public.audit_log;
create policy audit_log_del on public.audit_log for delete using (false);

------------------------------------------------------------------------------
-- 2. Общий триггер записи в audit_log
--    Реализован как одна функция; колонка organization_id берётся из NEW/OLD
--    если она там есть, иначе null. Diff = jsonb-difference NEW vs OLD.
------------------------------------------------------------------------------
create or replace function public.fingas_record_audit()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_org uuid;
  v_station uuid;
  v_row uuid;
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  -- Извлекаем organization_id / station_id / id, если они есть в строке.
  if v_new ? 'organization_id' then v_org := (v_new->>'organization_id')::uuid;
  elsif v_old ? 'organization_id' then v_org := (v_old->>'organization_id')::uuid;
  end if;

  if v_new ? 'station_id' then v_station := nullif(v_new->>'station_id','')::uuid;
  elsif v_old ? 'station_id' then v_station := nullif(v_old->>'station_id','')::uuid;
  end if;

  if v_new ? 'id' then v_row := (v_new->>'id')::uuid;
  elsif v_old ? 'id' then v_row := (v_old->>'id')::uuid;
  end if;

  -- Diff: ключи, изменившиеся в UPDATE. Для INSERT/DELETE — null.
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('old', v_old->key, 'new', v_new->key))
      into v_diff
      from jsonb_object_keys(v_new) key
     where coalesce(v_new->key, 'null'::jsonb) is distinct from coalesce(v_old->key, 'null'::jsonb)
       and key not in ('updated_at','created_at');
  end if;

  insert into public.audit_log
    (organization_id, station_id, table_name, row_id, operation, user_id,
     old_data, new_data, diff)
  values
    (v_org, v_station, tg_table_name, v_row, tg_op, auth.uid(),
     v_old, v_new, v_diff);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

------------------------------------------------------------------------------
-- 3. Навешиваем триггер на финансово-критичные таблицы
--    AFTER trigger гарантирует, что мы пишем уже совершённое изменение.
--    Для DELETE используем BEFORE — иначе old к моменту вызова уже
--    может быть очищена каскадами.
------------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_tables text[] := array[
    'cashflow',
    'supplier_payments',
    'tax_payments',
    'payroll',
    'fuel_supply',
    'shift_reports',
    'shift_report_lines'
  ];
begin
  foreach v_table in array v_tables loop
    if not exists (select 1 from information_schema.tables
                    where table_schema = 'public' and table_name = v_table) then
      continue;
    end if;

    execute format(
      'drop trigger if exists trg_fingas_audit_iud on public.%I', v_table);
    execute format(
      'create trigger trg_fingas_audit_iud
         after insert or update on public.%I
         for each row execute function public.fingas_record_audit()',
      v_table);

    execute format(
      'drop trigger if exists trg_fingas_audit_del on public.%I', v_table);
    execute format(
      'create trigger trg_fingas_audit_del
         before delete on public.%I
         for each row execute function public.fingas_record_audit()',
      v_table);
  end loop;
end$$;

------------------------------------------------------------------------------
-- 4. Soft-delete колонки. Только колонка + индекс. Существующие RLS и
--    клиентский код пока ничего не фильтруют по deleted_at — это задел.
--    Соответствующий UI/сервисы будут переведены на view в отдельном
--    шаге, после ручной проверки журнала аудита.
------------------------------------------------------------------------------
alter table public.cashflow           add column if not exists deleted_at timestamptz;
alter table public.supplier_payments  add column if not exists deleted_at timestamptz;
alter table public.tax_payments       add column if not exists deleted_at timestamptz;
alter table public.payroll            add column if not exists deleted_at timestamptz;
alter table public.fuel_supply        add column if not exists deleted_at timestamptz;

create index if not exists idx_cashflow_deleted_at          on public.cashflow(deleted_at) where deleted_at is null;
create index if not exists idx_supplier_payments_deleted_at on public.supplier_payments(deleted_at) where deleted_at is null;
create index if not exists idx_tax_payments_deleted_at      on public.tax_payments(deleted_at) where deleted_at is null;
create index if not exists idx_payroll_deleted_at           on public.payroll(deleted_at) where deleted_at is null;
create index if not exists idx_fuel_supply_deleted_at       on public.fuel_supply(deleted_at) where deleted_at is null;

------------------------------------------------------------------------------
-- 5. Связь cashflow ↔ shift_sessions.
--    Без этой колонки нельзя ответить «какая смена породила этот расход».
--    Используется автосинхронизацией shift_report_lines → cashflow
--    (миграция 0039).
------------------------------------------------------------------------------
alter table public.cashflow
  add column if not exists shift_session_id uuid references public.shift_sessions(id) on delete set null;

create index if not exists idx_cashflow_shift_session on public.cashflow(shift_session_id)
  where shift_session_id is not null;

-- Также фиксируем источник, из которого пришла запись cashflow.
-- Удобно для отчётов (например, отфильтровать «авто-созданные из смены»)
-- и для защиты от ручного редактирования авто-записей.
alter table public.cashflow
  add column if not exists source text;

------------------------------------------------------------------------------
-- 6. Индексы под управленческие выборки
------------------------------------------------------------------------------
-- История операций по контрагенту в карточке поставщика/клиента
create index if not exists idx_cashflow_counterparty_date
  on public.cashflow(counterparty_id, date desc)
  where counterparty_id is not null;

-- Журнал по дате — главная страница и Cashflow-экран используют
-- сортировку по дате, период обычно ограничен.
create index if not exists idx_cashflow_org_date
  on public.cashflow(organization_id, date desc);

-- История закупок по поставщику
create index if not exists idx_fuel_supply_supplier_date
  on public.fuel_supply(supplier_id, date desc)
  where supplier_id is not null;

-- Зарплатный реестр по периоду/сотруднику
create index if not exists idx_payroll_period_user
  on public.payroll(period desc, user_id);

-- shift_sessions: список смен в обратном хронологическом порядке
create index if not exists idx_shift_sessions_opened_at
  on public.shift_sessions(opened_at desc);

------------------------------------------------------------------------------
-- 7. tax_payments: соответствие cashflow_id в обе стороны — уже есть индекс
--    в 0030. Дублируем deleted_at-индексом выше.
------------------------------------------------------------------------------

notify pgrst, 'reload schema';
