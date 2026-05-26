// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Single Supabase client instance for the whole app.
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from env. Throws a loud
// warning in dev if env is missing so it's never silently misconfigured.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    '[Fingas] Supabase env not set. Copy .env.example to .env.local and fill ' +
      'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from your new Supabase project.',
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 5 } },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
