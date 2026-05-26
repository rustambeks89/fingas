<!--
[CREATED BY CLAUDE CLI - 2026-05-25]
Project: Fingas
Purpose: Hands-off contract between the on-station MySQL DB and Supabase.
-->

# Fingas — MySQL → Supabase sync

Sales and fuel balances originate in the **local MySQL database** of the
АСУ/СНК АЗС controller installed on the station. A separate Python sync
service (not in this repo) periodically pulls fresh rows and writes them
into Supabase tables prefixed with `azs_`.

## Contract

- **Owning side:** Python sync job. Uses the Supabase **service_role** key
  (bypasses RLS).
- **Tables touched by sync:** `public.azs_selling`, `public.azs_balance`,
  and any future `public.azs_*`.
- For archived shift history, the sync must also populate date columns on
  `public.azs_balance`:
  - `measured_at` — business timestamp of the balance snapshot
  - `shift_started_at` — optional source shift start time
  - `shift_ended_at` — optional source shift end time
  `synced_at` is only the replication timestamp and must not be used as the
  archive shift date in the UI.
- **The Fingas app:**
  - **Never** writes to any `azs_*` table.
  - Reads either via direct service-table SELECT (with RLS), or — preferred —
    via the unified views:
    - `public.v_sales` (azs_selling joined to `stations`, filtered by
      `sales_exclusions`).
    - `public.v_fuel_balance` (azs_balance joined to `stations`).

## Linking azs_* rows to Fingas entities

`azs_selling.station_id` and `azs_balance.station_id` carry the **integer**
station id from the MySQL system. The Fingas `stations` table has an
`external_station_id integer` column that holds that same value, plus its
own `uuid id` primary key. All Fingas joins go through this mapping.

If you onboard a new physical station:

```sql
insert into public.stations (organization_id, name, external_station_id)
  values ('<your-org-uuid>', 'Pit Stop', 8);
```

The matching `azs_*` rows will then become visible to the org's users.

## Excluding noise from revenue

When you save a calibration / test pour into `public.calibrations`, you also
typically want the matching row(s) in `azs_selling` to NOT count toward
revenue. Insert into `sales_exclusions`:

```sql
insert into public.sales_exclusions
  (organization_id, station_id, source_table, source_id, reason)
values
  ('<org>', '<station>', 'azs_selling', '<azs_selling.id::text>', 'calibration');
```

`v_sales` automatically hides those rows. `fingas_close_shift` does the same
for shift-window aggregates.
