<!--
[CREATED BY CLAUDE CLI - 2026-05-25]
Project: Fingas
Purpose: Database schema reference — Fingas tables vs. MySQL-synced sources.
-->

# Fingas — Database

Two distinct namespaces share the same Postgres schema (`public`):

## A. Fingas application tables (writeable, RLS-protected)

Naming is **neutral** — no `pitstop_` prefix. Pit Stop is just a row in
`stations`. The set lives in `/supabase/migrations/0003_schema.sql`.

| Table                  | Purpose |
|------------------------|---------|
| organizations          | Legal entity / business unit. One owner per org. |
| stations               | Individual gas station (e.g. "Pit Stop"). |
| profiles               | One row per `auth.users`. Role + status + can_login + station/org link. |
| user_permissions       | Toggle matrix: (user_id × module) → can_view/create/edit/delete/approve/export/upload. |
| wallets                | Cash registers, safes, card/bank accounts, owner wallet. |
| counterparties         | Suppliers, customers, government — anyone we settle with. |
| shift_sessions         | Long-lived open/closed shift envelope. |
| shift_reports          | Blind close-out report (1:1 with shift_session). |
| shift_report_items     | Per-nozzle breakdown for a report. |
| fuel_supply            | Fuel inbound from suppliers (liters, price, doc). |
| tank_measurements      | Manual tank dips. `level_cm` and `liters` are separate. |
| calibrations           | TRK calibrations / test pours. |
| sales_exclusions       | Rows in `azs_selling` to exclude from real revenue. |
| cashflow               | Every money movement; `operation_type` ∈ income/expense/transfer/… |
| supplier_payments      | Settlements with suppliers (also written to cashflow). |
| tax_payments           | НДС / НсП / прочее. |
| payroll                | Per-shift or per-period accrual + payout tracking. |
| documents              | Storage-attachment registry (any related row). |
| notifications          | Internal notification center. |

All have `organization_id`. All RLS policies are scoped by org +
toggle-permission. See `0005_rls.sql`.

## B. MySQL-synced source tables (READ-ONLY)

Owned by the Python sync script. The app must **never** write to these.

| Table         | Purpose                                                            |
|---------------|--------------------------------------------------------------------|
| azs_selling   | Raw sales transactions: TransactionDatetime, FuelName, Volume, ShopCost, ShiftKey, station_id, … |
| azs_balance   | Tank balances snapshots: station_id, tank_id, fuel_name, liters, level_cm, measured_at, … |
| (any azs_*)   | Other tables synced from MySQL as needed.                          |

Reads from these go through `v_sales` and `v_fuel_balance` (created by
`0006_views.sql`) which:
- map `station_id` (integer external key) to Fingas `stations.id` (UUID) via
  `stations.external_station_id`, and
- in `v_sales`, exclude rows present in `sales_exclusions`.

RLS for the source tables is read-only (`0007_azs_rls.sql`). Writes are
performed by the sync job using the service role key (bypasses RLS).

## Migrations

Run order, idempotent:

1. `0001_extensions.sql`     — pgcrypto, citext
2. `0002_helpers.sql`        — `trigger_set_updated_at()`
3. `0003_schema.sql`         — all Fingas tables + triggers
4. `0004_auth_helpers.sql`   — `fingas_*` helpers + `fingas_has_perm()`
5. `0005_rls.sql`            — RLS on every Fingas table
6. `0006_views.sql`          — `v_sales`, `v_fuel_balance` (guarded)
7. `0007_azs_rls.sql`        — RLS for azs_* source tables (guarded)
8. `0008_storage_buckets.sql`— Storage buckets + policies
9. `0009_rpc.sql`            — `fingas_apply_role_template`, `fingas_close_shift`
10. (optional) `seed/seed_dev.sql` — dev seed (replace OWNER_AUTH_UUID first)
