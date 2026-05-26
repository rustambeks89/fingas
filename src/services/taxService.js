// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: tax_payments CRUD.

import { supabase } from '@/lib/supabaseClient';

export async function listTaxes({ stationId, year, limit = 200 } = {}) {
  let q = supabase
    .from('tax_payments')
    .select('*')
    .order('payment_date', { ascending: false })
    .limit(limit);
  if (stationId) q = q.eq('station_id', stationId);
  if (year) q = q.eq('period_year', year);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createTaxPayment(row) {
  const { data, error } = await supabase
    .from('tax_payments')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}
