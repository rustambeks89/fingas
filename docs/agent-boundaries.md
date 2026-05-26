<!--
[CREATED BY CLAUDE CLI - 2026-05-25]
Project: Fingas
Purpose: Which agent owns what, and what each can/can't change.
-->

# Fingas — Agent boundaries

Multiple AI agents may work on this repo (Antigravity CLI, Codex CLI,
Claude CLI). Each file MUST begin with an attribution header naming the
agent and date.

## Ownership (default)

| Agent           | Owns                                                            |
|-----------------|-----------------------------------------------------------------|
| Antigravity CLI | React/Vite setup, UI components, layout, motion, design system. |
| Codex CLI       | Business logic, forms, hooks, services, exports, validation.    |
| Claude CLI      | DB schema, SQL migrations, RLS, RPCs, triggers, docs, audits.   |

## Rules

1. **Don't edit another agent's file without owner approval.** Reading and
   analyzing is fine. Suggesting changes is fine. Patching is not.
2. **You CAN create**: helpers, adapters, services, wrappers, new files,
   documentation — as long as you don't modify someone else's file.
3. To request a cross-boundary edit, write:
   > "Мне нужно изменить файл X, потому что Y. Этот файл создан другим агентом.
   > Требуется разрешение владельца."
   Stop and wait.

## File headers

JS / JSX / TS / TSX:
```js
// [CREATED BY <AGENT> - YYYY-MM-DD]
// Project: Fingas
// Purpose: <one line>
```

SQL:
```sql
-- [CREATED BY <AGENT> - YYYY-MM-DD]
-- Project: Fingas
-- Purpose: <one line>
```

CSS:
```css
/*
[CREATED BY <AGENT> - YYYY-MM-DD]
Project: Fingas
Purpose: <one line>
*/
```

Markdown:
```html
<!--
[CREATED BY <AGENT> - YYYY-MM-DD]
Project: Fingas
Purpose: <one line>
-->
```

Use `[UPDATED BY <AGENT> - YYYY-MM-DD]` (and keep the original CREATED line)
when permitted to modify an existing file.

## Hard constraints (apply to ALL agents)

- ❌ Never rename `azs_selling`, `azs_balance`, or any other `azs_*` table.
- ❌ Never write to `azs_*` from the app — they are read-only sources.
- ❌ Never use the `pitstop_` prefix for any table.
- ❌ Never rely on frontend permission gating for security — RLS is the truth.
- ❌ Never commit real Supabase keys; `.env.local` is git-ignored.
