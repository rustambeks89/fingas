// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Thin wrapper over supabase.auth — sign in / sign up / sign out and
// the post-signup registration form (creates a pending_approval profile).

import { supabase } from '@/lib/supabaseClient';
import { PROFILE_STATUS } from '@/lib/constants';

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Step 1: create auth user. Profile is created server-side by trigger as a
// minimal stub. Step 2: the registration form calls completeRegistration() to
// fill in role/org/station and set status = pending_approval.
export async function signUp({ email, password }) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function completeRegistration({
  userId,
  fullName,
  phone,
  email,
  organizationId,
  stationId,
  requestedRole,
}) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        full_name: fullName,
        phone,
        email,
        organization_id: organizationId,
        station_id: stationId,
        role: requestedRole,
        status: PROFILE_STATUS.PENDING,
        can_login: false,
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session));
}
