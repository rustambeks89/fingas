<!--
[CREATED BY CLAUDE CLI - 2026-05-25]
Project: Fingas
Purpose: Frontend services + Supabase RPC reference.
-->

# Fingas — API surface

## Frontend services (`src/services/`)

| File                   | Exports                                                            |
|------------------------|--------------------------------------------------------------------|
| authService.js         | signIn, signUp, signOut, completeRegistration, getSession, onAuthStateChange |
| profileService.js      | fetchMyProfile, updateMyProfile, listEmployees, approveEmployee, rejectEmployee, blockEmployee, unblockEmployee, setCanLogin |
| permissionService.js   | fetchPermissionsMap, listPermissions, upsertPermission, bulkSetPermissions |
| stationService.js      | listOrganizations, listStations, createStation                     |
| salesService.js        | listSales, aggregateForShift  (READ-ONLY against azs_selling)      |
| balanceService.js      | listLatestBalances           (READ-ONLY against azs_balance)       |

## Supabase RPC (callable via `supabase.rpc('name', args)`)

| RPC                              | Args                                  | Notes |
|----------------------------------|---------------------------------------|-------|
| `fingas_apply_role_template`     | `p_user uuid, p_role text`            | Owner-only. Replaces `user_permissions` rows with role defaults. |
| `fingas_close_shift`             | `p_session_id uuid, p_payload jsonb`  | Operator submits blind actuals; computes expected vs azs_selling. Returns shift_report id. |
| `fingas_has_perm`                | `p_module text, p_action text`        | Used internally by RLS. Also callable from client to introspect. |
| `fingas_has_perm_for`            | `p_user uuid, p_module text, p_action text` | Owner-only convenience. |

## Read views

- `v_sales`         — `azs_selling` joined to `stations` and filtered by `sales_exclusions`.
- `v_fuel_balance`  — `azs_balance` joined to `stations`.

Both are created defensively with `do $$ ... $$` and skip themselves if the
source table is not yet synced.
