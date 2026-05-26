// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Convenience hook around lib/permissions for the current user.

import { useAuth } from './useAuth';
import {
  canApprove,
  canCreate,
  canDelete,
  canEdit,
  canExport,
  canUpload,
  canView,
  hasPermission,
  isOwner,
} from '@/lib/permissions';

export function usePermissions() {
  const { user } = useAuth();
  return {
    user,
    isOwner: isOwner(user),
    canView: (m) => canView(user, m),
    canCreate: (m) => canCreate(user, m),
    canEdit: (m) => canEdit(user, m),
    canDelete: (m) => canDelete(user, m),
    canApprove: (m) => canApprove(user, m),
    canExport: (m) => canExport(user, m),
    canUpload: (m) => canUpload(user, m),
    has: (m, a) => hasPermission(user, m, a),
  };
}
