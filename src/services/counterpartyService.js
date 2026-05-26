// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Suppliers / customers / employees-as-payable registry.

import { supabase } from '@/lib/supabaseClient';

export async function listCounterparties({ organizationId, type, active } = {}) {
  let q = supabase
    .from('counterparties')
    .select('*')
    .order('name');
  if (organizationId) q = q.eq('organization_id', organizationId);
  if (type) q = q.eq('type', type);
  if (active !== undefined) q = q.eq('active', active);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createCounterparty(row) {
  const { data, error } = await supabase
    .from('counterparties')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCounterparty(id, patch) {
  const { data, error } = await supabase
    .from('counterparties')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCounterparty(id) {
  const { error } = await supabase
    .from('counterparties')
    .update({ active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function getCounterparty(id) {
  const { data, error } = await supabase
    .from('counterparties')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Returns supplier statement: list of supplies (positive) + payments (negative)
// in date-desc order with running balance.
export async function getSupplierStatement(supplierId) {
  const [supplies, payments] = await Promise.all([
    supabase
      .from('fuel_supply')
      .select('id, date, fuel_type, liters_actual, price_per_liter, total_amount, doc_number')
      .eq('supplier_id', supplierId)
      .order('date', { ascending: true }),
    supabase
      .from('supplier_payments')
      .select('id, date, amount, note')
      .eq('supplier_id', supplierId)
      .order('date', { ascending: true }),
  ]);

  if (supplies.error) throw supplies.error;
  if (payments.error) throw payments.error;

  const events = [
    ...(supplies.data ?? []).map((s) => ({
      kind: 'supply',
      id: s.id,
      date: s.date,
      amount: Number(s.total_amount ?? 0),
      detail: `${s.fuel_type ?? ''} ${s.liters_actual ?? 0} л × ${s.price_per_liter ?? 0}`,
      doc: s.doc_number,
    })),
    ...(payments.data ?? []).map((p) => ({
      kind: 'payment',
      id: p.id,
      date: p.date,
      amount: -Number(p.amount ?? 0),
      detail: p.note ?? 'Оплата',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  for (const e of events) {
    running += e.amount;
    e.running = running;
  }
  return events.reverse();
}

export async function paySupplier({ supplierId, organizationId, stationId, amount, date, note, userId }) {
  const { data, error } = await supabase
    .from('supplier_payments')
    .insert({
      supplier_id: supplierId,
      organization_id: organizationId,
      station_id: stationId,
      amount,
      date,
      note: note || null,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
