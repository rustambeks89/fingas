// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Profile CRUD + employee admin ops. approveEmployee now also seeds
// permission toggles by role via the fingas_apply_role_template RPC, so the
// employee gets the right defaults immediately on approval.

import { supabase } from '@/lib/supabaseClient';
import { PROFILE_STATUS } from '@/lib/constants';

export async function fetchMyProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Same shape as fetchMyProfile but also pulls org/station names so screens
// don't have to do their own joins.
export async function fetchMyProfileExpanded(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      organization:organizations ( id, name ),
      station:stations ( id, name, city )
    `)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(userId, patch) {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listEmployees({ organizationId, status } = {}) {
  let q = supabase
    .from('profiles')
    .select(`
      *,
      station:stations ( id, name )
    `)
    .order('created_at', { ascending: false });
  if (organizationId) q = q.eq('organization_id', organizationId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Approve = set status=active + can_login=true + optionally update role &
// station. If role changed (or template requested), seed permissions via RPC.
export async function approveEmployee(profile, { role, stationId, applyTemplate = true } = {}) {
  const patch = {
    status: PROFILE_STATUS.ACTIVE,
    can_login: true,
  };
  if (role) patch.role = role;
  if (stationId !== undefined) patch.station_id = stationId;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', profile.id)
    .select()
    .single();
  if (error) throw error;

  if (applyTemplate) {
    const r = role ?? profile.role;
    if (r) {
      const { error: rpcErr } = await supabase.rpc('fingas_apply_role_template', {
        p_user: profile.user_id,
        p_role: r,
      });
      if (rpcErr) {
        // Non-fatal — owner can still toggle manually
        console.warn('[Fingas] apply_role_template failed:', rpcErr.message);
      }
    }
  }
  return data;
}

export async function rejectEmployee(profileId) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ status: PROFILE_STATUS.REJECTED, can_login: false })
    .eq('id', profileId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function blockEmployee(profileId) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ status: PROFILE_STATUS.BLOCKED, can_login: false })
    .eq('id', profileId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function unblockEmployee(profileId) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ status: PROFILE_STATUS.ACTIVE, can_login: true })
    .eq('id', profileId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setCanLogin(profileId, canLogin) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ can_login: canLogin })
    .eq('id', profileId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Upload an avatar image into the avatars bucket and update profile.avatar_url.
// Returns the public URL.
export async function uploadAvatar(userId, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = data.publicUrl;
  await updateMyProfile(userId, { avatar_url: publicUrl });
  return publicUrl;
}
