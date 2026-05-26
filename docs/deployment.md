<!--
[CREATED BY CLAUDE CLI - 2026-05-25]
Project: Fingas
Purpose: Local dev + deploy recipe.
-->

# Fingas — Deployment

## Local

```bash
cp .env.example .env.local
# fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from your NEW Supabase project

npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build
npm run preview
```

## Supabase setup (do these in order)

1. **Create a new Supabase project** at supabase.com. Copy the project URL
   and the **anon** public key into `.env.local`. Get the **service role**
   key separately — only the Python sync job uses it.

2. Apply migrations. With the Supabase CLI:

   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

   Or paste each `/supabase/migrations/*.sql` file in order into the SQL
   editor. They are idempotent (`create if not exists`, `drop policy if
   exists`, …).

3. (Optional) Create your **owner** user via Supabase Studio → Authentication
   → "Add user". Then edit `/supabase/seed/seed_dev.sql`, replace
   `OWNER_AUTH_UUID`, and run it.

4. The Python sync job (separate repo) writes to `public.azs_*` using the
   **service role** key. RLS does not apply to the service role, so writes
   succeed; the app cannot tamper with these tables.

## Production hosting

- The app is a static SPA — deploy `dist/` to Vercel, Netlify, or any
  static host. On Vercel: framework auto-detects Vite, set the two env vars
  in the project settings.
- Supabase backs the DB, auth, storage, and realtime.
