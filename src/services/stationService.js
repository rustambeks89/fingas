// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Organizations + stations registry. CRUD for settings screen.

import { supabase } from '@/lib/supabaseClient';

export async function listOrganizations() {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function listRegistrationOrganizations() {
  const { data, error } = await supabase.rpc('fingas_public_organizations');
  if (error) throw error;
  return data ?? [];
}

export async function createOrganization(row) {
  const { data, error } = await supabase
    .from('organizations')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOrganization(id, patch) {
  const { data, error } = await supabase
    .from('organizations')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteOrganization(id) {
  const { error } = await supabase.from('organizations').delete().eq('id', id);
  if (error) throw error;
}

export async function listStations(organizationId) {
  let q = supabase.from('stations').select('*').order('name');
  if (organizationId) q = q.eq('organization_id', organizationId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listRegistrationStations(organizationId) {
  const { data, error } = await supabase.rpc('fingas_public_stations', {
    p_organization_id: organizationId || null,
  });
  if (error) throw error;
  return data ?? [];
}

export async function createStation(payload) {
  const { data, error } = await supabase
    .from('stations')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStation(id, patch) {
  const { data, error } = await supabase
    .from('stations')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft-delete by default — keep referential integrity with shifts / fuel_supply /
// cashflow that point at this station. Hard delete is available as deleteStationHard.
export async function deleteStation(id) {
  return updateStation(id, { active: false });
}

export async function deleteStationHard(id) {
  const { error } = await supabase.from('stations').delete().eq('id', id);
  if (error) throw error;
}
