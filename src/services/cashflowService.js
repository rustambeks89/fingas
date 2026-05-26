// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: cashflow + collections + wallets queries.

import { supabase } from '@/lib/supabaseClient';

export async function listCashflow({ stationId, operationType, status, limit = 100 } = {}) {
  let q = supabase
    .from('cashflow')
    .select(`
      *,
      counterparty:counterparties ( id, name ),
      from_wallet:wallets!cashflow_wallet_from_fkey ( id, name ),
      to_wallet:wallets!cashflow_wallet_to_fkey ( id, name )
    `)
    .order('date', { ascending: false })
    .limit(limit);
  if (stationId) q = q.eq('station_id', stationId);
  if (operationType) q = q.eq('operation_type', operationType);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createCashflow(row) {
  const { data, error } = await supabase
    .from('cashflow')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCashflow(id, patch) {
  const { data, error } = await supabase
    .from('cashflow')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCashflow(id) {
  const { error } = await supabase.from('cashflow').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteCashflowWithSync(id) {
  const { data: row, error: rowErr } = await supabase
    .from('cashflow')
    .select('id, operation_type, amount, counterparty_id')
    .eq('id', id)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (!row) return;

  if (row.operation_type === 'supplier_payment') {
    const { data: payment, error: payErr } = await supabase
      .from('supplier_payments')
      .select('id, supplier_id, amount')
      .eq('cashflow_id', id)
      .maybeSingle();
    if (payErr) throw payErr;

    const supplierId = payment?.supplier_id ?? row.counterparty_id ?? null;
    const amount = Number(payment?.amount ?? row.amount ?? 0);

    if (supplierId && amount) {
      const { data: supplier, error: supplierErr } = await supabase
        .from('counterparties')
        .select('balance')
        .eq('id', supplierId)
        .maybeSingle();
      if (supplierErr) throw supplierErr;

      const nextBalance = Number(supplier?.balance ?? 0) + amount;
      const { error: balanceErr } = await supabase
        .from('counterparties')
        .update({ balance: nextBalance })
        .eq('id', supplierId);
      if (balanceErr) throw balanceErr;
    }

    if (payment) {
      const { error: paymentDelErr } = await supabase
        .from('supplier_payments')
        .delete()
        .eq('id', payment.id);
      if (paymentDelErr) throw paymentDelErr;
    }
  }

  const { error } = await supabase.from('cashflow').delete().eq('id', id);
  if (error) throw error;
}

export async function confirmCashflow(id) {
  const { data, error } = await supabase
    .from('cashflow')
    .update({ status: 'confirmed' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function rejectCashflow(id) {
  const { data, error } = await supabase
    .from('cashflow')
    .update({ status: 'rejected' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- wallets ----
export async function listWallets({ organizationId, active } = {}) {
  let q = supabase.from('wallets').select('*').order('name');
  if (organizationId) q = q.eq('organization_id', organizationId);
  if (active !== undefined) q = q.eq('active', active);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createWallet(row) {
  const { data, error } = await supabase
    .from('wallets')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWallet(id, patch) {
  const { data, error } = await supabase
    .from('wallets')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWallet(id) {
  const { error } = await supabase
    .from('wallets')
    .update({ active: false })
    .eq('id', id);
  if (error) throw error;
}
