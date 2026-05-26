-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Core Fingas application schema. Neutral table names (no pitstop_).
-- DOES NOT touch azs_selling / azs_balance — those are MySQL-synced source
-- tables and must remain unchanged. We only READ from them, see 0006_views.sql.

------------------------------------------------------------------------------
-- organizations
------------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  inn text,
  phone text,
  email text,
  address text,
  owner_user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- stations  (an individual gas station, e.g. "Pit Stop")
------------------------------------------------------------------------------
create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,                -- e.g. 'Pit Stop'
  code text,                         -- optional short code / external key
  city text,
  address text,
  external_station_id integer,       -- mapping to azs_* tables station_id
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stations_org on public.stations(organization_id);
create index if not exists idx_stations_ext on public.stations(external_station_id);

drop trigger if exists trg_stations_updated_at on public.stations;
create trigger trg_stations_updated_at
  before update on public.stations
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- profiles  (one row per auth user + business attributes)
------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  station_id uuid references public.stations(id) on delete set null,
  full_name text,
  phone text,
  email text,
  role text not null default 'operator'
    check (role in ('owner','admin','operator','accountant')),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','active','rejected','blocked')),
  can_login boolean not null default false,
  can_view_all_stations boolean not null default false,
  avatar_url text,
  salary_type text check (salary_type in ('fixed','piecework')),
  fixed_shift_rate numeric(14,2),
  liter_rate numeric(14,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_org on public.profiles(organization_id);
create index if not exists idx_profiles_station on public.profiles(station_id);
create index if not exists idx_profiles_status on public.profiles(status);
create index if not exists idx_profiles_role on public.profiles(role);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.trigger_set_updated_at();

-- Auto-create a minimal pending profile row when a new auth user signs up.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, status, can_login)
  values (new.id, new.email, 'pending_approval', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

------------------------------------------------------------------------------
-- user_permissions  (toggle matrix per user × module)
------------------------------------------------------------------------------
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  module text not null check (module in (
    'dashboard','shifts','sales','fuel_supply','tank_measurements',
    'calibrations','fuel_balances','cashflow','pl','taxes','payroll',
    'suppliers','collections','documents','settings','employees','notifications'
  )),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_approve boolean not null default false,
  can_export boolean not null default false,
  can_upload boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module)
);

create index if not exists idx_user_perm_user on public.user_permissions(user_id);
create index if not exists idx_user_perm_org on public.user_permissions(organization_id);

drop trigger if exists trg_user_permissions_updated_at on public.user_permissions;
create trigger trg_user_permissions_updated_at
  before update on public.user_permissions
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- wallets  (cash registers, safes, bank/card accounts, owner wallet)
------------------------------------------------------------------------------
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('cash_register','safe','card','bank','owner','other')),
  currency text not null default 'KGS',
  balance numeric(16,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wallets_org on public.wallets(organization_id);

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at
  before update on public.wallets
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- counterparties  (suppliers, customers, employees-as-payable, etc.)
------------------------------------------------------------------------------
create table if not exists public.counterparties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  type text not null check (type in ('supplier','customer','employee','government','other')),
  name text not null,
  phone text,
  email text,
  inn text,
  address text,
  balance numeric(16,2) not null default 0,  -- positive = we owe them
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_counterparties_org on public.counterparties(organization_id);
create index if not exists idx_counterparties_type on public.counterparties(type);

drop trigger if exists trg_counterparties_updated_at on public.counterparties;
create trigger trg_counterparties_updated_at
  before update on public.counterparties
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- shift_sessions  (long-lived open/closed shift envelope)
------------------------------------------------------------------------------
create table if not exists public.shift_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  operator_user_id uuid not null references auth.users(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open'
    check (status in ('open','submitted','approved','rejected','closed')),
  external_shift_key integer,         -- map to azs_selling.ShiftKey if available
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shifts_org on public.shift_sessions(organization_id);
create index if not exists idx_shifts_station on public.shift_sessions(station_id);
create index if not exists idx_shifts_operator on public.shift_sessions(operator_user_id);
create index if not exists idx_shifts_status on public.shift_sessions(status);

drop trigger if exists trg_shift_sessions_updated_at on public.shift_sessions;
create trigger trg_shift_sessions_updated_at
  before update on public.shift_sessions
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- shift_reports  (blind close-out report submitted by operator)
------------------------------------------------------------------------------
create table if not exists public.shift_reports (
  id uuid primary key default gen_random_uuid(),
  shift_session_id uuid not null unique references public.shift_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,

  -- operator-entered figures (blind input)
  actual_cash numeric(14,2) not null default 0,
  actual_card numeric(14,2) not null default 0,
  actual_qr numeric(14,2) not null default 0,
  actual_coupons numeric(14,2) not null default 0,
  actual_total numeric(14,2) not null default 0,
  expenses_total numeric(14,2) not null default 0,
  income_total numeric(14,2) not null default 0,
  collection_total numeric(14,2) not null default 0,
  cash_remaining numeric(14,2) not null default 0,

  -- system-computed expectations (filled by RPC after submit)
  expected_cash numeric(14,2),
  expected_card numeric(14,2),
  expected_qr numeric(14,2),
  expected_total numeric(14,2),
  expected_liters numeric(14,3),
  cash_difference numeric(14,2),
  total_difference numeric(14,2),
  liters_difference numeric(14,3),
  result_status text check (result_status in ('ok','shortage','overage','needs_review')),

  z_report_url text,
  comment text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shift_reports_org on public.shift_reports(organization_id);
create index if not exists idx_shift_reports_station on public.shift_reports(station_id);

drop trigger if exists trg_shift_reports_updated_at on public.shift_reports;
create trigger trg_shift_reports_updated_at
  before update on public.shift_reports
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- shift_report_items  (per-nozzle / per-fuel breakdown for the report)
------------------------------------------------------------------------------
create table if not exists public.shift_report_items (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid not null references public.shift_reports(id) on delete cascade,
  fuel_type text,
  nozzle text,
  start_counter numeric(14,3),
  end_counter numeric(14,3),
  liters numeric(14,3),
  price numeric(14,2),
  amount numeric(14,2),
  note text
);

create index if not exists idx_shift_items_report on public.shift_report_items(shift_report_id);

------------------------------------------------------------------------------
-- fuel_supply  (fuel inbound from suppliers)
------------------------------------------------------------------------------
create table if not exists public.fuel_supply (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  supplier_id uuid references public.counterparties(id) on delete set null,
  date date not null,
  fuel_type text not null,
  tank_id uuid,
  doc_number text,
  liters_doc numeric(14,3) not null default 0,
  liters_actual numeric(14,3) not null default 0,
  variance numeric(14,3) generated always as (liters_actual - liters_doc) stored,
  price_per_liter numeric(14,4) not null default 0,
  total_amount numeric(16,2) generated always as (liters_actual * price_per_liter) stored,
  density numeric(8,4),
  temperature numeric(6,2),
  level_before_cm numeric(8,2),
  level_after_cm numeric(8,2),
  driver text,
  vehicle text,
  note text,
  invoice_photo text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fuel_supply_org on public.fuel_supply(organization_id);
create index if not exists idx_fuel_supply_station on public.fuel_supply(station_id);
create index if not exists idx_fuel_supply_date on public.fuel_supply(date);

drop trigger if exists trg_fuel_supply_updated_at on public.fuel_supply;
create trigger trg_fuel_supply_updated_at
  before update on public.fuel_supply
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- tank_measurements  (manual tank dips by admin/operator)
------------------------------------------------------------------------------
create table if not exists public.tank_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  tank_id uuid,
  date date not null,
  time time,
  fuel_type text,
  level_cm numeric(8,2),
  liters numeric(14,3),
  temperature numeric(6,2),
  water_level numeric(8,2),
  measured_by uuid references auth.users(id) on delete set null,
  photo text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tank_meas_station on public.tank_measurements(station_id);
create index if not exists idx_tank_meas_date on public.tank_measurements(date);

------------------------------------------------------------------------------
-- calibrations  (TRK calibrations / test pours)
------------------------------------------------------------------------------
create table if not exists public.calibrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  shift_id uuid references public.shift_sessions(id) on delete set null,
  date date not null,
  time time,
  fuel text,
  volume numeric(14,3),
  trk_number text,
  operator text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_calibrations_station on public.calibrations(station_id);

------------------------------------------------------------------------------
-- sales_exclusions  (rows in azs_selling to exclude from real revenue)
------------------------------------------------------------------------------
create table if not exists public.sales_exclusions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  source_table text not null default 'azs_selling',
  source_id text not null,
  reason text not null check (reason in ('calibration','test_sale','correction','other')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_table, source_id)
);

create index if not exists idx_sales_excl_station on public.sales_exclusions(station_id);

------------------------------------------------------------------------------
-- cashflow  (every money movement: income/expense/transfer/...)
------------------------------------------------------------------------------
create table if not exists public.cashflow (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  date date not null,
  operation_type text not null check (operation_type in (
    'income','expense','transfer','collection','tax',
    'salary','supplier_payment','owner_contribution'
  )),
  payment_type text,
  wallet_from uuid references public.wallets(id) on delete set null,
  wallet_to uuid references public.wallets(id) on delete set null,
  cashflow_category text,
  amount numeric(16,2) not null,
  counterparty_id uuid references public.counterparties(id) on delete set null,
  note text,
  receipt_photo text,
  status text not null default 'confirmed'
    check (status in ('draft','pending_confirmation','confirmed','rejected')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cashflow_org on public.cashflow(organization_id);
create index if not exists idx_cashflow_station on public.cashflow(station_id);
create index if not exists idx_cashflow_date on public.cashflow(date);
create index if not exists idx_cashflow_op on public.cashflow(operation_type);
create index if not exists idx_cashflow_status on public.cashflow(status);

drop trigger if exists trg_cashflow_updated_at on public.cashflow;
create trigger trg_cashflow_updated_at
  before update on public.cashflow
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- supplier_payments  (specific subset of cashflow with extra context)
------------------------------------------------------------------------------
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  supplier_id uuid not null references public.counterparties(id) on delete restrict,
  cashflow_id uuid references public.cashflow(id) on delete set null,
  date date not null,
  amount numeric(16,2) not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_pay_supplier on public.supplier_payments(supplier_id);

------------------------------------------------------------------------------
-- tax_payments
------------------------------------------------------------------------------
create table if not exists public.tax_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  tax_type text not null,
  period_month integer check (period_month between 1 and 12),
  period_year integer,
  amount numeric(16,2) not null,
  payment_date date not null,
  receipt_photo text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tax_org on public.tax_payments(organization_id);
create index if not exists idx_tax_period on public.tax_payments(period_year, period_month);

------------------------------------------------------------------------------
-- payroll  (per-shift or per-period accrual + payout tracking)
------------------------------------------------------------------------------
create table if not exists public.payroll (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  shift_session_id uuid references public.shift_sessions(id) on delete set null,
  period date not null,                       -- shift date or month start
  salary_type text not null check (salary_type in ('fixed','piecework')),
  liters numeric(14,3),
  rate numeric(14,4),
  accrued numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  paid_at timestamptz,
  cashflow_id uuid references public.cashflow(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payroll_user on public.payroll(user_id);
create index if not exists idx_payroll_period on public.payroll(period);

drop trigger if exists trg_payroll_updated_at on public.payroll;
create trigger trg_payroll_updated_at
  before update on public.payroll
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- documents  (attachments for any business entity, stored in Storage)
------------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  related_table text,
  related_id uuid,
  document_type text,
  file_url text not null,
  file_name text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_org on public.documents(organization_id);
create index if not exists idx_documents_related on public.documents(related_table, related_id);

------------------------------------------------------------------------------
-- notifications  (internal notification center; replaceable by push later)
------------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_role text,
  event_type text not null,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notif_recipient on public.notifications(recipient_user_id);
create index if not exists idx_notif_org on public.notifications(organization_id);
create index if not exists idx_notif_unread on public.notifications(is_read) where is_read = false;
