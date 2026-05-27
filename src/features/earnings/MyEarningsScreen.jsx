// [UPDATED BY CLAUDE CLI - 2026-05-27]
// Project: Fingas
// Purpose: «Моя зарплата» — это та же детальная карточка сотрудника, но
// без необходимости иметь право на модуль EMPLOYEES. Рендерим
// EmployeeDetailScreen, принудительно подставляя текущего user.id.

import EmployeeDetailScreen from '@/features/employees/EmployeeDetailScreen';
import { useAuth } from '@/hooks/useAuth';

export default function MyEarningsScreen() {
  const { user } = useAuth();
  return <EmployeeDetailScreen forcedUserId={user?.id ?? null} />;
}
