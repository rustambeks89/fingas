import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 64;
const MAX_PULL = 92;
const MIN_REFRESH_MS = 420;

let activePullOwnerId = null;
let nextOwnerId = 1;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PullToRefresh({ onRefresh, children }) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [ownerId] = useState(() => `ptr-${nextOwnerId++}`);

  const startY = useRef(null);
  const isPulling = useRef(false);
  const pullYRef = useRef(0);
  const refreshingRef = useRef(false);
  const triggeredRef = useRef(false);
  const scrollEl = useRef(null);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    pullYRef.current = pullY;
  }, [pullY]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    triggeredRef.current = triggered;
  }, [triggered]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const el = scrollEl.current;
    if (!el) return;

    function isAtTop() {
      const pageTop = Math.max(
        Number(window.scrollY ?? 0),
        Number(document.documentElement?.scrollTop ?? 0),
        Number(document.body?.scrollTop ?? 0),
      );
      const localTop = Number(el.scrollTop ?? 0);
      return pageTop <= 2 && localTop <= 2;
    }

    const handleTouchStart = (event) => {
      if (refreshingRef.current) return;
      if (activePullOwnerId && activePullOwnerId !== ownerId) return;
      if (!isAtTop()) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      activePullOwnerId = ownerId;
      startY.current = touch.clientY;
      isPulling.current = true;
    };

    const handleTouchMove = (event) => {
      if (!isPulling.current || startY.current == null) return;
      if (activePullOwnerId !== ownerId) return;
      const touch = event.touches?.[0];
      if (!touch) return;

      const delta = touch.clientY - startY.current;
      if (delta <= 0) {
        if (pullYRef.current !== 0) setPullY(0);
        if (triggeredRef.current) setTriggered(false);
        return;
      }

      if (event.cancelable) event.preventDefault();
      event.stopPropagation();

      const resisted = Math.min(MAX_PULL, delta * 0.5);
      setPullY(resisted);
      setTriggered(resisted >= THRESHOLD);
    };

    const finishGesture = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      startY.current = null;
      activePullOwnerId = null;

      const currentPull = pullYRef.current;
      if (currentPull < THRESHOLD) {
        setTriggered(false);
        setPullY(0);
        return;
      }

      setTriggered(false);
      setPullY(0);
      setRefreshing(true);
      const startedAt = Date.now();
      try {
        await onRefreshRef.current?.();
      } finally {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_REFRESH_MS) {
          await wait(MIN_REFRESH_MS - elapsed);
        }
        setRefreshing(false);
      }
    };

    const handleTouchEnd = () => {
      finishGesture();
    };

    const handleTouchCancel = () => {
      finishGesture();
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
      if (activePullOwnerId === ownerId) {
        activePullOwnerId = null;
      }
    };
  }, [ownerId]);

  const visible = refreshing || pullY > 0;
  const spin = refreshing || triggered;
  const indicatorY = refreshing ? 10 : pullY - 36;
  const contentY = refreshing ? 44 : pullY;
  const opacity = refreshing ? 1 : Math.min(1, pullY / 30);

  return (
    <div ref={scrollEl} className="relative">
      <div
        style={{
          transform: `translate3d(0, ${indicatorY}px, 0)`,
          opacity: visible ? opacity : 0,
          transition: pullY > 0
            ? 'none'
            : 'transform 180ms ease-out, opacity 150ms ease-out',
        }}
        className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-line/60 bg-bg-card shadow-sm">
          <RefreshCw className={`h-4 w-4 ${spin ? 'animate-spin text-brand-500' : 'text-ink-soft'}`} />
        </div>
      </div>

      <div
        style={{
          transform: `translate3d(0, ${contentY}px, 0)`,
          transition: pullY > 0 ? 'none' : 'transform 220ms ease-out',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}
