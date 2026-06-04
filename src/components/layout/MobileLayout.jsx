import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { BottomNav } from '@/components/navigation/BottomNav';
import { TopBar } from './TopBar';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

const DashboardChatCard = lazy(() => import('@/features/dashboard/DashboardChatCard'));
const GLOBAL_REFRESH_SETTLE_MS = 320;

// Если пользователь явно включил «облегчённый режим» через .perf-lite на <html>
// (низкое end-устройство, ручной toggle) — framer-motion ничего не анимирует.
function getReducedMotion() {
  if (typeof document === 'undefined') return 'user';
  return document.documentElement.classList.contains('perf-lite') ? 'always' : 'user';
}

export function MobileLayout() {
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshTimeoutsRef = useRef(new Set());

  useEffect(() => {
    const timeouts = refreshTimeoutsRef.current;
    return () => {
      // Чистим висящие setTimeout при unmount — иначе сборщик мусора держит
      // ссылку на обработчик и тот может разрешиться уже после unmount.
      for (const id of timeouts) clearTimeout(id);
      timeouts.clear();
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    window.dispatchEvent(new Event('fingas-data-changed'));
    setRefreshTick((value) => value + 1);
    await new Promise((resolve) => {
      const id = setTimeout(() => {
        refreshTimeoutsRef.current.delete(id);
        resolve();
      }, GLOBAL_REFRESH_SETTLE_MS);
      refreshTimeoutsRef.current.add(id);
    });
  }, []);

  return (
    <MotionConfig reducedMotion={getReducedMotion()}>
      <div className="min-h-screen flex flex-col bg-bg">
        <TopBar />
        <main className="flex-1 pb-24 pt-1 px-3.5 max-w-screen-sm w-full mx-auto">
          <PullToRefresh onRefresh={handleRefresh}>
            <Outlet key={refreshTick} />
          </PullToRefresh>
        </main>
        <Suspense fallback={null}>
          <DashboardChatCard />
        </Suspense>
        <BottomNav />
      </div>
    </MotionConfig>
  );
}
