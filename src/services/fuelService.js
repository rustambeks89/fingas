// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: fuel_supply + tank_measurements + calibrations CRUD.

import { supabase } from '@/lib/supabaseClient';

// ---- fuel supply ----
export async function listFuelSupply({ stationId, limit = 100 } = {}) {
  let q = supabase
    .from('fuel_supply')
    .select(`*, supplier:counterparties ( id, name )`)
    .order('date', { ascending: false })
    .limit(limit);
  if (stationId) q = q.eq('station_id', stationId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createFuelSupply(row) {
  const { data, error } = await supabase
    .from('fuel_supply')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFuelSupply(id, patch) {
  const { data, error } = await supabase
    .from('fuel_supply')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFuelSupply(id) {
  const { error } = await supabase.from('fuel_supply').delete().eq('id', id);
  if (error) throw error;
}

// ---- tank measurements ----
export async function listTankMeasurements({ stationId, limit = 100 } = {}) {
  let q = supabase
    .from('tank_measurements')
    .select('*')
    .order('date', { ascending: false })
    .order('time', { ascending: false })
    .limit(limit);
  if (stationId) q = q.eq('station_id', stationId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createTankMeasurement(row) {
  const { data, error } = await supabase
    .from('tank_measurements')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- calibrations ----
export async function listCalibrations({ stationId, limit = 100 } = {}) {
  let q = supabase
    .from('calibrations')
    .select('*')
    .order('date', { ascending: false })
    .order('time', { ascending: false })
    .limit(limit);
  if (stationId) q = q.eq('station_id', stationId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createCalibration(row) {
  const { data, error } = await supabase
    .from('calibrations')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCalibration(id, patch) {
  const { data, error } = await supabase
    .from('calibrations')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCalibration(id) {
  const { error } = await supabase.from('calibrations').delete().eq('id', id);
  if (error) throw error;
}
