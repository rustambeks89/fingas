// [UPDATED BY CLAUDE CLI - 2026-05-26]
// Project: Fingas
// Purpose: payroll read. RLS handles operator-only-own filtering.
//
// payroll.user_id ссылается на auth.users (не public.profiles), поэтому
// PostgREST не умеет embed profiles напрямую (relationship not in cache).
// Тянем профили отдельным запросом по списку user_id и склеиваем в JS.

import { supabase } from '@/lib/supabaseClient';

export async function listPayroll({ userId, from, to, limit = 100 } = {}) {
  let q = supabase
    .from('payroll')
    .select('*')
    .order('period', { ascending: false })
    .limit(limit);
  if (userId) q = q.eq('user_id', userId);
  if (from) q = q.gte('period', from);
  if (to) q = q.lte('period', to);
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (userIds.length === 0) {
    return rows.map((r) => ({ ...r, user: null }));
  }

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, user_id, full_name, email')
    .in('user_id', userIds);
  if (profErr) {
    // если профили не доступны (RLS) — отдадим payroll без имён
    return rows.map((r) => ({ ...r, user: null }));
  }

  const byUserId = new Map();
  for (const p of profiles ?? []) byUserId.set(p.user_id, p);
  return rows.map((r) => ({ ...r, user: byUserId.get(r.user_id) ?? null }));
}
