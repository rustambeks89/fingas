// [UPDATED BY CLAUDE CLI - 2026-05-26]
// Project: Fingas
// Purpose: payroll read. RLS handles operator-only-own filtering.
//
// payroll.user_id ссылается на auth.users (не public.profiles), поэтому
// PostgREST не умеет embed profiles напрямую (relationship not in cache).
// Тянем профили отдельным запросом по списку user_id и склеиваем в JS.

import { supabase } from '@/lib/supabaseClient';

// Триггер из миграции 0028 автоматически вызывает этот RPC при approve смены.
// Здесь вызов нужен для ретроспективного начисления: смена была утверждена
// раньше / до миграции / до назначения ставки → можно прогнать вручную.
export async function accruePayrollForReport(reportId) {
  if (!reportId) return null;
  const { data, error } = await supabase.rpc('fingas_accrue_payroll_for_report', {
    p_report_id: reportId,
  });
  if (error) throw error;
  return data;
}

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

// ===========================================================================
// PAY RATES & PERIODIC SUMMARY
// ===========================================================================

export async function getEmployeePayRate(userId) {
  const { data, error } = await supabase
    .from('employee_pay_rates')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveEmployeePayRate(userId, organizationId, rateData) {
  const payload = {
    organization_id: organizationId,
    user_id: userId,
    kind: rateData.kind,
    base_amount: Number(rateData.base_amount) || 0,
    rates_json: rateData.rates_json || null,
    active: true,
    effective_from: new Date().toISOString().slice(0, 10),
  };

  const { data, error } = await supabase
    .from('employee_pay_rates')
    .upsert(payload, { onConflict: 'organization_id,user_id,effective_from' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function calculateEmployeePayrollSummary(userId, organizationId, fromDate, toDate) {
  // 1. Fetch accrued/paid from payroll table
  let payQ = supabase
    .from('payroll')
    .select('accrued, paid')
    .eq('user_id', userId);
  if (fromDate) payQ = payQ.gte('period', fromDate);
  if (toDate) payQ = payQ.lte('period', toDate);

  const { data: payRows, error: payErr } = await payQ;
  if (payErr) throw payErr;

  let totalAccrued = 0;
  let totalPaid = 0;
  for (const r of payRows ?? []) {
    totalAccrued += Number(r.accrued ?? 0);
    totalPaid += Number(r.paid ?? 0);
  }

  // 2. Fetch shift report stats (approved shifts only)
  let repQ = supabase
    .from('shift_reports')
    .select('id, expected_liters, total_difference')
    .eq('operator_user_id', userId)
    .not('approved_at', 'is', null)
    .neq('result_status', 'rejected');

  if (fromDate) repQ = repQ.gte('submitted_at', fromDate);
  if (toDate) repQ = repQ.lte('submitted_at', toDate + 'T23:59:59.999Z');

  const { data: repRows, error: repErr } = await repQ;
  if (repErr) throw repErr;

  let totalShifts = repRows?.length ?? 0;
  let totalLiters = 0;
  let totalDiscrepancy = 0; // shortage is positive, surplus is negative
  for (const r of repRows ?? []) {
    totalLiters += Number(r.expected_liters ?? 0);
    totalDiscrepancy += Number(r.total_difference ?? 0);
  }

  return {
    totalShifts,
    totalLiters,
    totalAccrued,
    totalPaid,
    totalDiscrepancy,
    netSalary: totalAccrued - totalDiscrepancy - totalPaid,
  };
}
