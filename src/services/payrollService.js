// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: payroll read. RLS handles operator-only-own filtering.

import { supabase } from '@/lib/supabaseClient';

export async function listPayroll({ userId, from, to, limit = 100 } = {}) {
  let q = supabase
    .from('payroll')
    .select(`*, user:profiles!payroll_user_id_fkey ( id, full_name, email )`)
    .order('period', { ascending: false })
    .limit(limit);
  if (userId) q = q.eq('user_id', userId);
  if (from) q = q.gte('period', from);
  if (to) q = q.lte('period', to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
