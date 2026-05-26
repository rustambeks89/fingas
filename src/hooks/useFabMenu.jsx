// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Tiny context for the global "+" bottom sheet — BottomNav fires
// openFab(), MobileLayout renders <QuickAddSheet/>.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const FabCtx = createContext({ open: false, openFab: () => {}, closeFab: () => {} });

export function FabMenuProvider({ children }) {
  const [open, setOpen] = useState(false);
  const openFab = useCallback(() => setOpen(true), []);
  const closeFab = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openFab, closeFab }), [open, openFab, closeFab]);
  return <FabCtx.Provider value={value}>{children}</FabCtx.Provider>;
}

export function useFabMenu() {
  return useContext(FabCtx);
}
