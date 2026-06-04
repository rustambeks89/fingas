// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: READ-ONLY sales analytics over MySQL-synced source tables.
// Sales analytics are based on azs_selling. azs_balance is used by the shifts
// module for archived shift reconciliation, but it must not be mixed into the
// sales dashboard: azs_balance rows are counter snapshots, not transactions.
// Never insert/update/delete here.
//
// Real schema: TransactionDatetime · FuelName · Volume · ShopCost ·
// BasePaymentTypeKey · OperatorName · ShiftKey · ShopKey.
// ShopKey is the station identifier from MySQL — maps to
// public.stations.external_station_id (integer).

import { supabase } from '@/lib/supabaseClient';
import {
  safeParseDate,
  localYMD,
  localYM,
  numberOrZero,
  normalizeFuel,
  resolveShopKey,
  loadCalibrationsMap,
} from '@/lib/fingasUtils';

// Re-exported for external consumers that previously imported these from here.
export { safeParseDate, normalizeFuel };

// Page through raw sales rows. When `stationId` is given, we look up the
// matching ShopKey and filter; otherwise we return rows for ALL ShopKeys the
// user is allowed to read (RLS handles cross-org isolation).
export async function listSales({ stationId, from, to, shiftKey, limit = 200, columns = '*' } = {}) {
  const shopKey = await resolveShopKey(stationId);
  let q = supabase
    .from('azs_selling')
    .select(columns)
    .order('TransactionDatetime', { ascending: false })
    .limit(limit);
  if (shopKey != null) q = q.eq('ShopKey', shopKey);
  if (shiftKey != null) q = q.eq('ShiftKey', shiftKey);
  if (from) q = q.gte('TransactionDatetime', from);
  if (to)   q = q.lte('TransactionDatetime', to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

function getRowDateTime(row) {
  return row?.TransactionDatetime ?? row?.transaction_datetime ?? null;
}

function getRowFuel(row) {
  return row?.FuelName ?? row?.fuel_name ?? null;
}

function getRowVolume(row) {
  return row?.Volume ?? row?.volume ?? 0;
}

function getRowRevenue(row) {
  return row?.ShopCost ?? row?.shop_cost ?? 0;
}

export async function applyCalibrationDeductionsToSalesRows({ stationId, from, to, rows = [] } = {}) {
  const indexedRows = (rows ?? []).map((row, index) => ({ row, index }));
  if (indexedRows.length === 0) {
    return {
      rows: [],
      revenue: 0,
      liters: 0,
      grossRevenue: 0,
      grossLiters: 0,
      calibrationRevenue: 0,
      calibrationLiters: 0,
    };
  }

  let grossRevenue = 0;
  let grossLiters = 0;
  for (const item of indexedRows) {
    grossRevenue += numberOrZero(getRowRevenue(item.row));
    grossLiters += numberOrZero(getRowVolume(item.row));
  }

  if (!stationId) {
    return {
      rows: indexedRows.map((item) => ({ ...item.row })),
      revenue: grossRevenue,
      liters: grossLiters,
      grossRevenue,
      grossLiters,
      calibrationRevenue: 0,
      calibrationLiters: 0,
    };
  }

  const bounds = {
    min: from ? safeParseDate(from) : null,
    max: to ? safeParseDate(to) : null,
  };
  if (!bounds.min || !bounds.max) {
    for (const item of indexedRows) {
      const dt = safeParseDate(getRowDateTime(item.row));
      if (!dt) continue;
      if (!bounds.min || dt < bounds.min) bounds.min = dt;
      if (!bounds.max || dt > bounds.max) bounds.max = dt;
    }
  }

  const calMap = bounds.min && bounds.max
    ? await loadCalibrationsMap({
        stationId,
        fromDate: localYMD(bounds.min),
        toDate: localYMD(bounds.max),
      })
    : new Map();

  if (calMap.size === 0) {
    return {
      rows: indexedRows.map((item) => ({ ...item.row })),
      revenue: grossRevenue,
      liters: grossLiters,
      grossRevenue,
      grossLiters,
      calibrationRevenue: 0,
      calibrationLiters: 0,
    };
  }

  const chronological = indexedRows
    .map((item) => ({
      ...item,
      ts: safeParseDate(getRowDateTime(item.row))?.getTime() ?? null,
    }))
    .sort((a, b) => {
      if (a.ts == null && b.ts == null) return a.index - b.index;
      if (a.ts == null) return -1;
      if (b.ts == null) return 1;
      if (a.ts === b.ts) return a.index - b.index;
      return a.ts - b.ts;
    });

  const adjustedByIndex = new Map();
  let netRevenue = 0;
  let netLiters = 0;
  for (const item of chronological) {
    const baseRow = item.row;
    const originalVolume = numberOrZero(getRowVolume(baseRow));
    const originalRevenue = numberOrZero(getRowRevenue(baseRow));
    let volume = originalVolume;
    let revenue = originalRevenue;
    let calibrationDeductedVolume = 0;
    let calibrationDeductedRevenue = 0;

    const day = localYMD(getRowDateTime(baseRow));
    const fuel = normalizeFuel(getRowFuel(baseRow));
    if (day && fuel && volume > 0) {
      const key = `${day}:${fuel}`;
      const debt = numberOrZero(calMap.get(key));
      if (debt > 0) {
        const deduct = Math.min(volume, debt);
        const price = originalVolume > 0 ? originalRevenue / originalVolume : 0;
        volume = Math.max(0, originalVolume - deduct);
        revenue = volume * price;
        calibrationDeductedVolume = deduct;
        calibrationDeductedRevenue = originalRevenue - revenue;
        calMap.set(key, debt - deduct);
      }
    }

    adjustedByIndex.set(item.index, {
      ...baseRow,
      Volume: volume,
      ShopCost: revenue,
      grossVolume: originalVolume,
      grossShopCost: originalRevenue,
      calibrationDeductedVolume,
      calibrationDeductedRevenue,
    });
    netRevenue += revenue;
    netLiters += volume;
  }

  const adjustedRows = indexedRows.map((item) => adjustedByIndex.get(item.index) ?? { ...item.row });
  return {
    rows: adjustedRows,
    revenue: netRevenue,
    liters: netLiters,
    grossRevenue,
    grossLiters,
    calibrationRevenue: grossRevenue - netRevenue,
    calibrationLiters: grossLiters - netLiters,
  };
}

// Aggregate revenue + liters for a shift window. Из суммы продаж
// вычитаются поверочные проливы (calibrations) за тот же период по тому
// же баку — топливо возвращается в резервуар и не считается реальной
// выручкой. Цена литра берётся как средняя по azs_selling за период.
export async function aggregateForShift({ stationId, from, to } = {}) {
  const rows = await listSales({
    stationId,
    from,
    to,
    limit: 50000,
    columns: 'TransactionDatetime, FuelName, Volume, ShopCost, ShiftKey, ShopKey, OperatorName, BasePaymentTypeKey',
  });
  const adjusted = await applyCalibrationDeductionsToSalesRows({ stationId, from, to, rows });

  return {
    revenue: adjusted.revenue,
    liters: adjusted.liters,
    count: adjusted.rows.length,
    rows: adjusted.rows,
    calibrationLiters: adjusted.calibrationLiters,
    calibrationRevenue: adjusted.calibrationRevenue,
    grossRevenue: adjusted.grossRevenue,
    grossLiters: adjusted.grossLiters,
  };
}

// FIFO cost-of-goods-sold for a period. Walks supplies and sales together.
export async function computeFifoCost({ stationId, from, to }) {
  const shopKey = await resolveShopKey(stationId);

  const horizon = new Date();
  horizon.setDate(horizon.getDate() - 365);
  const fromHist = horizon.toISOString();

  let supplyQ = supabase
    .from('fuel_supply')
    .select('date, fuel_type, liters_actual, price_per_liter, station_id')
    .order('date', { ascending: true })
    .limit(5000);
  if (stationId) supplyQ = supplyQ.eq('station_id', stationId);

  let salesQ = supabase
    .from('azs_selling')
    .select('TransactionDatetime, FuelName, Volume, ShopKey')
    .gte('TransactionDatetime', fromHist)
    .lte('TransactionDatetime', to)
    .order('TransactionDatetime', { ascending: true })
    .limit(50000);
  if (shopKey != null) salesQ = salesQ.eq('ShopKey', shopKey);

  const [suppliesQ, salesR, calMap] = await Promise.all([
    supplyQ,
    salesQ,
    loadCalibrationsMap({
      stationId,
      fromDate: fromHist.slice(0, 10),
      toDate: String(to).slice(0, 10),
    }),
  ]);
  const supplies = suppliesQ.data ?? [];
  const sales = salesR.data ?? [];

  const layers = new Map();
  let si = 0;
  const result = { total: 0, byFuel: {} };
  const fromDate = String(from).slice(0, 10);
  const toDate = String(to).slice(0, 10);

  for (const sale of sales) {
    const saleDate = String(sale.TransactionDatetime ?? '').slice(0, 10);
    while (si < supplies.length && supplies[si].date <= saleDate) {
      const sup = supplies[si];
      const fuel = (sup.fuel_type ?? '').trim();
      if (!layers.has(fuel)) layers.set(fuel, []);
      layers.get(fuel).push({
        liters: Number(sup.liters_actual ?? 0),
        price: Number(sup.price_per_liter ?? 0),
      });
      si++;
    }

    const fuel = normalizeFuel(sale.FuelName);
    const key = `${saleDate}:${fuel}`;
    let saleVol = Number(sale.Volume ?? 0);
    if (calMap.has(key)) {
      const debt = calMap.get(key);
      if (debt > 0 && saleVol > 0) {
        const deduct = Math.min(saleVol, debt);
        saleVol -= deduct;
        calMap.set(key, debt - deduct);
      }
    }
    if (saleVol <= 0.0001) continue;

    let need = saleVol;
    const queue = layers.get(fuel) ?? [];
    let cost = 0;
    while (need > 0.0001 && queue.length > 0) {
      const layer = queue[0];
      const take = Math.min(layer.liters, need);
      cost += take * layer.price;
      layer.liters -= take;
      need -= take;
      if (layer.liters <= 0.0001) queue.shift();
    }

    if (saleDate >= fromDate && saleDate <= toDate) {
      result.total += cost;
      if (!result.byFuel[fuel]) result.byFuel[fuel] = { sold_liters: 0, cost: 0 };
      result.byFuel[fuel].sold_liters += saleVol;
      result.byFuel[fuel].cost += cost;
    }
  }
  return result;
}

export async function aggregateByFuel({ stationId, from, to } = {}) {
  const rows = await listSales({
    stationId, from, to, limit: 50000,
    columns: 'FuelName, ShopCost, Volume, TransactionDatetime',
  });

  const calMap = await loadCalibrationsMap({
    stationId,
    fromDate: from ? String(from).slice(0, 10) : null,
    toDate: to ? String(to).slice(0, 10) : null,
  });

  const map = new Map();
  for (const r of rows) {
    const fuel = normalizeFuel(r.FuelName ?? r.fuel_name ?? '—');
    const day = String(r.TransactionDatetime ?? r.transaction_datetime ?? '').slice(0, 10);
    const key = `${day}:${fuel}`;
    let vol = Number(r.Volume ?? 0);
    let cost = Number(r.ShopCost ?? 0);

    if (calMap.has(key)) {
      const debt = calMap.get(key);
      if (debt > 0 && vol > 0) {
        const deduct = Math.min(vol, debt);
        const price = cost / vol;
        vol = Math.max(0, vol - deduct);
        cost = vol * price;
        calMap.set(key, debt - deduct);
      }
    }

    if (!map.has(fuel)) map.set(fuel, { fuel, revenue: 0, liters: 0, count: 0 });
    const g = map.get(fuel);
    g.revenue += cost;
    g.liters += vol;
    g.count += 1;
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

// Aggregate by payment type (BasePaymentTypeKey on azs_selling).
const PAYMENT_LABELS = {
  '1': 'Наличные', '2': 'Карта', '3': 'QR', '4': 'Талон',
  '0': 'Наличные', '5': 'Безнал', '6': 'Кредит',
};

export async function aggregateByPaymentType({ stationId, from, to } = {}) {
  const rows = await listSales({
    stationId, from, to, limit: 5000,
    columns: 'BasePaymentTypeKey, ShopCost, Volume, FuelName, TransactionDatetime',
  });
  const adjusted = await applyCalibrationDeductionsToSalesRows({ stationId, from, to, rows });
  const map = new Map();
  for (const r of adjusted.rows) {
    const k = String(r.BasePaymentTypeKey ?? '—');
    if (!map.has(k)) map.set(k, { key: k, label: PAYMENT_LABELS[k] ?? `Тип ${k}`, revenue: 0, count: 0 });
    const g = map.get(k);
    g.revenue += Number(r.ShopCost ?? 0);
    g.count += 1;
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

// Aggregate by shift (ShiftKey). Each shift = one row with operator name,
// time range, revenue, liters, #transactions, fuel mix.
export async function aggregateByShift({ stationId, from, to, limit = 20 } = {}) {
  const rows = await listSales({
    stationId, from, to, limit: 10000,
    columns: 'ShiftKey, OperatorName, ShopCost, Volume, TransactionDatetime, FuelName',
  });
  const adjusted = await applyCalibrationDeductionsToSalesRows({ stationId, from, to, rows });
  const map = new Map();
  for (const r of adjusted.rows) {
    const key = r.ShiftKey ?? '—';
    if (!map.has(key)) {
      map.set(key, {
        shiftKey: key,
        operator: r.OperatorName ?? '—',
        revenue: 0,
        liters: 0,
        count: 0,
        firstAt: r.TransactionDatetime,
        lastAt: r.TransactionDatetime,
        fuels: {},
      });
    }
    const g = map.get(key);
    g.revenue += Number(r.ShopCost ?? 0);
    g.liters += Number(r.Volume ?? 0);
    g.count += 1;
    const fuel = r.FuelName ?? '—';
    g.fuels[fuel] = (g.fuels[fuel] ?? 0) + Number(r.Volume ?? 0);
    if (r.TransactionDatetime < g.firstAt) g.firstAt = r.TransactionDatetime;
    if (r.TransactionDatetime > g.lastAt)  g.lastAt = r.TransactionDatetime;
  }
  return [...map.values()]
    .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
    .slice(0, limit);
}

// Daily timeseries [{day:'YYYY-MM-DD', label, revenue, liters, count}].
// TransactionDatetime приходит из БД в UTC ("...+00"). Чтобы группировать
// по локальному дню/месяцу (так привычно пользователю), парсим в Date и
// берём local-год/месяц/число — иначе ночные транзакции (UTC < 06:00 для
// UTC+6) попадают в предыдущий день. localYM / localYMD теперь живут в
// '@/lib/fingasUtils'.

export async function aggregateByDay({ stationId, from, to } = {}) {
  const rows = await listSales({
    stationId, from, to, limit: 50000,
    columns: 'TransactionDatetime, ShopCost, Volume, FuelName',
  });
  const adjusted = await applyCalibrationDeductionsToSalesRows({ stationId, from, to, rows });
  const map = new Map();
  for (const r of adjusted.rows) {
    const dt = localYMD(r.TransactionDatetime);
    if (!dt) continue;
    if (!map.has(dt)) {
      const d = new Date(`${dt}T00:00:00`);
      map.set(dt, {
        day: dt,
        label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }),
        weekday: d.toLocaleDateString('ru-RU', { weekday: 'short' }),
        revenue: 0,
        liters: 0,
        count: 0,
      });
    }
    const g = map.get(dt);
    g.revenue += Number(r.ShopCost ?? 0);
    g.liters += Number(r.Volume ?? 0);
    g.count += 1;
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// Группировка по месяцам — для длинных периодов (год) чтобы график не
// превращался в кашу из 365 точек и не требовал миллион строк продаж.
export async function aggregateByMonth({ stationId, from, to } = {}) {
  const rows = await listSales({
    stationId, from, to, limit: 200000,
    columns: 'TransactionDatetime, ShopCost, Volume, FuelName',
  });
  const adjusted = await applyCalibrationDeductionsToSalesRows({ stationId, from, to, rows });
  const map = new Map();
  for (const r of adjusted.rows) {
    const ym = localYM(r.TransactionDatetime);
    if (!ym) continue;
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
    g.revenue += Number(r.ShopCost ?? 0);
    g.liters += Number(r.Volume ?? 0);
    g.count += 1;
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// Hour-of-day × weekday heatmap: returns 7×24 matrix of revenue.
export async function aggregateHourHeatmap({ stationId, from, to } = {}) {
  const rows = await listSales({
    stationId,
    from,
    to,
    limit: 20000,
    columns: 'TransactionDatetime, ShopCost, Volume, FuelName',
  });
  const adjusted = await applyCalibrationDeductionsToSalesRows({ stationId, from, to, rows });
  // matrix[dow][hour] = revenue
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const r of adjusted.rows) {
    const d = r.TransactionDatetime ? new Date(r.TransactionDatetime) : null;
    if (!d || isNaN(d)) continue;
    // ru week: mon=0 .. sun=6
    const dow = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    matrix[dow][hour] += Number(r.ShopCost ?? 0);
    if (matrix[dow][hour] > max) max = matrix[dow][hour];
  }
  return { matrix, max };
}

// Top operators by revenue.
export async function aggregateByOperator({ stationId, from, to, limit = 10 } = {}) {
  const rows = await listSales({
    stationId, from, to, limit: 50000,
    columns: 'OperatorName, ShopCost, Volume, ShiftKey, FuelName, TransactionDatetime',
  });
  const adjusted = await applyCalibrationDeductionsToSalesRows({ stationId, from, to, rows });
  const map = new Map();
  for (const r of adjusted.rows) {
    const op = r.OperatorName ?? '—';
    if (!map.has(op)) map.set(op, { operator: op, revenue: 0, liters: 0, count: 0, shifts: new Set() });
    const g = map.get(op);
    g.revenue += Number(r.ShopCost ?? 0);
    g.liters  += Number(r.Volume ?? 0);
    g.count   += 1;
    if (r.ShiftKey != null) g.shifts.add(r.ShiftKey);
  }
  return [...map.values()]
    .map((g) => ({ ...g, shifts: g.shifts.size }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

// Revenue per hour-of-day, summed across all selected days.
export async function aggregateByHour({ stationId, from, to } = {}) {
  const rows = await listSales({
    stationId, from, to, limit: 50000,
    columns: 'TransactionDatetime, ShopCost, Volume, FuelName',
  });
  const adjusted = await applyCalibrationDeductionsToSalesRows({ stationId, from, to, rows });
  const bins = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${h}:00`, revenue: 0, count: 0 }));
  for (const r of adjusted.rows) {
    const d = r.TransactionDatetime ? new Date(r.TransactionDatetime) : null;
    if (!d || isNaN(d)) continue;
    const h = d.getHours();
    bins[h].revenue += Number(r.ShopCost ?? 0);
    bins[h].count   += 1;
  }
  return bins;
}

// Compare two non-overlapping windows. Returns {current, prior, delta, deltaPct}.
export async function compareWindows({ stationId, currentFrom, currentTo, priorFrom, priorTo }) {
  const [cur, prev] = await Promise.all([
    aggregateForShift({ stationId, from: currentFrom, to: currentTo }),
    aggregateForShift({ stationId, from: priorFrom, to: priorTo }),
  ]);
  return {
    current: cur,
    prior: prev,
    delta: cur.revenue - prev.revenue,
    deltaPct: prev.revenue > 0 ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : null,
    litersDelta: cur.liters - prev.liters,
    litersDeltaPct: prev.liters > 0 ? ((cur.liters - prev.liters) / prev.liters) * 100 : null,
  };
}

