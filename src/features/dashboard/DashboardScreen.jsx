import { lazy, Suspense, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ROLES } from '@/lib/constants';
import { LoadingScreen } from '@/components/status/LoadingScreen';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

const OwnerDashboard = lazy(() => import('./OwnerDashboard'));
const OperatorDashboard = lazy(() => import('./OperatorDashboard'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AccountantDashboard = lazy(() => import('./AccountantDashboard'));

export default function DashboardScreen() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

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
    <PullToRefresh onRefresh={async () => {
      setRefreshKey((k) => k + 1);
      window.dispatchEvent(new Event('fingas-data-changed'));
      await new Promise((resolve) => setTimeout(resolve, 850));
    }}>
      <Suspense fallback={<LoadingScreen />}>
        <Screen key={refreshKey} />
      </Suspense>
    </PullToRefresh>
  );
}
