// [CREATED BY CLAUDE CLI - 2026-06-04]
// Project: Fingas
// Purpose: Single source of truth for utilities reused across sales, shift,
// balance and tank services. Prior copies in each service drifted slightly
// (e.g. calibration deduction algorithms) — consolidating prevents silent
// divergence in revenue/liter math.

import { supabase } from '@/lib/supabaseClient';

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export function numberOrZero(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Dates
//
// POS rows arrive as ISO strings with timezone (UTC). For grouping by day we
// always want the LOCAL day so the owner's intuition (a sale at 23:30 belongs
// to Tuesday) matches. UTC slicing would put it on Wednesday for UTC+6.
// ---------------------------------------------------------------------------

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

export function localYMD(value) {
  const d = safeParseDate(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localYM(value) {
  const ymd = localYMD(value);
  return ymd ? ymd.slice(0, 7) : null;
}

// ---------------------------------------------------------------------------
// Fuel normalisation
//
// POS uses several spellings for the same grade ("92E5", "92Е5", "АИ-95",
// "АИ95"). They all collapse to one canonical name. Any change here affects
// reports, balance pairing, FIFO costing — so it lives in ONE place.
// ---------------------------------------------------------------------------

export function normalizeFuel(name) {
  const n = String(name ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (['92Е5', '92E5', 'АИ95', 'АИ-95'].includes(n)) return 'АИ-95';
  if (['АИ92', 'АИ-92'].includes(n)) return 'АИ-92';
  if (['ДТ', 'DIESEL', 'ДИЗЕЛЬ', 'ДТЛЕТО', 'ДТЗИМА'].includes(n)) return 'ДТ';
  if (['СУГ', 'ГАЗ', 'LPG'].includes(n)) return 'СУГ';
  return n;
}

// ---------------------------------------------------------------------------
// Station ID resolution
//
// Postgres stations.id (uuid) ↔ MySQL ShopKey (integer). Most analytics
// queries hit MySQL-synced tables (azs_*) and need the integer; the rest of
// the app deals in uuids. Cached per-call only — Supabase RLS varies by user
// so a long-lived cache would leak across sessions.
// ---------------------------------------------------------------------------

export async function resolveShopKey(stationId) {
  if (!stationId) return null;
  const { data, error } = await supabase
    .from('stations')
    .select('external_station_id')
    .eq('id', stationId)
    .maybeSingle();
  if (error) return null;
  return data?.external_station_id ?? null;
}

// ---------------------------------------------------------------------------
// Calibrations (TRK test pours)
//
// Loads calibrations for a station/date window and returns a Map keyed by
// `${YYYY-MM-DD}:${normalizedFuel}` → totalVolume. Both salesService and
// shiftService consume this so the deduction base is identical even if the
// downstream allocation differs (per-transaction chronological for sales,
// per-shift fuel-bucket for archived shifts).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Idle scheduling
//
// Откладывает работу до момента, когда браузер свободен — ленту главной
// рисуем мгновенно, а тяжёлые «подсказочные» запросы (счётчики алертов,
// долги контрагентов) едут после первого paint.
// ---------------------------------------------------------------------------

export function runWhenIdle(fn, { timeout = 1500 } = {}) {
  if (typeof window === 'undefined') {
    fn();
    return () => {};
  }
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback?.(handle);
  }
  const id = window.setTimeout(fn, 1);
  return () => window.clearTimeout(id);
}

export async function loadCalibrationsMap({ stationId, fromDate, toDate } = {}) {
  const map = new Map();
  if (!stationId || !fromDate || !toDate) return map;
  try {
    const { data: calRows } = await supabase
      .from('calibrations')
      .select('date, time, fuel, volume')
      .eq('station_id', stationId)
      .gte('date', fromDate)
      .lte('date', toDate);
    for (const c of calRows ?? []) {
      const day = String(c.date ?? '').slice(0, 10);
      const fuel = normalizeFuel(c.fuel);
      const volume = numberOrZero(c.volume);
      if (!day || !fuel || !(volume > 0)) continue;
      const key = `${day}:${fuel}`;
      map.set(key, numberOrZero(map.get(key)) + volume);
    }
  } catch (e) {
    console.warn('[fingasUtils] loadCalibrationsMap failed:', e?.message ?? e);
  }
  return map;
}
