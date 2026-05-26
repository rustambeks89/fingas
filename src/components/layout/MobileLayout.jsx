// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Authenticated mobile shell — header + scroll area + bottom nav.

import { Outlet } from 'react-router-dom';
import { BottomNav } from '@/components/navigation/BottomNav';
import { TopBar } from './TopBar';

export function MobileLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <TopBar />
      <main className="flex-1 pb-24 pt-1 px-3.5 max-w-screen-sm w-full mx-auto">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
