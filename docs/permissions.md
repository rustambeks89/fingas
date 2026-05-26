<!--
[CREATED BY CLAUDE CLI - 2026-05-25]
Project: Fingas
Purpose: How toggle-permissions work end to end.
-->

# Fingas — Permissions

## Modules

```
dashboard, shifts, sales, fuel_supply, tank_measurements,
calibrations, fuel_balances, cashflow, pl, taxes, payroll,
suppliers, collections, documents, settings, employees, notifications
```

Canonical list in `src/lib/constants.js` (MODULES) and a `check` constraint
on `user_permissions.module`.

## Actions

`can_view, can_create, can_edit, can_delete, can_approve, can_export, can_upload`

## Storage

One row per (user_id, module) in `public.user_permissions`. The unique
constraint on `(user_id, module)` means upserting a module replaces the
previous toggle row for that pair.

## Frontend gating

`src/lib/permissions.js` exposes `hasPermission(user, module, action)` and
helpers (`canView`, `canCreate`, …). The router (`src/app/router.jsx`) wraps
every protected route in `<ModuleRoute module=… >` which redirects to
`AccessDenied` when the user lacks `can_view`.

This is **UI ONLY** — never rely on it for security.

## Backend gating (the real authority)

Every Fingas business table is wrapped by RLS policies in
`/supabase/migrations/0005_rls.sql`. Each policy calls
`public.fingas_has_perm(module, action)` and additionally scopes rows by
`organization_id` and, when applicable, `station_id`.

## Owner workflow to grant access

1. Employee signs up → `profiles.status = 'pending_approval'`, `can_login = false`.
2. Owner opens **Сотрудники → Заявки** and either approves or rejects.
3. After approval, owner goes to **Доступы**, opens the employee, optionally
   applies a role template (RPC `fingas_apply_role_template`), then flips
   individual toggles in the matrix.
4. Owner clicks **Сохранить права** — bulk upsert into `user_permissions`.
5. Owner can revoke at any moment by flipping `can_login` off — that alone
   denies all actions (because `fingas_has_perm()` first checks
   `status = 'active' AND can_login`).
