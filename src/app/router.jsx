// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Route table. Gates by auth state, profile status (pending/blocked),
// and per-module toggle permissions. Feature screens are lazy-loaded so the
// initial bundle stays small.

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { isActive } from '@/lib/permissions';
import { PROFILE_STATUS } from '@/lib/constants';

import { MobileLayout } from '@/components/layout/MobileLayout';
import { LoadingScreen } from '@/components/status/LoadingScreen';
import { AccessDenied } from '@/components/status/AccessDenied';

// Auth screens are not lazy — they're the first thing user sees if not signed in.
import LoginScreen from '@/features/auth/LoginScreen';
import RegisterScreen from '@/features/auth/RegisterScreen';
import PendingApprovalScreen from '@/features/auth/PendingApprovalScreen';
import SetupScreen from '@/features/auth/SetupScreen';
import AccountSetupScreen from '@/features/auth/AccountSetupScreen';
const DashboardScreen = lazy(() => import('@/features/dashboard/DashboardScreen'));

// Everything else lazy.
const EmployeesScreen = lazy(() => import('@/features/employees/EmployeesScreen'));
const EmployeePermissionsScreen = lazy(() => import('@/features/permissions/EmployeePermissionsScreen'));
const ShiftsScreen = lazy(() => import('@/features/shifts/ShiftsScreen'));
const SalesScreen = lazy(() => import('@/features/sales/SalesScreen'));
const FuelSupplyScreen = lazy(() => import('@/features/fuel-supply/FuelSupplyScreen'));
const TankMeasurementsScreen = lazy(() => import('@/features/tank-measurements/TankMeasurementsScreen'));
const CalibrationsScreen = lazy(() => import('@/features/calibrations/CalibrationsScreen'));
const FuelBalancesScreen = lazy(() => import('@/features/fuel-balances/FuelBalancesScreen'));
const CashflowScreen = lazy(() => import('@/features/cashflow/CashflowScreen'));
const CollectionsScreen = lazy(() => import('@/features/collections/CollectionsScreen'));
const SuppliersScreen = lazy(() => import('@/features/suppliers/SuppliersScreen'));
const SupplierDetailScreen = lazy(() => import('@/features/suppliers/SupplierDetailScreen'));
const TaxesScreen = lazy(() => import('@/features/taxes/TaxesScreen'));
const PayrollScreen = lazy(() => import('@/features/payroll/PayrollScreen'));
const PLScreen = lazy(() => import('@/features/pl/PLScreen'));
const DocumentsScreen = lazy(() => import('@/features/documents/DocumentsScreen'));
const NotificationsScreen = lazy(() => import('@/features/notifications/NotificationsScreen'));
const SettingsScreen = lazy(() => import('@/features/settings/SettingsScreen'));
const ProfileScreen = lazy(() => import('@/features/profile/ProfileScreen'));
const MoreScreen = lazy(() => import('@/features/more/MoreScreen'));
const SystemScreen = lazy(() => import('@/features/system/SystemScreen'));
const TanksScreen = lazy(() => import('@/features/tanks/TanksScreen'));
const TankDetailScreen = lazy(() => import('@/features/tanks/TankDetailScreen'));
const CounterpartiesReportScreen = lazy(() => import('@/features/counterparties/CounterpartiesReportScreen'));
const FuelTypesScreen = lazy(() => import('@/features/directories/FuelTypesScreen'));
const CashflowCategoriesScreen = lazy(() => import('@/features/directories/CashflowCategoriesScreen'));
const WalletsScreen = lazy(() => import('@/features/directories/WalletsScreen'));
const TankCalibrationGridScreen = lazy(() => import('@/features/directories/TankCalibrationGridScreen'));
const ChatListScreen = lazy(() => import('@/features/chat/ChatListScreen'));
const ChatThreadScreen = lazy(() => import('@/features/chat/ChatThreadScreen'));
const NewChatScreen = lazy(() => import('@/features/chat/NewChatScreen'));
const ChatSettingsScreen = lazy(() => import('@/features/chat/ChatSettingsScreen'));

import { MODULES } from '@/lib/constants';
import { hasPermission } from '@/lib/permissions';

function PrivateRoute({ children }) {
  const { user, loading, session, profileChecked, configured } = useAuth();
  const location = useLocation();
  if (!configured) return <SetupScreen />;
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  // Session exists. Wait until we actually tried to load the profile.
  if (!profileChecked) return <LoadingScreen />;
  // Tried, but no profile row exists (or table is missing): show actionable screen.
  if (!user?.profile) return <AccountSetupScreen />;
  if (user.profile.status !== PROFILE_STATUS.ACTIVE) {
    return <Navigate to="/pending" replace />;
  }
  if (!user.profile.can_login) {
    return <AccessDenied reason="Доступ к приложению временно отключен владельцем." />;
  }
  return children;
}

function PendingRoute() {
  const { user, loading, session, profileChecked, configured } = useAuth();

  if (!configured) return <SetupScreen />;
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profileChecked) return <LoadingScreen />;
  if (!user?.profile) return <AccountSetupScreen />;
  if (user.profile.status === PROFILE_STATUS.ACTIVE && user.profile.can_login) {
    return <Navigate to="/" replace />;
  }
  return <PendingApprovalScreen />;
}

function ModuleRoute({ module, children }) {
  const { user } = useAuth();
  if (!isActive(user)) return <Navigate to="/login" replace />;
  if (!hasPermission(user, module, 'can_view')) {
    return <AccessDenied reason={`Нет доступа к модулю «${module}».`} />;
  }
  return children;
}

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/pending" element={<PendingRoute />} />

        <Route
          element={
            <PrivateRoute>
              <MobileLayout />
            </PrivateRoute>
          }
        >
        <Route index element={<DashboardScreen />} />
        <Route path="dashboard" element={<DashboardScreen />} />
        <Route path="shifts" element={<ModuleRoute module={MODULES.SHIFTS}><ShiftsScreen /></ModuleRoute>} />
        <Route path="sales" element={<ModuleRoute module={MODULES.SALES}><SalesScreen /></ModuleRoute>} />
        <Route path="fuel-supply" element={<ModuleRoute module={MODULES.FUEL_SUPPLY}><FuelSupplyScreen /></ModuleRoute>} />
        <Route path="tank-measurements" element={<ModuleRoute module={MODULES.TANK_MEASUREMENTS}><TankMeasurementsScreen /></ModuleRoute>} />
        <Route path="calibrations" element={<ModuleRoute module={MODULES.CALIBRATIONS}><CalibrationsScreen /></ModuleRoute>} />
        <Route path="fuel-balances" element={<ModuleRoute module={MODULES.FUEL_BALANCES}><FuelBalancesScreen /></ModuleRoute>} />
        <Route path="cashflow" element={<ModuleRoute module={MODULES.CASHFLOW}><CashflowScreen /></ModuleRoute>} />
        <Route path="collections" element={<ModuleRoute module={MODULES.COLLECTIONS}><CollectionsScreen /></ModuleRoute>} />
        <Route path="suppliers" element={<ModuleRoute module={MODULES.SUPPLIERS}><SuppliersScreen /></ModuleRoute>} />
        <Route path="suppliers/:id" element={<ModuleRoute module={MODULES.SUPPLIERS}><SupplierDetailScreen /></ModuleRoute>} />
        <Route path="taxes" element={<ModuleRoute module={MODULES.TAXES}><TaxesScreen /></ModuleRoute>} />
        <Route path="payroll" element={<ModuleRoute module={MODULES.PAYROLL}><PayrollScreen /></ModuleRoute>} />
        <Route path="pl" element={<ModuleRoute module={MODULES.PL}><PLScreen /></ModuleRoute>} />
        <Route path="documents" element={<ModuleRoute module={MODULES.DOCUMENTS}><DocumentsScreen /></ModuleRoute>} />
        <Route path="notifications" element={<ModuleRoute module={MODULES.NOTIFICATIONS}><NotificationsScreen /></ModuleRoute>} />
        <Route path="employees" element={<ModuleRoute module={MODULES.EMPLOYEES}><EmployeesScreen /></ModuleRoute>} />
        <Route path="employees/:userId/permissions" element={<ModuleRoute module={MODULES.EMPLOYEES}><EmployeePermissionsScreen /></ModuleRoute>} />
        <Route path="settings" element={<ModuleRoute module={MODULES.SETTINGS}><SettingsScreen /></ModuleRoute>} />
        <Route path="profile" element={<ProfileScreen />} />
        <Route path="more" element={<MoreScreen />} />
        <Route path="system" element={<SystemScreen />} />
        <Route path="tanks" element={<ModuleRoute module={MODULES.FUEL_BALANCES}><TanksScreen /></ModuleRoute>} />
        <Route path="tanks/:id" element={<ModuleRoute module={MODULES.FUEL_BALANCES}><TankDetailScreen /></ModuleRoute>} />
        <Route path="counterparties" element={<ModuleRoute module={MODULES.SUPPLIERS}><CounterpartiesReportScreen /></ModuleRoute>} />
        <Route path="directories/fuel-types" element={<ModuleRoute module={MODULES.SETTINGS}><FuelTypesScreen /></ModuleRoute>} />
        <Route path="directories/cashflow-categories" element={<ModuleRoute module={MODULES.SETTINGS}><CashflowCategoriesScreen /></ModuleRoute>} />
        <Route path="directories/wallets" element={<ModuleRoute module={MODULES.SETTINGS}><WalletsScreen /></ModuleRoute>} />
        <Route path="directories/tank-calibration-grid" element={<ModuleRoute module={MODULES.SETTINGS}><TankCalibrationGridScreen /></ModuleRoute>} />
        <Route path="more/chat" element={<ModuleRoute module={MODULES.CHAT}><ChatListScreen /></ModuleRoute>} />
        <Route path="more/chat/:threadId" element={<ModuleRoute module={MODULES.CHAT}><ChatThreadScreen /></ModuleRoute>} />
        <Route path="more/chat/:threadId/settings" element={<ModuleRoute module={MODULES.CHAT}><ChatSettingsScreen /></ModuleRoute>} />
        <Route path="more/new-chat" element={<ModuleRoute module={MODULES.CHAT}><NewChatScreen /></ModuleRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
