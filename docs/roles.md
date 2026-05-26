<!--
[CREATED BY CLAUDE CLI - 2026-05-25]
Project: Fingas
Purpose: Role reference. Reminder: role is only a permission template;
real source of truth is user_permissions toggles.
-->

# Fingas — Roles

| Role        | Code         | Default scope                                  |
|-------------|--------------|------------------------------------------------|
| Owner       | `owner`      | Full org access. Always passes RLS.           |
| Admin       | `admin`      | Single station: shifts, supply, measurements. |
| Operator    | `operator`   | Own shifts + sales view + own salary.         |
| Accountant  | `accountant` | Org-wide finance: cashflow, P&L, taxes, suppliers. |

**The role determines the default toggle template** (see
`fingas_apply_role_template` RPC). It does NOT decide actual access at
runtime — `user_permissions.can_*` does.

## Effective access formula

A non-owner can do action X on module M iff:

```
profiles.status         = 'active'
AND profiles.can_login  = true
AND user_permissions.<can_X> = true  (for that module)
AND (organization_id and, if needed, station_id match)
```

Owners short-circuit the matrix — they always pass.
