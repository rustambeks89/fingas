// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Read/write user_permissions toggles. Owner edits these from the
// Employees → Permissions screen.

import { supabase } from '@/lib/supabaseClient';

// Returns: { [module]: { can_view, can_create, ... } }
export async function fetchPermissionsMap(userId) {
  const { data, error } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  const map = {};
  for (const row of data ?? []) {
    map[row.module] = {
      can_view: !!row.can_view,
      can_create: !!row.can_create,
      can_edit: !!row.can_edit,
      can_delete: !!row.can_delete,
      can_approve: !!row.can_approve,
      can_export: !!row.can_export,
      can_upload: !!row.can_upload,
    };
  }
  return map;
}

export async function listPermissions(userId) {
  const { data, error } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

export async function upsertPermission({
  userId,
  organizationId,
  stationId = null,
  module,
  actions, // { can_view, can_create, ... }
}) {
  const { data, error } = await supabase
    .from('user_permissions')
    .upsert(
      {
        user_id: userId,
        organization_id: organizationId,
        station_id: stationId,
        module,
        ...actions,
      },
      { onConflict: 'user_id,module' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkSetPermissions({ userId, organizationId, rows }) {
  // rows: [{ module, actions }]
  const payload = rows.map((r) => ({
    user_id: userId,
    organization_id: organizationId,
    module: r.module,
    ...r.actions,
  }));
  const { data, error } = await supabase
    .from('user_permissions')
    .upsert(payload, { onConflict: 'user_id,module' })
    .select();
  if (error) throw error;
  return data;
}
