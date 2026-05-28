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
// Reads payments from cashflow (source of truth) so deleted cashflow entries
// are immediately reflected here without depending on trigger cascade.
export async function getSupplierStatement(supplierId) {
  const [supplies, payments] = await Promise.all([
    supabase
      .from('fuel_supply')
      .select('id, date, fuel_type, liters_actual, price_per_liter, total_amount, doc_number')
      .eq('supplier_id', supplierId)
      .order('date', { ascending: true }),
    supabase
      .from('cashflow')
      .select('id, date, amount, note')
      .eq('counterparty_id', supplierId)
      .eq('operation_type', 'supplier_payment')
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


// ---- Bank accounts (несколько счетов на контрагента) ----

export async function listBankAccounts(counterpartyId) {
  if (!counterpartyId) return [];
  const { data, error } = await supabase
    .from('counterparty_bank_accounts')
    .select('*')
    .eq('counterparty_id', counterpartyId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    // Если миграции ещё нет — отдаём пустой массив, чтоб UI не падал
    const msg = String(error?.message ?? '').toLowerCase();
    if (msg.includes('counterparty_bank_accounts') && msg.includes('does not exist')) return [];
    throw error;
  }
  return data ?? [];
}

export async function createBankAccount(row) {
  const { data, error } = await supabase
    .from('counterparty_bank_accounts')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBankAccount(id, patch) {
  const { data, error } = await supabase
    .from('counterparty_bank_accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBankAccount(id) {
  const { error } = await supabase
    .from('counterparty_bank_accounts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function paySupplier({ supplierId, organizationId, stationId, amount, date, note, userId }) {
  // Step 1: Insert directly into cashflow (source of truth).
  // Even if steps 2-3 fail, the payment is recorded and will show in cashflow.
  const { data: cfRow, error: cfErr } = await supabase
    .from('cashflow')
    .insert({
      organization_id: organizationId,
      station_id: stationId,
      date,
      operation_type: 'supplier_payment',
      amount,
      counterparty_id: supplierId,
      note: note || null,
      status: 'confirmed',
      created_by: userId,
      cashflow_category: 'Оплата поставщику',
    })
    .select('id')
    .single();
  if (cfErr) throw cfErr; // Step 1 is critical — throw if cashflow insert fails

  // Step 2: Sync to supplier_payments (non-critical — cashflow is source of truth).
  // May fail if cashflow_id column not yet migrated on remote DB — that's fine.
  try {
    await supabase
      .from('supplier_payments')
      .insert({
        supplier_id: supplierId,
        organization_id: organizationId,
        station_id: stationId,
        amount,
        date,
        note: note || null,
        created_by: userId,
        cashflow_id: cfRow.id,
      });
  } catch (e) {
    console.warn('[paySupplier] supplier_payments sync failed (non-critical):', e?.message);
  }

  // Step 3: Update counterparty balance (non-critical — balance can be recalculated).
  try {
    const { data: cp } = await supabase
      .from('counterparties')
      .select('balance')
      .eq('id', supplierId)
      .single();
    if (cp != null) {
      await supabase
        .from('counterparties')
        .update({ balance: Number(cp.balance ?? 0) - Number(amount) })
        .eq('id', supplierId);
    }
  } catch (e) {
    console.warn('[paySupplier] balance update failed (non-critical):', e?.message);
  }

  return { id: cfRow.id };
}


