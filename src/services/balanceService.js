// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: READ-ONLY access to azs_balance (MySQL-synced fuel tank balances).
// Station identifier on this table is `ShopKey` (integer) → matches
// public.stations.external_station_id.

import { supabase } from '@/lib/supabaseClient';

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

export async function listLatestBalances({ stationId } = {}) {
  const shopKey = await resolveShopKey(stationId);
  let q = supabase
    .from('azs_balance')
    .select('id, ShiftKey, ShopKey, FuelName, fuel_name, liters, tank_id, measured_at, synced_at, level_cm')
    .order('synced_at', { ascending: false })
    .limit(200);
  if (shopKey != null) q = q.eq('ShopKey', shopKey);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
