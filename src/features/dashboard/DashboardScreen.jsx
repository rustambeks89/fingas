// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Role-aware dashboard. Picks Owner/Admin/Operator/Accountant view
// based on profile.role. Owners + accountants see KPI grid; operators see a
// shift-centric view.

import { lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ROLES } from '@/lib/constants';
import { LoadingScreen } from '@/components/status/LoadingScreen';

const OwnerDashboard = lazy(() => import('./OwnerDashboard'));
const OperatorDashboard = lazy(() => import('./OperatorDashboard'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AccountantDashboard = lazy(() => import('./AccountantDashboard'));

export default function DashboardScreen() {
  const { user } = useAuth();
  if (!user?.profile) return <LoadingScreen />;

  let Screen;
  switch (user.profile.role) {
    case ROLES.OWNER:
      Screen = OwnerDashboard;
      break;
    case ROLES.OPERATOR:
      Screen = OperatorDashboard;
      break;
    case ROLES.ADMIN:
      Screen = AdminDashboard;
      break;
    case ROLES.ACCOUNTANT:
      Screen = AccountantDashboard;
      break;
    default:
      Screen = OperatorDashboard;
      break;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Screen />
    </Suspense>
  );
}
