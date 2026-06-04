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
      .select('id, date, amount, note, wallet_from, payment_type, station_id')
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
      walletFrom: p.wallet_from ?? null,
      paymentType: p.payment_type ?? null,
      stationId: p.station_id ?? null,
      note: p.note ?? '',
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

// Запись оплаты поставщику. Единая точка входа — INSERT в supplier_payments;
// серверные триггеры (миграции 0010/0036) сами создают cashflow-строку и
// пересчитывают counterparties.balance. Прежняя реализация делала всё это
// в JS параллельно с триггерами и удваивала уменьшение balance.
export async function paySupplier({
  supplierId,
  organizationId,
  stationId,
  amount,
  date,
  note,
  userId,
  walletFrom = null,
  paymentType = 'cash',
}) {
  // wallet_from / payment_type живут в cashflow, а в supplier_payments их
  // нет — после вставки находим созданный триггером cashflow и обновляем.
  const { data: row, error: insErr } = await supabase
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
    .select('id, cashflow_id')
    .single();
  if (insErr) throw insErr;

  const cashflowId = row?.cashflow_id ?? null;
  if (cashflowId && (walletFrom || paymentType)) {
    const patch = {};
    if (walletFrom) patch.wallet_from = walletFrom;
    if (paymentType) patch.payment_type = paymentType;
    await supabase.from('cashflow').update(patch).eq('id', cashflowId);
  }

  return { id: cashflowId ?? row?.id ?? null };
}

