// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Frontend permission gate. Hides UI when the user lacks rights.
// IMPORTANT: this is UI-only. The authoritative checks live in Supabase RLS.

import { ROLES, PROFILE_STATUS } from './constants';

const ALL_TRUE = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
  can_approve: true,
  can_export: true,
  can_upload: true,
};

export function isLoggedIn(user) {
  return Boolean(user && user.profile && user.profile.id);
}

export function isActive(user) {
  return (
    isLoggedIn(user) &&
    user.profile.status === PROFILE_STATUS.ACTIVE &&
    user.profile.can_login === true
  );
}

export function isOwner(user) {
  return isActive(user) && user.profile.role === ROLES.OWNER;
}

// Returns the merged permission row for a (user, module). Owners always get all.
// `user.permissions` is expected as a map: { module: { can_view, ... } }.
export function permissionsFor(user, module) {
  if (!isActive(user)) return {};
  if (user.profile.role === ROLES.OWNER) return ALL_TRUE;
  const map = user.permissions || {};
  return map[module] || {};
}

export function hasPermission(user, module, action) {
  const perms = permissionsFor(user, module);
  return perms[action] === true;
}

export const canView = (user, m) => hasPermission(user, m, 'can_view');
export const canCreate = (user, m) => hasPermission(user, m, 'can_create');
export const canEdit = (user, m) => hasPermission(user, m, 'can_edit');
export const canDelete = (user, m) => hasPermission(user, m, 'can_delete');
export const canApprove = (user, m) => hasPermission(user, m, 'can_approve');
export const canExport = (user, m) => hasPermission(user, m, 'can_export');
export const canUpload = (user, m) => hasPermission(user, m, 'can_upload');

// Returns true if the user is allowed to see data from other stations within
// the same organization. Owners always can.
export function canViewAllStations(user) {
  if (!isActive(user)) return false;
  if (user.profile.role === ROLES.OWNER) return true;
  return Boolean(user.profile.can_view_all_stations);
}
