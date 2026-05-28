// PullToRefresh — ультра-премиальное, высокопроизводительное обновление при свайпе вниз.
// Предотвращает стандартный оверскролл браузера и реализует плавное физическое скольжение.
// Использование: <PullToRefresh onRefresh={reload}>...</PullToRefresh>

import { useRef, useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 60;
const MAX_PULL  = 80;

export function PullToRefresh({ onRefresh, children }) {
  const [pullY, setPullY]           = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [triggered, setTriggered]   = useState(false);

  const startY    = useRef(null);
  const isPulling = useRef(false);
  const scrollEl  = useRef(null);

  // Рефы для touch-событий (предотвращают замыкания без лишних перепривязок)
  const pullYRef = useRef(0);
  pullYRef.current = pullY;

  const triggeredRef = useRef(false);
  triggeredRef.current = triggered;

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollEl.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      // Запускаем только если мы находимся на самом верху страницы
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop > 2) return;

      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    };

    const handleTouchMove = (e) => {
      if (!isPulling.current || startY.current === null) return;

      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPullY(0);
        return;
      }

      // Предотвращаем нативный скролл / bounce-эффект браузера
      if (e.cancelable) {
        e.preventDefault();
      }

      // Формула плавного сопротивления (натяжения)
      const clamped = Math.min(MAX_PULL, delta * 0.52);
      setPullY(clamped);

      const isOver = clamped >= THRESHOLD;
      if (isOver !== triggeredRef.current) {
        setTriggered(isOver);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      startY.current = null;

      const currentPullY = pullYRef.current;
      if (currentPullY >= THRESHOLD) {
        setRefreshing(true);
        setPullY(0);
        setTriggered(false);
        try {
          await onRefreshRef.current?.();
        } finally {
          setRefreshing(false);
        }
      } else {
        setPullY(0);
        setTriggered(false);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const visible = pullY > 0 || refreshing;
  const spin    = refreshing || triggered;

  // Рассчитываем координаты индикатора и контента для мягкого параллакс-эффекта
  const indicatorY = refreshing ? 12 : pullY - 38;
  const contentY   = refreshing ? 52 : pullY;
  const opacity    = refreshing ? 1 : Math.min(1, pullY / 32);

  return (
    <div ref={scrollEl} className="relative">
      {/* Мягкий плавающий индикатор загрузки */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          justifyContent: 'center',
          transform: `translateY(${indicatorY}px)`,
          opacity: visible ? opacity : 0,
          transition: pullY > 0 ? 'none' : 'transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease',
          pointerEvents: 'none',
        }}
      >
        <div style={{
          width: 32, height: 32,
          borderRadius: '50%',
          background: 'rgba(18, 24, 37, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <RefreshCw
            style={{
              width: 14, height: 14,
              color: spin ? '#f43f5e' : 'rgba(255, 255, 255, 0.4)',
              animation: spin ? 'spin 0.8s linear infinite' : 'none',
              transition: 'color 0.2s',
            }}
          />
        </div>
      </div>

      {/* Контент опускается с анимацией сжатия/натяжения */}
      <div style={{
        transform: `translateY(${contentY}px)`,
        transition: pullY > 0 ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        willChange: 'transform',
      }}>
        {children}
      </div>
    </div>
  );
}
