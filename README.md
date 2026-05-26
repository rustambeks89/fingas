<!--
[UPDATED BY CLAUDE CLI - 2026-05-25]
Project: Fingas
Purpose: Top-level README — what Fingas is + how to run it.
-->

# Fingas

Mobile-first accounting & operations app for gas stations. Built for one
station today, designed to scale to a network of 100.

> **Naming note.** Fingas (= **Fin**ance + **Gas**) is the *system*. "Pit
> Stop" is just a row in the `stations` table — never a table prefix.

## Stack

- React 19 + Vite + Tailwind CSS + Framer Motion + lucide-react + Recharts
- Supabase (Postgres + Auth + Storage + Realtime, RLS-first)
- MySQL → Supabase sync (separate Python job) writes `azs_*` source tables

## Quick start

```bash
cp .env.example .env.local        # fill with YOUR NEW Supabase project
npm install
npm run dev                       # http://localhost:5173
```

Then in Supabase: apply `/supabase/migrations/*.sql` in numeric order.
Create your owner user in Auth, edit `/supabase/seed/seed_dev.sql` and run it.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — layers & module map
- [`docs/database.md`](docs/database.md)         — every table + sync contract
- [`docs/roles.md`](docs/roles.md)               — 4 roles, the effective-access formula
- [`docs/permissions.md`](docs/permissions.md)   — toggle matrix lifecycle
- [`docs/api.md`](docs/api.md)                   — services + RPC reference
- [`docs/agent-boundaries.md`](docs/agent-boundaries.md) — who edits what
- [`docs/mysql-sync.md`](docs/mysql-sync.md)     — read-only azs_* contract
- [`docs/deployment.md`](docs/deployment.md)     — local + prod

## Scripts

```bash
npm run dev       # vite dev server
npm run build     # production build
npm run preview   # serve dist/
npm run lint      # eslint
```
# fingas
# fingas
