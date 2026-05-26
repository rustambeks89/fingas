<!--
[CREATED BY CLAUDE CLI - 2026-05-25]
[UPDATED BY CODEX - 2026-05-25]
Project: Fingas
Purpose: High-level architecture of the Fingas accounting app.
-->

# Fingas — Architecture

Fingas is a **mobile-first accounting & operations app for gas stations**.
It targets 1 station now and scales to networks of 100+.

## Layers

```
┌───────────────────────────────────────────────────────────────┐
│  React / Vite SPA (mobile-first, Tailwind + Framer Motion)    │
│  src/                                                         │
│   ├── app/        — App, providers, router                    │
│   ├── components/ — UI kit, layout, bottom-sheets, nav        │
│   ├── features/   — one folder per domain (auth, employees…)  │
│   ├── lib/        — supabaseClient, permissions, constants    │
│   ├── services/   — Supabase query wrappers (one per domain)  │
│   └── hooks/      — useAuth, usePermissions                   │
└───────────────────────────┬───────────────────────────────────┘
                            │ HTTPS / supabase-js
┌───────────────────────────▼───────────────────────────────────┐
│  Supabase (Postgres + Auth + Storage + Realtime)              │
│                                                               │
│  ┌─────────────┐   ┌────────────────────┐  ┌───────────────┐  │
│  │ Fingas      │   │ MySQL-synced       │  │ Storage       │  │
│  │ business    │   │ READ-ONLY source   │  │ buckets:      │  │
│  │ tables      │   │ tables: azs_*      │  │ avatars,      │  │
│  │ (RLS on)    │   │ (RLS read-only)    │  │ receipts, …   │  │
│  └─────────────┘   └────────────────────┘  └───────────────┘  │
└───────────────────────────▲───────────────────────────────────┘
                            │ writes only via service role
                  ┌─────────┴────────┐
                  │ Python sync job  │  ← runs on the station
                  │ MySQL → Supabase │     (АСУ/СНК АЗС)
                  └──────────────────┘
```

## Key principles

1. **Single source of truth for sales/balances is `azs_*`** (synced from
   on-station MySQL). The app NEVER writes to these tables. We add unified
   read views (`v_sales`, `v_fuel_balance`) and exclusion list
   (`sales_exclusions`) to filter calibrations/test-pours out of P&L.

2. **Frontend permission gating is cosmetic.** The actual contract is in
   Postgres RLS. Every business table has policies that call
   `fingas_has_perm(module, action)`.

3. **Toggle permissions > roles.** Role is just the template seed; the source
   of truth is `user_permissions` rows. Owner edits them per employee.

4. **Owner approves every new employee.** Sign-up creates a `pending_approval`
   profile with `can_login = false`. Owner flips toggles to activate.

5. **Mobile-first.** Bottom nav, bottom sheets, large tap targets, safe-area
   insets. Desktop is not a priority but works as a wide layout.

## Module index

| Module             | Source of truth        | UI status |
|--------------------|------------------------|-----------|
| dashboard          | aggregated             | shipped (role-aware) |
| shifts             | shift_sessions, …      | list + open (close-out RPC ready) |
| sales              | **azs_selling** (RO)   | shipped (list) |
| fuel_supply        | fuel_supply            | list + create |
| tank_measurements  | tank_measurements      | premium history + create |
| calibrations       | calibrations           | history + matching + create |
| fuel_balances      | **azs_balance** (RO)   | shipped (list) |
| cashflow           | cashflow               | list + create + export |
| collections        | cashflow filtered      | list + create + approve |
| suppliers          | counterparties, …      | list + create |
| taxes              | tax_payments           | grouped list + create + export |
| payroll            | payroll                | list + team grouping + export |
| pl                 | aggregates             | analytics + monthly chart |
| documents          | documents + Storage    | list + upload |
| notifications      | notifications          | shipped (list) |
| employees          | profiles               | shipped (4 tabs) |
| **permissions**    | user_permissions       | shipped (toggle matrix) |
| settings           | organizations/stations | org + stations + wallets CRUD |
| profile            | profiles (self)        | shipped   |
