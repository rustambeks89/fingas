// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Shift access — REAL shifts come from the POS via azs_selling.ShiftKey
// (auto-opened in the SNK system). We only do close-out reconciliation and
// approval, persisted in public.shift_reports keyed on (org, station, ShiftKey).
//
// The legacy shift_sessions table + openShift/closeShift remain available for
// back-compat but should not be used in new flows.

import { supabase } from '@/lib/supabaseClient';
import { aggregateByShift, listSales } from './salesService';

// ===========================================================================
// SHIFTS FROM azs_balance (TRK totalizers) — primary source of truth.
// ===========================================================================
//
// Each azs_balance row = one (Shift × Pump × Fuel) snapshot. Schema:
//   BeginBalance, EndBalance  — cumulative liter totalizers on the dispenser
//   BeginPrice,   EndPrice    — price per liter (revenue = liters × EndPrice)
//   ShiftKey                  — POS shift id
//   ShopKey                   — station id (matches stations.external_station_id)
//   FuelName                  — fuel grade
//   synced_at                 — sync timestamp
//
// Per row:
//   sale_liters = EndBalance - BeginBalance
//   revenue     = sale_liters × EndPrice
//
// Rows are EXCLUDED when BeginBalance <= 1_000_000 OR EndBalance <= 1_000_000
// (these are remnants / service rows, not real counter ticks). This same
// floor also applies server-side in the close-out RPC that writes shift_reports.
//
// Date/time and operator name come from azs_selling joined by ShiftKey.
//
// Split shifts: one physical shift may be broken into several ShiftKeys (power
// outage, operator re-login, restart). We merge into a single "shiftGroup" when:
//   - same shop_key
//   - same operator_final_name
//   - start of the next shift is within MERGE_GAP_MINUTES of the prev end
//     (короткая щель = случайное закрытие+открытие; обычные смены идут
//     ~24 ч и не должны клеиться только потому что один и тот же оператор)
//   - OR the shifts overlap.
//
// Operator override: lookup public.shift_operator_overrides on (org, shop, shift_key).
// operator_final_name = operator_corrected_name || operator_original_name.

const COUNTER_FLOOR = 1_000_000;
const SHIFT_HISTORY_FLOOR = 631;
// 15 мин — реалистичный потолок для «ошибочно закрыл и сразу открыл».
// Всё что больше — это уже отдельные смены, даже если оператор тот же.
const MERGE_GAP_MINUTES = 15;
const MERGE_GAP_MS = MERGE_GAP_MINUTES * 60 * 1000;
const SHIFT_KEY_CHUNK = 200;
const SELLING_META_PAGE = 5000;

async function resolveShopKey(stationId) {
  if (!stationId) return null;
  const { data } = await supabase
    .from('stations')
    .select('external_station_id')
    .eq('id', stationId)
    .maybeSingle();
  return data?.external_station_id ?? null;
}

function pickBalanceTimestamp(row) {
  if (!row) return null;
  const candidates = [
    row.shift_ended_at,
    row.ShiftEndedAt,
    row.shift_started_at,
    row.ShiftStartedAt,
    row.measured_at,
    row.MeasuredAt,
    row.balance_at,
    row.BalanceAt,
    row.shift_date,
    row.ShiftDate,
    row.work_date,
    row.WorkDate,
    row.date,
    row.Date,
    row.created_at,
    row.updated_at,
    row.synced_at,
  ];
  for (const value of candidates) {
    if (value) return value;
  }
  return null;
}

function pickShiftStartTimestamp(row) {
  if (!row) return null;
  const candidates = [
    row.DatetimeShiftBegin,
    row.datetimeshiftbegin,
    row.shift_started_at,
    row.ShiftStartedAt,
    row.started_at,
    row.StartedAt,
    row.opened_at,
    row.OpenedAt,
    row.begin_at,
    row.BeginAt,
    row.begin_datetime,
    row.BeginDatetime,
    row.start_at,
    row.StartAt,
    row.shift_date,
    row.ShiftDate,
    row.date,
    row.Date,
  ];
  for (const value of candidates) {
    if (value) return value;
  }
  return null;
}

function pickShiftEndTimestamp(row) {
  if (!row) return null;
  const candidates = [
    row.DatetimeShiftEnd,
    row.datetimeshiftend,
    row.shift_ended_at,
    row.ShiftEndedAt,
    row.ended_at,
    row.EndedAt,
    row.closed_at,
    row.ClosedAt,
    row.end_at,
    row.EndAt,
    row.end_datetime,
    row.EndDatetime,
    row.finished_at,
    row.FinishedAt,
    row.shift_started_at,
    row.ShiftStartedAt,
    row.shift_date,
    row.ShiftDate,
    row.date,
    row.Date,
  ];
  for (const value of candidates) {
    if (value) return value;
  }
  return null;
}

async function loadAzsShiftMetaByShiftKeys({ shopKey, shiftKeys }) {
  const meta = new Map();
  const keys = [...new Set(shiftKeys.filter((key) => key != null))];

  for (let i = 0; i < keys.length; i += SHIFT_KEY_CHUNK) {
    const chunk = keys.slice(i, i + SHIFT_KEY_CHUNK);
    let q = supabase
      .from('azs_shift')
      .select('*')
      .in('ShiftKey', chunk)
      .limit(SHIFT_KEY_CHUNK * 4);
    if (shopKey != null) q = q.eq('ShopKey', shopKey);

    const { data, error } = await q;
    if (error) throw error;

    for (const row of data ?? []) {
      const key = row?.ShiftKey;
      if (key == null) continue;
      const startedAt = pickShiftStartTimestamp(row);
      const endedAt = pickShiftEndTimestamp(row);
      const operator =
        row.OperatorName ?? row.operator_name ?? row.Operator ?? row.operator ?? null;
      const existing = meta.get(key);

      if (!existing) {
        meta.set(key, {
          firstAt: startedAt ?? endedAt ?? null,
          lastAt: endedAt ?? startedAt ?? null,
          operator: operator && String(operator).trim() ? String(operator).trim() : null,
        });
        continue;
      }

      if (startedAt && (!existing.firstAt || startedAt < existing.firstAt)) {
        existing.firstAt = startedAt;
      }
      if (endedAt && (!existing.lastAt || endedAt > existing.lastAt)) {
        existing.lastAt = endedAt;
      }
      if (!existing.operator && operator && String(operator).trim()) {
        existing.operator = String(operator).trim();
      }
    }
  }

  return meta;
}

async function loadSellingMetaByShiftKeys({ shopKey, shiftKeys }) {
  const meta = new Map();
  const keys = [...new Set(shiftKeys.filter((key) => key != null))];

  for (let i = 0; i < keys.length; i += SHIFT_KEY_CHUNK) {
    const chunk = keys.slice(i, i + SHIFT_KEY_CHUNK);
    for (let offset = 0; ; offset += SELLING_META_PAGE) {
      let q = supabase
        .from('azs_selling')
        .select('ShiftKey, ShopKey, TransactionDatetime, OperatorName')
        .in('ShiftKey', chunk)
        .order('TransactionDatetime', { ascending: true })
        .range(offset, offset + SELLING_META_PAGE - 1);
      if (shopKey != null) q = q.eq('ShopKey', shopKey);

      const { data, error } = await q;
      if (error) throw error;

      for (const r of data ?? []) {
        const key = r.ShiftKey;
        if (key == null) continue;
        if (!meta.has(key)) {
          meta.set(key, {
            shiftKey: key,
            shopKey: r.ShopKey,
            operator: r.OperatorName ?? '—',
            firstAt: r.TransactionDatetime,
            lastAt: r.TransactionDatetime,
            count: 0,
          });
        }
        const g = meta.get(key);
        g.count += 1;
        if (r.OperatorName && r.OperatorName !== '—') g.operator = r.OperatorName;
        if (r.TransactionDatetime && (!g.firstAt || r.TransactionDatetime < g.firstAt)) {
          g.firstAt = r.TransactionDatetime;
        }
        if (r.TransactionDatetime && (!g.lastAt || r.TransactionDatetime > g.lastAt)) {
          g.lastAt = r.TransactionDatetime;
        }
      }

      if (!data || data.length < SELLING_META_PAGE) break;
    }
  }

  return meta;
}

// List per-(ShiftKey, FuelName) aggregated rows from azs_balance, plus the
// matching operator/time data from azs_selling.
// Returns an array of {
//   shiftKey, shopKey, operatorOriginal, operatorOverride, operatorFinal,
//   firstAt, lastAt, revenue, liters, fuels: {[fuel]: {liters, revenue}},
//   parts: number  (>1 if rows were merged)
// }
export async function listShiftsFromBalance({ stationId, from, to, limit = 50 } = {}) {
  const shopKey = await resolveShopKey(stationId);

  // 1. Raw azs_balance — only counter rows above the floor.
  let balQ = supabase
    .from('azs_balance')
    .select('*')
    .gt('BeginBalance', COUNTER_FLOOR)
    .gt('EndBalance',   COUNTER_FLOOR)
    .gte('ShiftKey', SHIFT_HISTORY_FLOOR)
    .order('synced_at', { ascending: false })
    .limit(5000);
  if (shopKey != null) balQ = balQ.eq('ShopKey', shopKey);

  const { data: balanceRows, error: balErr } = await balQ;
  if (balErr) throw balErr;
  if (!balanceRows || balanceRows.length === 0) return [];

  // 2. Per-(ShiftKey, FuelName) bucket from balance
  const shifts = new Map(); // shiftKey -> { ... }
  for (const r of balanceRows) {
    const liters  = Number(r.EndBalance ?? 0) - Number(r.BeginBalance ?? 0);
    if (!Number.isFinite(liters) || liters <= 0) continue;
    const revenue = liters * Number(r.EndPrice ?? 0);
    const key = r.ShiftKey;
    if (key == null) continue;
    if (!shifts.has(key)) {
      const balanceAt = pickBalanceTimestamp(r);
      shifts.set(key, {
        shiftKey: key,
        shopKey: r.ShopKey,
        liters: 0,
        revenue: 0,
        fuels: {},
        balanceAt: balanceAt ?? null,
        syncedAt: r.synced_at,
        source: 'azs_balance',
      });
    }
    const g = shifts.get(key);
    g.liters  += liters;
    g.revenue += revenue;
    const fuel = r.FuelName ?? '—';
    if (!g.fuels[fuel]) g.fuels[fuel] = { liters: 0, revenue: 0 };
    g.fuels[fuel].liters  += liters;
    g.fuels[fuel].revenue += revenue;
    const rowBalanceAt = pickBalanceTimestamp(r);
    if (rowBalanceAt && (!g.balanceAt || rowBalanceAt < g.balanceAt)) {
      g.balanceAt = rowBalanceAt;
    }
  }

  // 3. JOIN with azs_shift / azs_selling to get date range, operator and checks.
  // Dates for archived shifts should come from azs_shift by ShiftKey.
  const keys = [...shifts.keys()];
  if (keys.length === 0) return [];

  // Selling-мета не должна валить весь архив. Если запрос упадёт (RLS,
  // лимиты, сеть) — покажем смены без чеков, а ошибку выведем в консоль
  // чтобы можно было диагностировать.
  const [shiftByKey, sellingByKey] = await Promise.all([
    loadAzsShiftMetaByShiftKeys({ shopKey, shiftKeys: keys }).catch((e) => {
      console.warn('[shiftService] azs_shift meta failed:', e?.message ?? e);
      return new Map();
    }),
    loadSellingMetaByShiftKeys({ shopKey, shiftKeys: keys }).catch((e) => {
      console.warn('[shiftService] azs_selling meta failed:', e?.message ?? e);
      return new Map();
    }),
  ]);
  console.info('[shiftService] keys:', keys.length, '| shift-meta:', shiftByKey.size, '| selling-meta:', sellingByKey.size);
  if (shiftByKey.size > 0) {
    const sample = [...shiftByKey.entries()][0];
    console.info('[shiftService] sample shift meta:', sample[0], sample[1]);
  }
  if (sellingByKey.size > 0) {
    const sample = [...sellingByKey.entries()][0];
    console.info('[shiftService] sample selling meta:', sample[0], sample[1]);
  }

  // 4. Pull overrides for these shifts
  const { data: overrides } = await supabase
    .from('shift_operator_overrides')
    .select('shift_key, shop_key, operator_corrected_name')
    .in('shift_key', keys);
  const overrideMap = new Map();
  for (const o of overrides ?? []) {
    overrideMap.set(`${o.shop_key}:${o.shift_key}`, o.operator_corrected_name);
  }

  // 5. Combine + filter by period
  // firstAt/lastAt strictly from selling. syncedAt отдельно — нужен только
  // для overlap-фильтра и fallback-сортировки, но НЕ для отображения (там
  // syncedAt в UTC даёт −6ч после parsePosDate).
  let combined = keys.map((k) => {
    const g = shifts.get(k);
    const s = sellingByKey.get(k);
    const h = shiftByKey.get(k);
    // Оператор: приоритет azs_shift (авторитетная карточка смены), затем
    // azs_selling (по транзакциям), затем override от админа.
    const operatorOriginal = h?.operator ?? s?.operator ?? null;
    const operatorOverride = overrideMap.get(`${g.shopKey}:${k}`) ?? null;
    const operatorFinal = operatorOverride && operatorOverride.trim() ? operatorOverride : (operatorOriginal ?? '—');
    return {
      shiftKey: k,
      shopKey: g.shopKey,
      operatorOriginal,
      operatorOverride,
      operatorFinal,
      firstAt: h?.firstAt ?? s?.firstAt ?? null,
      lastAt:  h?.lastAt  ?? s?.lastAt  ?? null,
      balanceAt: g.balanceAt ?? null,
      syncedAt: g.syncedAt ?? null,
      hasSellingTime: Boolean(h?.firstAt || h?.lastAt || s?.firstAt || s?.lastAt),
      liters: g.liters,
      revenue: g.revenue,
      count: s?.count ?? 0,
      fuels: g.fuels,
      parts: 1,
      mergedKeys: [k],
      source: 'azs_balance',
    };
  });

  // Фильтр по периоду. Архив = azs_balance, поэтому смены без selling-данных
  // тоже нужно показывать — используем synced_at как fallback-якорь даты.
  // (Раньше выкидывали такие строки и архив терял старые смены.)
  if (from || to) {
    combined = combined.filter((s) => {
      const start = s.firstAt ?? s.lastAt ?? s.balanceAt ?? s.syncedAt;
      const end   = s.lastAt  ?? s.firstAt ?? s.balanceAt ?? s.syncedAt;
      if (!start && !end) return true;
      if (to   && start && start > to)   return false;
      if (from && end   && end   < from) return false;
      return true;
    });
  }

  // 6. Merge split shifts. Sort chronologically (использует syncedAt как fallback
  // для смен без selling-данных).
  const sortKey = (s) => {
    const v = s.firstAt ?? s.lastAt ?? s.balanceAt ?? s.syncedAt;
    return v ? new Date(v).getTime() : 0;
  };
  combined.sort((a, b) => sortKey(a) - sortKey(b));

  const merged = [];
  for (const s of combined) {
    const last = merged[merged.length - 1];
    if (last && canMerge(last, s)) {
      // merge s into last
      last.liters  += s.liters;
      last.revenue += s.revenue;
      last.count   += s.count;
      last.parts   += 1;
      last.mergedKeys.push(s.shiftKey);
      if (s.firstAt && (!last.firstAt || s.firstAt < last.firstAt)) last.firstAt = s.firstAt;
      if (s.lastAt  && (!last.lastAt  || s.lastAt  > last.lastAt))  last.lastAt  = s.lastAt;
      if (s.balanceAt && (!last.balanceAt || s.balanceAt < last.balanceAt)) last.balanceAt = s.balanceAt;
      for (const [fuel, v] of Object.entries(s.fuels)) {
        if (!last.fuels[fuel]) last.fuels[fuel] = { liters: 0, revenue: 0 };
        last.fuels[fuel].liters  += v.liters;
        last.fuels[fuel].revenue += v.revenue;
      }
      // keep last.operatorFinal (already same per canMerge check)
      // keep the earliest shiftKey as the primary key
      if (s.shiftKey < last.shiftKey) last.shiftKey = s.shiftKey;
    } else {
      merged.push({ ...s });
    }
  }

  // newest first for UI — берём lastAt, при отсутствии — syncedAt из balance.
  const newestKey = (s) => {
    const v = s.lastAt ?? s.firstAt ?? s.balanceAt ?? s.syncedAt;
    return v ? new Date(v).getTime() : 0;
  };
  merged.sort((a, b) => newestKey(b) - newestKey(a));

  return merged.slice(0, limit);
}

function canMerge(a, b) {
  if (a.shopKey !== b.shopKey) return false;
  if (!a.hasSellingTime || !b.hasSellingTime) return false;
  if (!a.operatorOriginal || !b.operatorOriginal) return false;
  if ((a.operatorFinal ?? '') !== (b.operatorFinal ?? '')) return false;
  // overlap?
  if (a.firstAt && b.firstAt && a.lastAt && b.lastAt) {
    const aEnd   = new Date(a.lastAt).getTime();
    const bStart = new Date(b.firstAt).getTime();
    if (bStart <= aEnd) return true;            // overlap or touching
    if (bStart - aEnd <= MERGE_GAP_MS) return true;
    return false;
  }
  // no time info: only merge if calendar date matches via syncedAt
  return false;
}

// Currently-active shift comes from azs_selling: azs_balance is archive/close
// data and can lag until the POS shift is finalized.
export async function getCurrentShiftFromBalance({ stationId } = {}) {
  return getCurrentSalesShift({ stationId });
}

// Upsert (org, shop_key, shift_key) → operator_corrected_name.
export async function setOperatorOverride({ organizationId, stationId, shopKey, shiftKey, correctedName, note }) {
  const userId = (await supabase.auth.getUser()).data?.user?.id;
  const payload = {
    organization_id: organizationId,
    station_id: stationId ?? null,
    shop_key: shopKey,
    shift_key: shiftKey,
    operator_corrected_name: correctedName?.trim() || null,
    note: note ?? null,
    updated_by: userId,
  };
  // try update first
  const { data: existing } = await supabase
    .from('shift_operator_overrides')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('shop_key', shopKey)
    .eq('shift_key', shiftKey)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase
      .from('shift_operator_overrides')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await supabase
    .from('shift_operator_overrides')
    .insert({ ...payload, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteOperatorOverride({ organizationId, shopKey, shiftKey }) {
  const { error } = await supabase
    .from('shift_operator_overrides')
    .delete()
    .eq('organization_id', organizationId)
    .eq('shop_key', shopKey)
    .eq('shift_key', shiftKey);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// NEW: shifts derived from azs_selling
// ---------------------------------------------------------------------------

// List shifts seen in azs_selling for the given period, joined with any
// close-out we already stored in shift_reports.
export async function listSalesShifts({ stationId, from, to, limit = 30 } = {}) {
  const shifts = await aggregateByShift({ stationId, from, to, limit: limit * 2 });
  if (shifts.length === 0) return [];

  const keys = shifts.map((s) => s.shiftKey).filter((k) => k != null);
  let reports = [];
  if (keys.length > 0) {
    const { data, error } = await supabase
      .from('shift_reports')
      .select('*')
      .in('external_shift_key', keys);
    if (!error) reports = data ?? [];
  }
  const map = new Map();
  for (const r of reports) map.set(r.external_shift_key, r);

  return shifts
    .map((s) => ({ ...s, report: map.get(s.shiftKey) ?? null }))
    .slice(0, limit);
}

// The currently-active shift = the ShiftKey on the most recent azs_selling row.
// Returns { shiftKey, operator, firstAt, lastAt, revenue, liters, count, fuels, report }
export async function getCurrentSalesShift({ stationId } = {}) {
  // Pull the newest transaction
  const last = await listSales({
    stationId,
    limit: 1,
    columns: 'ShiftKey',
  });
  if (!last.length) return null;
  const currentKey = last[0].ShiftKey;
  if (currentKey == null) return null;

  // Pull only rows of the current shift, and only the columns we aggregate.
  const matched = await listSales({
    stationId,
    shiftKey: currentKey,
    limit: 5000,
    columns: 'ShiftKey, ShopKey, FuelName, Volume, ShopCost, TransactionDatetime, OperatorName',
  });
  if (matched.length === 0) return null;

  let revenue = 0, liters = 0;
  const fuels = {};
  let firstAt = matched[0].TransactionDatetime;
  let lastAt  = matched[0].TransactionDatetime;
  const operator = matched[0].OperatorName ?? '—';
  const shopKey = matched[0].ShopKey ?? null;
  for (const r of matched) {
    const rowRevenue = Number(r.ShopCost ?? 0);
    const rowLiters = Number(r.Volume ?? 0);
    revenue += rowRevenue;
    liters  += rowLiters;
    const f = r.FuelName ?? '—';
    if (!fuels[f]) fuels[f] = { liters: 0, revenue: 0 };
    fuels[f].liters += rowLiters;
    fuels[f].revenue += rowRevenue;
    if (r.TransactionDatetime < firstAt) firstAt = r.TransactionDatetime;
    if (r.TransactionDatetime > lastAt)  lastAt  = r.TransactionDatetime;
  }

  const { data: report } = await supabase
    .from('shift_reports')
    .select('*')
    .eq('external_shift_key', currentKey)
    .maybeSingle();

  return {
    shiftKey: currentKey,
    shopKey,
    operator,
    operatorOriginal: operator,
    operatorOverride: null,
    operatorFinal: operator,
    revenue,
    liters,
    count: matched.length,
    firstAt,
    lastAt,
    fuels,
    parts: 1,
    mergedKeys: [currentKey],
    report: report ?? null,
    source: 'azs_selling',
  };
}

function dayKey(value) {
  const s = String(value ?? '');
  return s ? s.slice(0, 10) : null;
}

function normalizeOperator(value) {
  return String(value ?? '—').trim() || '—';
}

function mergeFuelMap(target, source = {}) {
  for (const [fuel, v] of Object.entries(source)) {
    if (!target[fuel]) target[fuel] = { liters: 0, revenue: 0 };
    target[fuel].liters += Number(v?.liters ?? 0);
    target[fuel].revenue += Number(v?.revenue ?? 0);
  }
}

// Combined sales ledger for the Sales screen:
// archived shifts come from azs_balance, the open/current shift from azs_selling.
// Same-day openings for the same operator are collapsed into one row.
export async function listSalesShiftGroups({
  stationId,
  from,
  to,
  limit = 30,
  includeCurrent = true,
} = {}) {
  const archived = await listShiftsFromBalance({ stationId, from, to, limit: 1000 })
    .catch((e) => { console.error('[shiftService] listShiftsFromBalance failed:', e); throw e; });
  const rows = [...archived];

  if (includeCurrent) {
    const current = await getCurrentSalesShift({ stationId })
      .catch((e) => { console.warn('[shiftService] getCurrentSalesShift failed:', e?.message ?? e); return null; });
    if (current) rows.push(current);
  }

  const filtered = rows.filter((row) => {
    const t = row.firstAt ?? row.lastAt ?? row.balanceAt ?? row.syncedAt ?? null;
    if (!t) return true;
    if (from && t < from) return false;
    if (to && t > to) return false;
    return true;
  });

  const grouped = new Map();
  for (const row of filtered) {
    const day = dayKey(row.firstAt ?? row.lastAt ?? row.balanceAt ?? row.syncedAt);
    const operator = normalizeOperator(row.operatorFinal ?? row.operatorOriginal ?? row.operator ?? '—');
    const canGroupByDay = Boolean(day) && operator !== '—' && Boolean(row.firstAt ?? row.lastAt);
    const key = canGroupByDay
      ? `${row.shopKey ?? '—'}:${day}:${operator}`
      : `shift:${row.shiftKey ?? row.mergedKeys?.join('-') ?? crypto.randomUUID?.() ?? Math.random()}`;
    const mergedKeys = Array.isArray(row.mergedKeys) && row.mergedKeys.length > 0
      ? row.mergedKeys
      : [row.shiftKey].filter((v) => v != null);

    if (!grouped.has(key)) {
      grouped.set(key, {
        ...row,
        operatorFinal: operator,
        operatorOriginal: row.operatorOriginal ?? row.operator ?? '—',
        parts: Number(row.parts ?? 1),
        mergedKeys: [...mergedKeys],
        balanceAt: row.balanceAt ?? null,
        hasSellingTime: Boolean(row.hasSellingTime),
        sourceTypes: new Set([row.source ?? 'unknown']),
      });
      continue;
    }

    const g = grouped.get(key);
    g.liters += Number(row.liters ?? 0);
    g.revenue += Number(row.revenue ?? 0);
    g.count += Number(row.count ?? 0);
    g.parts += Number(row.parts ?? 1);
    g.hasSellingTime = Boolean(g.hasSellingTime || row.hasSellingTime);
    if (row.balanceAt && (!g.balanceAt || row.balanceAt < g.balanceAt)) g.balanceAt = row.balanceAt;
    mergeFuelMap(g.fuels, row.fuels);
    for (const k of mergedKeys) {
      if (!g.mergedKeys.includes(k)) g.mergedKeys.push(k);
    }
    if (row.firstAt && (!g.firstAt || row.firstAt < g.firstAt)) g.firstAt = row.firstAt;
    if (row.lastAt && (!g.lastAt || row.lastAt > g.lastAt)) g.lastAt = row.lastAt;
    g.sourceTypes.add(row.source ?? 'unknown');
    if (!g.operatorOriginal || g.operatorOriginal === '—') g.operatorOriginal = row.operatorOriginal ?? row.operator ?? '—';
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      source: row.sourceTypes.size === 1 ? [...row.sourceTypes][0] : 'mixed',
      sourceLabel: row.sourceTypes.has('azs_balance') && row.sourceTypes.has('azs_selling')
        ? 'azs_balance + azs_selling'
        : row.sourceTypes.has('azs_balance')
          ? 'azs_balance'
          : 'azs_selling',
      sourceTypes: [...row.sourceTypes],
    }))
    .sort((a, b) => {
      const ax = new Date(a.lastAt ?? a.firstAt ?? a.balanceAt ?? a.syncedAt ?? 0).getTime();
      const bx = new Date(b.lastAt ?? b.firstAt ?? b.balanceAt ?? b.syncedAt ?? 0).getTime();
      return bx - ax;
    })
    .slice(0, limit);
}

// Close-out by ShiftKey — writes/updates shift_reports via SECURITY DEFINER RPC.
// payload: { actual_cash, actual_card, actual_qr, actual_coupons, actual_total?,
//            expenses_total, income_total, collection_total, cash_remaining, comment }
export async function closeoutByShiftKey(shiftKey, payload) {
  const { data, error } = await supabase.rpc('fingas_closeout_by_shift_key', {
    p_shift_key: shiftKey,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}

export async function getShiftReportByKey(shiftKey) {
  const { data, error } = await supabase
    .from('shift_reports')
    .select('*')
    .eq('external_shift_key', shiftKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Pending review = shift_reports submitted (approved_at is null) that match
// physical shifts from azs_selling.
export async function listPendingShiftReports({ stationId } = {}) {
  let q = supabase
    .from('shift_reports')
    .select('*')
    .is('approved_at', null)
    .not('external_shift_key', 'is', null)
    .order('submitted_at', { ascending: false });
  if (stationId) q = q.eq('station_id', stationId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Approve / reject — reuses the existing review RPC.
export async function reviewShiftReport(reportId, decision) {
  const { error } = await supabase.rpc('fingas_review_shift', {
    p_report_id: reportId,
    p_decision: decision,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// LEGACY: shift_sessions (kept for back-compat; do not use in new flows)
// ---------------------------------------------------------------------------

export async function listShifts({ stationId, status, limit = 50 } = {}) {
  let q = supabase
    .from('shift_sessions')
    .select(`
      *,
      operator:profiles!shift_sessions_operator_user_id_fkey ( id, full_name, email ),
      report:shift_reports ( * )
    `)
    .order('opened_at', { ascending: false })
    .limit(limit);
  if (stationId) q = q.eq('station_id', stationId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getCurrentOpenShift({ userId, stationId }) {
  let q = supabase
    .from('shift_sessions')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1);
  if (userId) q = q.eq('operator_user_id', userId);
  if (stationId) q = q.eq('station_id', stationId);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function openShift({ organizationId, stationId, userId }) {
  const { data, error } = await supabase
    .from('shift_sessions')
    .insert({
      organization_id: organizationId,
      station_id: stationId,
      operator_user_id: userId,
      status: 'open',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function closeShift(sessionId, payload) {
  const { data, error } = await supabase.rpc('fingas_close_shift', {
    p_session_id: sessionId,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}

export async function getShiftReport(sessionId) {
  const { data, error } = await supabase
    .from('shift_reports')
    .select('*')
    .eq('shift_session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function reviewShift(reportId, decision) {
  const { error } = await supabase.rpc('fingas_review_shift', {
    p_report_id: reportId,
    p_decision: decision,
  });
  if (error) throw error;
}

export async function listPendingShifts({ stationId, limit = 50 } = {}) {
  let q = supabase
    .from('shift_sessions')
    .select(`
      *,
      operator:profiles!shift_sessions_operator_user_id_fkey ( id, full_name, email ),
      report:shift_reports ( * )
    `)
    .eq('status', 'submitted')
    .order('closed_at', { ascending: false })
    .limit(limit);
  if (stationId) q = q.eq('station_id', stationId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
