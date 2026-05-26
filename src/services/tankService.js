// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Tank metadata CRUD + live tank status combining `tanks` (metadata)
// with `azs_balance` (latest reading). One row per physical tank with current
// fill, %, status (ok / low / critical) and last-measurement freshness.

import { supabase } from '@/lib/supabaseClient';

function isMissingRelationError(error, relation) {
  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '');
  return (
    code === '42P01' ||
    message.includes(`relation "public.${relation}" does not exist`) ||
    message.includes(`relation "${relation}" does not exist`) ||
    message.includes(`public.${relation}`) && message.includes('does not exist')
  );
}

export async function getTank(id) {
  const { data, error } = await supabase
    .from('tanks')
    .select('*, fuel_type:fuel_types ( id, code, name, color )')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listTanks({ organizationId, stationId, active = true } = {}) {
  let q = supabase
    .from('tanks')
    .select('*, fuel_type:fuel_types ( id, code, name, color )')
    .order('number', { ascending: true });
  if (organizationId) q = q.eq('organization_id', organizationId);
  if (stationId) q = q.eq('station_id', stationId);
  if (active !== undefined) q = q.eq('active', active);
  const { data, error } = await q;
  if (error && isMissingRelationError(error, 'tanks')) return [];
  if (error) throw error;
  return data ?? [];
}

export async function createTank(row) {
  const { data, error } = await supabase
    .from('tanks')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTank(id, patch) {
  const { data, error } = await supabase
    .from('tanks')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTank(id) {
  const { error } = await supabase.from('tanks').delete().eq('id', id);
  if (error) throw error;
}

// --- live status -----------------------------------------------------------

// Per-tank current fill + status. Combines tank metadata with the latest
// azs_balance reading for the matching fuel code + ShopKey.
export async function getTankStatuses({ organizationId, stationId } = {}) {
  const tanks = await listTanks({ organizationId, stationId, active: true });
  if (tanks.length === 0) return [];

  // Resolve station → ShopKey
  let shopKey = null;
  if (stationId) {
    const { data } = await supabase
      .from('stations')
      .select('external_station_id')
      .eq('id', stationId)
      .maybeSingle();
    shopKey = data?.external_station_id ?? null;
  }

  // Pull recent balance rows for the org's stations
  let q = supabase
    .from('azs_balance')
    .select('ShopKey, FuelName, EndBalance, synced_at')
    .gt('EndBalance', 1000000)
    .order('synced_at', { ascending: false })
    .limit(500);
  if (shopKey != null) q = q.eq('ShopKey', shopKey);
  const { data: balances } = await q;

  // Pick latest per (ShopKey, FuelName)
  const latestByKey = new Map(); // `${shop}:${fuel}` -> row
  for (const b of balances ?? []) {
    const k = `${b.ShopKey}:${(b.FuelName ?? '').trim()}`;
    if (!latestByKey.has(k)) latestByKey.set(k, b);
  }

  // Also need station ShopKey for each tank's station_id
  const stationMap = new Map();
  if (!stationId) {
    const stationIds = [...new Set(tanks.map((t) => t.station_id).filter(Boolean))];
    if (stationIds.length > 0) {
      const { data: sts } = await supabase
        .from('stations')
        .select('id, external_station_id')
        .in('id', stationIds);
      for (const s of sts ?? []) stationMap.set(s.id, s.external_station_id);
    }
  } else {
    stationMap.set(stationId, shopKey);
  }

  return tanks.map((t) => {
    const sKey = stationMap.get(t.station_id) ?? null;
    const fuelCode = (t.fuel_code ?? t.fuel_type?.code ?? '').trim();
    const lookup = sKey != null ? `${sKey}:${fuelCode}` : null;
    const last = lookup ? latestByKey.get(lookup) : null;

    return {
      ...t,
      fuelCode,
      currentLiters: 0,  // filled in below via computePhysicalBalance
      capacityLiters: Number(t.capacity_liters ?? 0),
      pct: 0,
      status: 'unknown',
      lastEndBalance: last ? Number(last.EndBalance) : null,
      lastSyncedAt: last?.synced_at ?? null,
    };
  });
}

// Same as getTankStatuses but additionally computes physical balance per tank.
// Использует один серверный RPC fingas_tank_balances (миграция 0027) вместо
// 5× supabase-запросов на каждый бак. Если RPC ещё не применён — падает в старую
// логику с computePhysicalBalance.
export async function getTankStatusesWithBalance({ organizationId, stationId } = {}) {
  const base = await getTankStatuses({ organizationId, stationId });
  if (base.length === 0) return [];

  // Один RPC на все баки.
  const balanceMap = new Map(); // tank_id -> {liters, breakdown}
  try {
    const { data, error } = await supabase.rpc('fingas_tank_balances', {
      p_organization_id: organizationId ?? null,
      p_station_id: stationId ?? null,
    });
    if (error) throw error;
    for (const row of data ?? []) {
      balanceMap.set(row.tank_id, {
        liters: Number(row.liters ?? 0),
        breakdown: {
          supplies:     Number(row.supplies ?? 0),
          sales:        Number(row.sales ?? 0),
          calibrations: Number(row.calibrations ?? 0),
          adjustments:  Number(row.adjustments ?? 0),
        },
      });
    }
  } catch {
    // Фолбэк на старую поштучную логику (когда миграция 0027 ещё не применена).
    const fallback = await Promise.all(
      base.map((t) => computePhysicalBalance(t).catch(
        () => ({ liters: 0, breakdown: { supplies: 0, sales: 0, calibrations: 0, adjustments: 0 } }),
      )),
    );
    base.forEach((t, i) => balanceMap.set(t.id, fallback[i]));
  }

  return base.map((t) => {
    const bal = balanceMap.get(t.id) ?? { liters: 0, breakdown: { supplies: 0, sales: 0, calibrations: 0, adjustments: 0 } };
    const liters = bal.liters;
    const cap = Number(t.capacity_liters ?? 0);
    const min = Number(t.min_liters ?? 0);
    const crit = Number(t.critical_liters ?? 0);
    const liveLiters = Math.max(0, liters);
    const status =
      liters > 0 && liters <= crit ? 'critical' :
      liters > 0 && liters <= min  ? 'low'      :
                                     'ok';
    return {
      ...t,
      currentLiters: liveLiters,
      pct: cap > 0 ? Math.min(100, (liveLiters / cap) * 100) : 0,
      status,
      breakdown: bal.breakdown,
    };
  });
}

// ---------------------------------------------------------------------------
// PHYSICAL BALANCE
// ---------------------------------------------------------------------------
// remaining_liters = Σ supplies − Σ sales + Σ calibrations + Σ adjustments
//
//   supplies     : public.fuel_supply.liters_actual  (tank_id == this OR
//                                                     station_id+fuel match)
//   sales        : public.azs_selling.Volume         (ShopKey + FuelName)
//   calibrations : public.calibrations.volume        (поверка — пролив
//                                                     вернётся в резервуар)
//   adjustments  : public.tank_adjustments.liters    (ручные ±)
//
// `tank` should be a row from listTanks. `shopKey` is optional — if absent
// we resolve it from the station record.
export async function computePhysicalBalance(tank) {
  if (!tank?.id) return { liters: 0, breakdown: { supplies: 0, sales: 0, calibrations: 0, adjustments: 0 } };

  // Быстрый путь — единственный серверный RPC. Если миграция 0027 не накатана —
  // падаем в старую поштучную логику ниже.
  try {
    const { data, error } = await supabase.rpc('fingas_tank_balances', {
      p_organization_id: tank.organization_id ?? null,
      p_station_id: tank.station_id ?? null,
    });
    if (!error && Array.isArray(data)) {
      const row = data.find((r) => r.tank_id === tank.id);
      if (row) {
        return {
          liters: Number(row.liters ?? 0),
          breakdown: {
            supplies:     Number(row.supplies ?? 0),
            sales:        Number(row.sales ?? 0),
            calibrations: Number(row.calibrations ?? 0),
            adjustments:  Number(row.adjustments ?? 0),
          },
        };
      }
    }
  } catch {/* fall through */}

  const stationId = tank.station_id;
  const fuelCode  = tank.fuel_code ?? tank.fuel_type?.code ?? null;

  // resolve ShopKey for the station
  let shopKey = null;
  if (stationId) {
    const { data } = await supabase
      .from('stations')
      .select('external_station_id')
      .eq('id', stationId)
      .maybeSingle();
    shopKey = data?.external_station_id ?? null;
  }

  // supplies
  let supplyQ = supabase
    .from('fuel_supply')
    .select('liters_actual, fuel_type, tank_id, station_id');
  // prefer tank_id match if our supplies are tagged with it; otherwise filter
  // by station + fuel_type
  supplyQ = supplyQ.or(`tank_id.eq.${tank.id},and(station_id.eq.${stationId},fuel_type.eq.${fuelCode})`);
  const { data: supplyRows } = await supplyQ;
  const supplies = (supplyRows ?? []).reduce((s, r) => s + Number(r.liters_actual ?? 0), 0);

  // sales
  let sales = 0;
  if (shopKey != null && fuelCode) {
    const { data: saleRows } = await supabase
      .from('azs_selling')
      .select('Volume')
      .eq('ShopKey', shopKey)
      .eq('FuelName', fuelCode)
      .limit(50000);
    sales = (saleRows ?? []).reduce((s, r) => s + Number(r.Volume ?? 0), 0);
  }

  // calibrations
  let calibrations = 0;
  if (stationId && fuelCode) {
    const { data: calRows } = await supabase
      .from('calibrations')
      .select('volume, fuel, station_id')
      .eq('station_id', stationId)
      .eq('fuel', fuelCode);
    calibrations = (calRows ?? []).reduce((s, r) => s + Number(r.volume ?? 0), 0);
  }

  // adjustments
  const { data: adjRows } = await supabase
    .from('tank_adjustments')
    .select('liters')
    .eq('tank_id', tank.id);
  const adjustments = (adjRows ?? []).reduce((s, r) => s + Number(r.liters ?? 0), 0);

  const liters = supplies - sales + calibrations + adjustments;

  return {
    liters,
    breakdown: { supplies, sales, calibrations, adjustments },
  };
}

// Adjustments CRUD
export async function listAdjustments({ tankId, organizationId, stationId, from, to } = {}) {
  // Раньше тут был embed profiles!tank_adjustments_created_by_fkey, но FK
  // created_by ссылается на auth.users, а не на public.profiles — PostgREST
  // выдавал ошибку и весь список молча превращался в []. Убираем join,
  // имя оператора (если оно реально нужно) добывается отдельным запросом.
  let q = supabase
    .from('tank_adjustments')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (tankId)         q = q.eq('tank_id', tankId);
  if (organizationId) q = q.eq('organization_id', organizationId);
  if (stationId)      q = q.eq('station_id', stationId);
  if (from)           q = q.gte('date', from);
  if (to)             q = q.lte('date', to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createAdjustment(row) {
  const { data, error } = await supabase
    .from('tank_adjustments')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAdjustment(id) {
  const { data, error } = await supabase
    .from('tank_adjustments')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Удаление заблокировано (нет прав fuel_balances.can_delete или строка уже отсутствует).');
  }
}

export async function updateAdjustment(id, patch) {
  const { data, error } = await supabase
    .from('tank_adjustments')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Tank calibration grid (Градуировочная таблица) ----

export async function listTankCalibrationGrid({ tankId }) {
  if (!tankId) return [];
  const { data, error } = await supabase
    .from('tank_calibration_grid')
    .select('*')
    .eq('tank_id', tankId)
    .order('height_cm', { ascending: true });
  if (error && isMissingRelationError(error, 'tank_calibration_grid')) return [];
  if (error) throw error;
  return data ?? [];
}

export async function upsertTankCalibrationPoint(row) {
  const { data, error } = await supabase
    .from('tank_calibration_grid')
    .upsert(row, { onConflict: 'tank_id,height_cm' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTankCalibrationPoint(id) {
  const { error } = await supabase.from('tank_calibration_grid').delete().eq('id', id);
  if (error) throw error;
}

// Bulk upsert (массовый импорт). rows = [{height_cm, liters}, ...]
export async function bulkUpsertTankCalibrationGrid({ organizationId, stationId, tankId, rows, replace = false }) {
  if (!tankId || !Array.isArray(rows) || rows.length === 0) return { inserted: 0 };
  if (replace) {
    const { error: delErr } = await supabase
      .from('tank_calibration_grid')
      .delete()
      .eq('tank_id', tankId);
    if (delErr) throw delErr;
  }
  const payload = rows.map((r) => ({
    organization_id: organizationId,
    station_id: stationId,
    tank_id: tankId,
    height_cm: Number(r.height_cm),
    liters: Number(r.liters),
  }));
  const { data, error } = await supabase
    .from('tank_calibration_grid')
    .upsert(payload, { onConflict: 'tank_id,height_cm' })
    .select('id');
  if (error) throw error;
  return { inserted: data?.length ?? 0 };
}

// Linear interpolation cm → liters via stored grid. Returns null if out of range.
export async function tankLitersAtCm({ tankId, heightCm }) {
  if (!tankId || heightCm == null) return null;
  const { data, error } = await supabase.rpc('fingas_tank_liters_at_cm', {
    p_tank_id: tankId,
    p_height_cm: heightCm,
  });
  if (error) throw error;
  return data == null ? null : Number(data);
}

// Seed defaults: insert standard fuel types for an org if empty.
export async function seedDefaultFuelTypes(organizationId) {
  const { data } = await supabase
    .from('fuel_types')
    .select('id')
    .eq('organization_id', organizationId)
    .limit(1);
  if (data && data.length > 0) return;
  const defaults = [
    { code: 'АИ-92', name: 'АИ-92', octane: 92, color: '#22C55E', sort_order: 1 },
    { code: 'АИ-95', name: 'АИ-95', octane: 95, color: '#FF4D3D', sort_order: 2 },
    { code: 'АИ-98', name: 'АИ-98', octane: 98, color: '#A855F7', sort_order: 3 },
    { code: 'ДТ',    name: 'Дизель',           color: '#3B82F6', sort_order: 4 },
    { code: 'Газ',   name: 'Газ',               color: '#F59E0B', sort_order: 5 },
  ].map((d) => ({ ...d, organization_id: organizationId }));
  await supabase.from('fuel_types').insert(defaults);
}
