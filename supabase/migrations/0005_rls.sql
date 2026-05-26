-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Row Level Security on every business table.
--
-- Cross-cutting rules:
--   * Owners have full access within their organization.
--   * Other users must satisfy: status='active' AND can_login=true AND
--     fingas_has_perm(<module>, 'can_view'/'can_create'/...).
--   * Users only see rows of their own organization_id.
--   * If user.can_view_all_stations = false, station_id must equal their own.
--
-- For the MySQL-synced source tables (azs_selling, azs_balance) we enable RLS
-- with READ-ONLY policies. INSERT/UPDATE/DELETE is reserved for the service
-- role (the python sync script). See 0007_azs_rls.sql for those.

------------------------------------------------------------------------------
-- Enable RLS on every business table
------------------------------------------------------------------------------
alter table public.organizations    enable row level security;
alter table public.stations         enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_permissions enable row level security;
alter table public.wallets          enable row level security;
alter table public.counterparties   enable row level security;
alter table public.shift_sessions   enable row level security;
alter table public.shift_reports    enable row level security;
alter table public.shift_report_items enable row level security;
alter table public.fuel_supply      enable row level security;
alter table public.tank_measurements enable row level security;
alter table public.calibrations     enable row level security;
alter table public.sales_exclusions enable row level security;
alter table public.cashflow         enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.tax_payments     enable row level security;
alter table public.payroll          enable row level security;
alter table public.documents        enable row level security;
alter table public.notifications    enable row level security;

------------------------------------------------------------------------------
-- profiles  (special: user must always read own row; owner reads org)
------------------------------------------------------------------------------
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select
  using (user_id = auth.uid() or public.fingas_is_owner());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    -- block self-promotion: role/status/can_login changes require owner
    and role = (select role from public.profiles p where p.user_id = auth.uid())
    and status = (select status from public.profiles p where p.user_id = auth.uid())
    and can_login = (select can_login from public.profiles p where p.user_id = auth.uid())
    and can_view_all_stations = (select can_view_all_stations from public.profiles p where p.user_id = auth.uid())
  );

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert
  with check (user_id = auth.uid());

drop policy if exists profiles_owner_manage on public.profiles;
create policy profiles_owner_manage on public.profiles
  for all
  using (
    public.fingas_is_owner()
    and organization_id = public.fingas_current_org()
  )
  with check (
    public.fingas_is_owner()
    and organization_id = public.fingas_current_org()
  );

------------------------------------------------------------------------------
-- organizations  (owner sees own; everyone else sees their own organization)
------------------------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select
  using (id = public.fingas_current_org());

drop policy if exists organizations_owner_all on public.organizations;
create policy organizations_owner_all on public.organizations
  for all
  using (public.fingas_is_owner() and id = public.fingas_current_org())
  with check (public.fingas_is_owner() and id = public.fingas_current_org());

------------------------------------------------------------------------------
-- stations
------------------------------------------------------------------------------
drop policy if exists stations_select on public.stations;
create policy stations_select on public.stations
  for select
  using (
    organization_id = public.fingas_current_org()
    and (
      public.fingas_can_view_all_stations()
      or id = public.fingas_current_station()
    )
  );

drop policy if exists stations_owner_all on public.stations;
create policy stations_owner_all on public.stations
  for all
  using (public.fingas_is_owner() and organization_id = public.fingas_current_org())
  with check (public.fingas_is_owner() and organization_id = public.fingas_current_org());

------------------------------------------------------------------------------
-- user_permissions  (only owner can read/write; user can read own row)
------------------------------------------------------------------------------
drop policy if exists user_perm_self_select on public.user_permissions;
create policy user_perm_self_select on public.user_permissions
  for select
  using (user_id = auth.uid() or public.fingas_is_owner());

drop policy if exists user_perm_owner_all on public.user_permissions;
create policy user_perm_owner_all on public.user_permissions
  for all
  using (public.fingas_is_owner() and organization_id = public.fingas_current_org())
  with check (public.fingas_is_owner() and organization_id = public.fingas_current_org());

------------------------------------------------------------------------------
-- wallets  (settings module gates create/edit; everyone in org can view)
------------------------------------------------------------------------------
drop policy if exists wallets_select on public.wallets;
create policy wallets_select on public.wallets
  for select
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('cashflow','can_view')
  );

drop policy if exists wallets_write on public.wallets;
create policy wallets_write on public.wallets
  for all
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('settings','can_edit')
  )
  with check (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('settings','can_edit')
  );

------------------------------------------------------------------------------
-- counterparties  (suppliers module)
------------------------------------------------------------------------------
drop policy if exists counterparties_select on public.counterparties;
create policy counterparties_select on public.counterparties
  for select
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_view')
  );

drop policy if exists counterparties_insert on public.counterparties;
create policy counterparties_insert on public.counterparties
  for insert
  with check (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_create')
  );

drop policy if exists counterparties_update on public.counterparties;
create policy counterparties_update on public.counterparties
  for update
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_edit')
  )
  with check (organization_id = public.fingas_current_org());

drop policy if exists counterparties_delete on public.counterparties;
create policy counterparties_delete on public.counterparties
  for delete
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_delete')
  );

------------------------------------------------------------------------------
-- shift_sessions
------------------------------------------------------------------------------
drop policy if exists shift_sessions_select on public.shift_sessions;
create policy shift_sessions_select on public.shift_sessions
  for select
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('shifts','can_view')
    and (
      public.fingas_can_view_all_stations()
      or station_id = public.fingas_current_station()
      or operator_user_id = auth.uid()
    )
  );

drop policy if exists shift_sessions_insert on public.shift_sessions;
create policy shift_sessions_insert on public.shift_sessions
  for insert
  with check (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('shifts','can_create')
  );

drop policy if exists shift_sessions_update on public.shift_sessions;
create policy shift_sessions_update on public.shift_sessions
  for update
  using (
    organization_id = public.fingas_current_org()
    and (
      public.fingas_has_perm('shifts','can_edit')
      or (operator_user_id = auth.uid() and status = 'open')
    )
  )
  with check (organization_id = public.fingas_current_org());

------------------------------------------------------------------------------
-- shift_reports + items
------------------------------------------------------------------------------
drop policy if exists shift_reports_select on public.shift_reports;
create policy shift_reports_select on public.shift_reports
  for select
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('shifts','can_view')
    and (
      public.fingas_can_view_all_stations()
      or station_id = public.fingas_current_station()
      or submitted_by = auth.uid()
    )
  );

drop policy if exists shift_reports_insert on public.shift_reports;
create policy shift_reports_insert on public.shift_reports
  for insert
  with check (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('shifts','can_create')
  );

drop policy if exists shift_reports_update on public.shift_reports;
create policy shift_reports_update on public.shift_reports
  for update
  using (
    organization_id = public.fingas_current_org()
    and (
      public.fingas_has_perm('shifts','can_approve')
      or (submitted_by = auth.uid() and approved_at is null)
    )
  )
  with check (organization_id = public.fingas_current_org());

drop policy if exists shift_items_select on public.shift_report_items;
create policy shift_items_select on public.shift_report_items
  for select
  using (
    exists (
      select 1 from public.shift_reports r
      where r.id = shift_report_id
        and r.organization_id = public.fingas_current_org()
        and public.fingas_has_perm('shifts','can_view')
    )
  );

drop policy if exists shift_items_write on public.shift_report_items;
create policy shift_items_write on public.shift_report_items
  for all
  using (
    exists (
      select 1 from public.shift_reports r
      where r.id = shift_report_id
        and r.organization_id = public.fingas_current_org()
        and (
          public.fingas_has_perm('shifts','can_edit')
          or (r.submitted_by = auth.uid() and r.approved_at is null)
        )
    )
  )
  with check (
    exists (
      select 1 from public.shift_reports r
      where r.id = shift_report_id
        and r.organization_id = public.fingas_current_org()
    )
  );

------------------------------------------------------------------------------
-- Generic CRUD helper macro pattern:
--   For tables with (organization_id, station_id, module=X) we install 4
--   policies: select/insert/update/delete gated by fingas_has_perm.
-- Implemented manually below for clarity.
------------------------------------------------------------------------------

-- fuel_supply
drop policy if exists fuel_supply_sel on public.fuel_supply;
create policy fuel_supply_sel on public.fuel_supply for select using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('fuel_supply','can_view')
  and (public.fingas_can_view_all_stations() or station_id = public.fingas_current_station())
);
drop policy if exists fuel_supply_ins on public.fuel_supply;
create policy fuel_supply_ins on public.fuel_supply for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('fuel_supply','can_create')
);
drop policy if exists fuel_supply_upd on public.fuel_supply;
create policy fuel_supply_upd on public.fuel_supply for update using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('fuel_supply','can_edit')
) with check (organization_id = public.fingas_current_org());
drop policy if exists fuel_supply_del on public.fuel_supply;
create policy fuel_supply_del on public.fuel_supply for delete using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('fuel_supply','can_delete')
);

-- tank_measurements
drop policy if exists tank_meas_sel on public.tank_measurements;
create policy tank_meas_sel on public.tank_measurements for select using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('tank_measurements','can_view')
  and (public.fingas_can_view_all_stations() or station_id = public.fingas_current_station())
);
drop policy if exists tank_meas_ins on public.tank_measurements;
create policy tank_meas_ins on public.tank_measurements for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('tank_measurements','can_create')
);
drop policy if exists tank_meas_upd on public.tank_measurements;
create policy tank_meas_upd on public.tank_measurements for update using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('tank_measurements','can_edit')
) with check (organization_id = public.fingas_current_org());
drop policy if exists tank_meas_del on public.tank_measurements;
create policy tank_meas_del on public.tank_measurements for delete using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('tank_measurements','can_delete')
);

-- calibrations
drop policy if exists calib_sel on public.calibrations;
create policy calib_sel on public.calibrations for select using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('calibrations','can_view')
  and (public.fingas_can_view_all_stations() or station_id = public.fingas_current_station())
);
drop policy if exists calib_ins on public.calibrations;
create policy calib_ins on public.calibrations for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('calibrations','can_create')
);
drop policy if exists calib_upd on public.calibrations;
create policy calib_upd on public.calibrations for update using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('calibrations','can_edit')
) with check (organization_id = public.fingas_current_org());
drop policy if exists calib_del on public.calibrations;
create policy calib_del on public.calibrations for delete using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('calibrations','can_delete')
);

-- sales_exclusions  (uses sales module permissions)
drop policy if exists sales_excl_sel on public.sales_exclusions;
create policy sales_excl_sel on public.sales_exclusions for select using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('sales','can_view')
);
drop policy if exists sales_excl_ins on public.sales_exclusions;
create policy sales_excl_ins on public.sales_exclusions for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('sales','can_edit')
);
drop policy if exists sales_excl_del on public.sales_exclusions;
create policy sales_excl_del on public.sales_exclusions for delete using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('sales','can_delete')
);

-- cashflow
drop policy if exists cashflow_sel on public.cashflow;
create policy cashflow_sel on public.cashflow for select using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('cashflow','can_view')
  and (public.fingas_can_view_all_stations() or station_id is null or station_id = public.fingas_current_station())
);
drop policy if exists cashflow_ins on public.cashflow;
create policy cashflow_ins on public.cashflow for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('cashflow','can_create')
);
drop policy if exists cashflow_upd on public.cashflow;
create policy cashflow_upd on public.cashflow for update using (
  organization_id = public.fingas_current_org()
  and (
    public.fingas_has_perm('cashflow','can_edit')
    or (public.fingas_has_perm('collections','can_approve') and operation_type = 'collection')
  )
) with check (organization_id = public.fingas_current_org());
drop policy if exists cashflow_del on public.cashflow;
create policy cashflow_del on public.cashflow for delete using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('cashflow','can_delete')
);

-- supplier_payments
drop policy if exists supplier_pay_sel on public.supplier_payments;
create policy supplier_pay_sel on public.supplier_payments for select using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('suppliers','can_view')
);
drop policy if exists supplier_pay_ins on public.supplier_payments;
create policy supplier_pay_ins on public.supplier_payments for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('suppliers','can_create')
);

-- tax_payments
drop policy if exists tax_pay_sel on public.tax_payments;
create policy tax_pay_sel on public.tax_payments for select using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('taxes','can_view')
);
drop policy if exists tax_pay_ins on public.tax_payments;
create policy tax_pay_ins on public.tax_payments for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('taxes','can_create')
);
drop policy if exists tax_pay_upd on public.tax_payments;
create policy tax_pay_upd on public.tax_payments for update using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('taxes','can_edit')
) with check (organization_id = public.fingas_current_org());
drop policy if exists tax_pay_del on public.tax_payments;
create policy tax_pay_del on public.tax_payments for delete using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('taxes','can_delete')
);

-- payroll  (user reads own; owner/payroll-perm reads all)
drop policy if exists payroll_sel on public.payroll;
create policy payroll_sel on public.payroll for select using (
  organization_id = public.fingas_current_org()
  and (
    user_id = auth.uid()
    or public.fingas_has_perm('payroll','can_view')
  )
);
drop policy if exists payroll_ins on public.payroll;
create policy payroll_ins on public.payroll for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('payroll','can_create')
);
drop policy if exists payroll_upd on public.payroll;
create policy payroll_upd on public.payroll for update using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('payroll','can_edit')
) with check (organization_id = public.fingas_current_org());

-- documents
drop policy if exists documents_sel on public.documents;
create policy documents_sel on public.documents for select using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('documents','can_view')
);
drop policy if exists documents_ins on public.documents;
create policy documents_ins on public.documents for insert with check (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('documents','can_upload')
);
drop policy if exists documents_del on public.documents;
create policy documents_del on public.documents for delete using (
  organization_id = public.fingas_current_org()
  and public.fingas_has_perm('documents','can_delete')
);

-- notifications  (user reads own; system writes via service role)
drop policy if exists notif_sel on public.notifications;
create policy notif_sel on public.notifications for select using (
  recipient_user_id = auth.uid()
  or (
    organization_id = public.fingas_current_org()
    and public.fingas_is_owner()
  )
);
drop policy if exists notif_upd on public.notifications;
create policy notif_upd on public.notifications for update using (
  recipient_user_id = auth.uid()
) with check (recipient_user_id = auth.uid());
