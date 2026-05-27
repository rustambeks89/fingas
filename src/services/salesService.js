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

// Internal: resolve station UUID → external ShopKey integer.
async function resolveShopKey(stationId) {
  if (!stationId) return null;
  const { data, error } = await supabase
    .from('stations')
    .select('external_station_id')
    .eq('id', stationId)
    .maybeSingle();
  if (error) return null;
  return data?.external_station_id ?? null;
}

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

// Aggregate revenue + liters for a shift window. Из суммы продаж
// вычитаются поверочные проливы (calibrations) за тот же период по тому
// же баку — топливо возвращается в резервуар и не считается реальной
// выручкой. Цена литра берётся как средняя по azs_selling за период.
export async function aggregateForShift({ stationId, from, to } = {}) {
  const rows = await listSales({ stationId, from, to, limit: 50000 });
  let revenue = 0;
  let liters = 0;
  // Средняя цена за литр по каждой марке за период — нужна чтобы
  // снять выручку пропорционально поверке.
  const perFuel = new Map(); // fuel -> { liters, revenue }
  for (const r of rows) {
    const cost = Number(r.ShopCost ?? 0);
    const vol  = Number(r.Volume   ?? 0);
    revenue += cost;
    liters  += vol;
    const fuel = r.FuelName ?? '';
    if (fuel) {
      const g = perFuel.get(fuel) ?? { liters: 0, revenue: 0 };
      g.liters  += vol;
      g.revenue += cost;
      perFuel.set(fuel, g);
    }
  }

  let calibrationLiters = 0;
  let calibrationRevenue = 0;
  if (stationId && from && to) {
    try {
      const fromDate = String(from).slice(0, 10);
      const toDate   = String(to).slice(0, 10);
      const { data: calRows } = await supabase
        .from('calibrations')
        .select('fuel, volume')
        .eq('station_id', stationId)
        .gte('date', fromDate)
        .lte('date', toDate);
      for (const c of calRows ?? []) {
        const fuel = c.fuel ?? '';
        const v    = Number(c.volume ?? 0);
        if (!fuel || !(v > 0)) continue;
        const g = perFuel.get(fuel);
        if (!g || !(g.liters > 0)) continue;
        const deduct = Math.min(g.liters, v);
        const price  = g.revenue / g.liters;
        calibrationLiters  += deduct;
        calibrationRevenue += deduct * price;
        // Уменьшаем «оставшийся» бюджет в perFuel чтобы повторные строки
        // не списывали один и тот же объём дважды.
        g.liters  -= deduct;
        g.revenue -= deduct * price;
      }
    } catch (e) {
      console.warn('[salesService] aggregateForShift calibration deduction failed:', e?.message ?? e);
    }
  }

  return {
    revenue: revenue - calibrationRevenue,
    liters:  liters  - calibrationLiters,
    count:   rows.length,
    rows,
    calibrationLiters,
    calibrationRevenue,
    grossRevenue: revenue,
    grossLiters:  liters,
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

  const [suppliesQ, salesR] = await Promise.all([supplyQ, salesQ]);
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

    const fuel = (sale.FuelName ?? '').trim();
    let need = Number(sale.Volume ?? 0);
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
      result.byFuel[fuel].sold_liters += Number(sale.Volume ?? 0);
      result.byFuel[fuel].cost += cost;
    }
  }
  return result;
}

export async function aggregateByFuel({ stationId, from, to } = {}) {
  const rows = await listSales({
    stationId, from, to, limit: 50000,
    columns: 'FuelName, ShopCost, Volume',
  });
  const map = new Map();
  for (const r of rows) {
    const fuel = r.FuelName ?? r.fuel_name ?? '—';
    if (!map.has(fuel)) map.set(fuel, { fuel, revenue: 0, liters: 0, count: 0 });
    const g = map.get(fuel);
    g.revenue += Number(r.ShopCost ?? 0);
    g.liters += Number(r.Volume ?? 0);
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
    columns: 'BasePaymentTypeKey, ShopCost',
  });
  const map = new Map();
  for (const r of rows) {
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
  const map = new Map();
  for (const r of rows) {
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
// UTC+6) попадают в предыдущий день.
function localYMD(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localYM(value) {
  const ymd = localYMD(value);
  return ymd ? ymd.slice(0, 7) : null;
}

export async function aggregateByDay({ stationId, from, to } = {}) {
  const rows = await listSales({
    stationId, from, to, limit: 50000,
    columns: 'TransactionDatetime, ShopCost, Volume',
  });
  const map = new Map();
  for (const r of rows) {
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
    columns: 'TransactionDatetime, ShopCost, Volume',
  });
  const map = new Map();
  for (const r of rows) {
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
  const rows = await listSales({ stationId, from, to, limit: 20000 });
  // matrix[dow][hour] = revenue
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const r of rows) {
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
    columns: 'OperatorName, ShopCost, Volume, ShiftKey',
  });
  const map = new Map();
  for (const r of rows) {
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
    columns: 'TransactionDatetime, ShopCost',
  });
  const bins = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${h}:00`, revenue: 0, count: 0 }));
  for (const r of rows) {
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
