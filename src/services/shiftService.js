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
// Каждая ShiftKey из POS = одна смена в UI. Раньше пробовали склеивать
// «осколочные» смены того же оператора в коротком окне, но это путало
// больше чем помогало — теперь не объединяем ничего.
//
// Operator override: lookup public.shift_operator_overrides on (org, shop, shift_key).
// operator_final_name = operator_corrected_name || operator_original_name.

const COUNTER_FLOOR = 1_000_000;
const SHIFT_HISTORY_FLOOR = 631;
const SHIFT_KEY_CHUNK = 200;

export function safeParseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  let str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const parts = str.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  if (str.includes('-') && str.includes(' ')) {
    str = str.replace(' ', 'T');
  }
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) return d;
  const d2 = new Date(str.replace(/-/g, '/'));
  if (!Number.isNaN(d2.getTime())) return d2;
  return null;
}

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
      .select('ShiftKey, ShopKey, DatetimeShiftBegin, DatetimeShiftEnd, OperatorName')
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

// Время/оператор/чеки берём из azs_shift (одна строка на смену), а selling
// нужен только для счётчика транзакций. Поэтому здесь просим Postgres
// сгруппировать одним запросом — никаких пагинаций по 5000 строк на чанк.
async function loadSellingCountByShiftKeys({ shopKey, shiftKeys }) {
  const counts = new Map();
  let keys = [...new Set(shiftKeys.filter((key) => key != null))];
  if (keys.length === 0) return counts;

  // OPTIMIZATION: If there are many shifts (e.g., month or year view), only
  // query transaction counts in azs_selling for the 30 most recent shifts.
  // This avoids downloading up to 100,000 transaction rows and freezing the app.
  if (keys.length > 30) {
    keys.sort((a, b) => Number(b) - Number(a));
    keys = keys.slice(0, 30);
  }

  for (let i = 0; i < keys.length; i += SHIFT_KEY_CHUNK) {
    const chunk = keys.slice(i, i + SHIFT_KEY_CHUNK);
    // По одной короткой выборке на чанк, без paging.
    // OperatorName используется как fallback если azs_shift не отдал имя.
    let q = supabase
      .from('azs_selling')
      .select('ShiftKey, OperatorName')
      .in('ShiftKey', chunk)
      .limit(100000);
    if (shopKey != null) q = q.eq('ShopKey', shopKey);

    const { data, error } = await q;
    if (error) throw error;

    for (const r of data ?? []) {
      const key = r.ShiftKey;
      if (key == null) continue;
      if (!counts.has(key)) counts.set(key, { count: 0, operator: null });
      const g = counts.get(key);
      g.count += 1;
      if (!g.operator && r.OperatorName && r.OperatorName !== '—') {
        g.operator = r.OperatorName;
      }
    }
  }

  return counts;
}

// List per-(ShiftKey, FuelName) aggregated rows from azs_balance, plus the
// matching operator/time data from azs_selling.
// Returns an array of {
//   shiftKey, shopKey, operatorOriginal, operatorOverride, operatorFinal,
//   firstAt, lastAt, revenue, liters, fuels: {[fuel]: {liters, revenue}},
//   parts: number  (>1 if rows were merged)
// }
export async function listShiftsFromBalance({ stationId, from, to, limit = 50, loadCounts = true } = {}) {
  const shopKey = await resolveShopKey(stationId);

  // 1. Raw azs_balance — только нужные колонки (раньше был select('*')
  // и тянули десятки полей зря). Только counter-строки выше floor.
  let balQ = supabase
    .from('azs_balance')
    .select('ShiftKey, ShopKey, FuelName, BeginBalance, EndBalance, EndPrice, synced_at')
    .gt('BeginBalance', COUNTER_FLOOR)
    .gt('EndBalance',   COUNTER_FLOOR)
    .gte('ShiftKey', SHIFT_HISTORY_FLOOR)
    .order('synced_at', { ascending: false })
    .limit(5000);
  if (shopKey != null) balQ = balQ.eq('ShopKey', shopKey);
  if (from) {
    const fromDate = new Date(from);
    fromDate.setDate(fromDate.getDate() - 2); // 2 days buffer before
    balQ = balQ.gte('synced_at', fromDate.toISOString());
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 3); // 3 days buffer after
    balQ = balQ.lte('synced_at', toDate.toISOString());
  }

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
    const fuel = normalizeFuel(r.FuelName ?? '—');
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

  // azs_shift = авторитетные даты/оператор. azs_selling нужен только
  // для счётчика чеков (и операторa-фолбэка). Оба не должны валить весь
  // архив — на ошибке покажем то что есть.
  const [shiftByKey, sellingCounts] = await Promise.all([
    loadAzsShiftMetaByShiftKeys({ shopKey, shiftKeys: keys }).catch((e) => {
      console.warn('[shiftService] azs_shift meta failed:', e?.message ?? e);
      return new Map();
    }),
    loadCounts
      ? loadSellingCountByShiftKeys({ shopKey, shiftKeys: keys }).catch((e) => {
          console.warn('[shiftService] azs_selling count failed:', e?.message ?? e);
          return new Map();
        })
      : Promise.resolve(new Map()),
  ]);

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
    const c = sellingCounts.get(k);
    const h = shiftByKey.get(k);
    // Оператор: приоритет azs_shift (авторитетная карточка смены), затем
    // azs_selling (по транзакциям), затем override от админа.
    const operatorOriginal = h?.operator ?? c?.operator ?? null;
    const operatorOverride = overrideMap.get(`${g.shopKey}:${k}`) ?? null;
    const operatorFinal = operatorOverride && operatorOverride.trim() ? operatorOverride : (operatorOriginal ?? '—');
    return {
      shiftKey: k,
      shopKey: g.shopKey,
      operatorOriginal,
      operatorOverride,
      operatorFinal,
      firstAt: h?.firstAt ?? null,
      lastAt:  h?.lastAt  ?? null,
      balanceAt: g.balanceAt ?? null,
      syncedAt: g.syncedAt ?? null,
      // Флаг исторически назывался hasSellingTime, но реально нам нужно знать,
      // есть ли вообще транзакции по этой смене в azs_selling — это решает,
      // показывать счётчик чеков или прочерк. Привязка к azs_shift была ошибкой
      // (после рефакторинга дат архив без azs_shift скрывал и чеки).
      hasSellingTime: (c?.count ?? 0) > 0,
      liters: g.liters,
      revenue: g.revenue,
      count: c?.count ?? 0,
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

  // 6.5. Вычитаем поверки из продаж. Поверочный пролив проходит через
  // дисперсер и попадает в azs_selling/azs_balance как обычная продажа,
  // но по факту топливо возвращается в бак. Поэтому литры и выручку
  // соответствующих фьюэлов мы уменьшаем на объём поверки за тот же день.
  // Цена литра при вычитании берётся из самой смены (revenue/liters по
  // марке топлива), чтобы выручка падала пропорционально.
  if (stationId) {
    try {
      const dateBounds = combined.reduce((acc, s) => {
        const a = s.firstAt ?? s.lastAt ?? s.balanceAt ?? s.syncedAt;
        if (!a) return acc;
        const d = safeParseDate(a);
        if (!d) return acc;
        if (!acc.min || d < acc.min) acc.min = d;
        if (!acc.max || d > acc.max) acc.max = d;
        return acc;
      }, { min: null, max: null });
      if (dateBounds.min && dateBounds.max) {
        const calFromDate = localYMD(new Date(dateBounds.min.getTime() - 86400000));
        const calToDate   = localYMD(new Date(dateBounds.max.getTime() + 86400000));
        const { data: calRows } = await supabase
          .from('calibrations')
          .select('date, time, fuel, volume')
          .eq('station_id', stationId)
          .gte('date', calFromDate)
          .lte('date', calToDate);
        if (calRows && calRows.length > 0) {
          for (const c of calRows) {
            const calTimeStr = c.time || '00:00:00';
            const calDateTime = safeParseDate(`${c.date}T${calTimeStr}`);
            if (!calDateTime) continue;
            const fuel = normalizeFuel(c.fuel);
            const volume = Number(c.volume ?? 0);
            if (!(volume > 0)) continue;

            let matchedShift = null;

            // 1. Match by shift duration time interval
            for (const s of combined) {
              if (s.firstAt && s.lastAt) {
                const start = safeParseDate(s.firstAt);
                const end = safeParseDate(s.lastAt);
                if (start && end && calDateTime >= start && calDateTime <= end) {
                  matchedShift = s;
                  break;
                }
              }
            }

            // 2. Fallback to day matching
            if (!matchedShift) {
              const calDay = localYMD(calDateTime);
              for (const s of combined) {
                const sDay = localYMD(s.firstAt ?? s.lastAt ?? s.balanceAt ?? s.syncedAt);
                if (sDay === calDay) {
                  matchedShift = s;
                  break;
                }
              }
            }

            if (matchedShift) {
              const fuelGroup = matchedShift.fuels?.[fuel];
              if (fuelGroup && fuelGroup.liters > 0) {
                const priceForFuel = fuelGroup.liters > 0 ? fuelGroup.revenue / fuelGroup.liters : 0;
                const originalLiters = fuelGroup.liters;
                const originalRevenue = fuelGroup.revenue;

                const deduct = Math.min(originalLiters, volume);
                fuelGroup.liters = Math.max(0, originalLiters - deduct);
                fuelGroup.revenue = fuelGroup.liters * priceForFuel;

                const deductedLiters = originalLiters - fuelGroup.liters;
                const deductedRevenue = originalRevenue - fuelGroup.revenue;

                matchedShift.liters -= deductedLiters;
                matchedShift.revenue -= deductedRevenue;

                matchedShift.calibrationDeducted = (matchedShift.calibrationDeducted ?? 0) + deductedLiters;
                matchedShift.calibrationDeductedRevenue = (matchedShift.calibrationDeductedRevenue ?? 0) + deductedRevenue;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[shiftService] calibration deduction failed:', e?.message ?? e);
    }
  }

  // 6. БЕЗ объединения. Раньше склеивали смены того же оператора в коротком
  // окне (ошибочное закрытие+открытие), но это приводило к путанице — теперь
  // каждая ShiftKey показывается отдельной строкой как есть в POS.
  // newest first.
  const newestKey = (s) => {
    const v = s.lastAt ?? s.firstAt ?? s.balanceAt ?? s.syncedAt;
    return v ? new Date(v).getTime() : 0;
  };
  combined.sort((a, b) => newestKey(b) - newestKey(a));

  return combined.slice(0, limit);
}

// Currently-active shift comes from azs_selling: azs_balance is archive/close
// data and can lag until the POS shift is finalized.
export async function getCurrentShiftFromBalance({ stationId } = {}) {
  return getCurrentSalesShift({ stationId });
}

// =============================================================================
// Aggregations FROM azs_balance (authoritative source for revenue/liters).
// Каждая смена даёт (EndBalance−BeginBalance)×EndPrice по каждой марке топлива.
// Дата атрибуции — DatetimeShiftBegin (из azs_shift), а не synced_at.
// =============================================================================

function localYMD(value) {
  const d = safeParseDate(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function aggregateBalanceByDay({ stationId, from, to } = {}) {
  const shifts = await listShiftsFromBalance({ stationId, from, to, limit: 5000, loadCounts: false });
  const map = new Map();
  for (const s of shifts) {
    const day = localYMD(s.firstAt ?? s.lastAt ?? s.balanceAt ?? s.syncedAt);
    if (!day) continue;
    if (!map.has(day)) {
      const d = new Date(`${day}T00:00:00`);
      map.set(day, {
        day,
        label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }),
        weekday: d.toLocaleDateString('ru-RU', { weekday: 'short' }),
        revenue: 0,
        liters: 0,
        count: 0,
      });
    }
    const g = map.get(day);
    g.revenue += Number(s.revenue ?? 0);
    g.liters  += Number(s.liters ?? 0);
    g.count   += Number(s.count ?? 0);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export async function aggregateBalanceByMonth({ stationId, from, to } = {}) {
  const shifts = await listShiftsFromBalance({ stationId, from, to, limit: 10000, loadCounts: false });
  const map = new Map();
  for (const s of shifts) {
    const ymd = localYMD(s.firstAt ?? s.lastAt ?? s.balanceAt ?? s.syncedAt);
    if (!ymd) continue;
    const ym = ymd.slice(0, 7);
    if (!map.has(ym)) {
      const d = new Date(`${ym}-01T00:00:00`);
      map.set(ym, {
        day: `${ym}-01`,
        label: d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
        weekday: '',
        revenue: 0,
        liters: 0,
        count: 0,
      });
    }
    const g = map.get(ym);
    g.revenue += Number(s.revenue ?? 0);
    g.liters  += Number(s.liters ?? 0);
    g.count   += Number(s.count ?? 0);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
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

// ===========================================================================
// REPORT LINES & EDIT OVERRIDES
// ===========================================================================

export async function listShiftReportLines(reportId) {
  const { data, error } = await supabase
    .from('shift_report_lines')
    .select('*')
    .eq('shift_report_id', reportId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveShiftReportLines(reportId, organizationId, stationId, lines) {
  const toDelete = lines.filter((l) => l._deleted && l.id);
  const toUpsert = lines.filter((l) => !l._deleted).map((l) => {
    const r = {
      shift_report_id: reportId,
      organization_id: organizationId,
      station_id: stationId ?? null,
      kind: l.kind,
      category: l.category || null,
      amount: Number(l.amount) || 0,
      counterparty_id: l.counterparty_id || null,
      wallet_id: l.wallet_id || null,
      payment_type: l.payment_type || 'cash',
      note: l.note || null,
    };
    if (l.id && !String(l.id).startsWith('temp-')) {
      r.id = l.id;
    }
    return r;
  });

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('shift_report_lines')
      .delete()
      .in('id', toDelete.map((l) => l.id));
    if (delErr) throw delErr;
  }

  if (toUpsert.length > 0) {
    const { error: upsErr } = await supabase
      .from('shift_report_lines')
      .upsert(toUpsert);
    if (upsErr) throw upsErr;
  }
}

export async function updateShiftReport(reportId, patch) {
  const { data, error } = await supabase.rpc('fingas_update_shift_report', {
    p_report_id: reportId,
    p_patch: patch,
  });
  if (error) throw error;
  return data;
}

export function normalizeFuel(name) {
  const n = String(name ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (['92Е5', '92E5', 'АИ95', 'АИ-95'].includes(n)) return 'АИ-95';
  if (['АИ92', 'АИ-92'].includes(n)) return 'АИ-92';
  if (['ДТ', 'DIESEL', 'ДИЗЕЛЬ', 'ДТ ЛЕТО', 'ДТ ЗИМА'].includes(n)) return 'ДТ';
  if (['СУГ', 'ГАЗ', 'LPG'].includes(n)) return 'СУГ';
  return n;
}
