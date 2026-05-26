// [CREATED BY CLAUDE CLI - 2026-05-26]
// Project: Fingas
// Purpose: iOS-style wheel picker. Колонка значений с инерционным скроллом
// (нативный touch momentum через overflow-y) и snap-to-center через CSS
// Scroll Snap. Активное значение в центральном слоте определяется по
// scrollTop с debounce — никаких IntersectionObserver-ов, без перерисовок
// во время кручения.

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

const ITEM_HEIGHT = 36;
const VISIBLE = 5; // нечётное → есть «центр»

export function WheelPicker({
  items,
  value,
  onChange,
  format = (v) => String(v),
  className,
  label,
}) {
  const ref = useRef(null);
  const settleTimer = useRef(null);

  // позиционируем при первом рендере / при смене value снаружи
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = items.findIndex((v) => v === value);
    if (idx < 0) return;
    el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'auto' });
  }, [items, value]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // debounce — определяем что прокрутка остановилась
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      const next = items[clamped];
      if (next !== value) onChange?.(next);
    }, 80);
  }, [items, value, onChange]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const padding = ((VISIBLE - 1) / 2) * ITEM_HEIGHT;

  return (
    <div className={cn('relative select-none', className)}>
      {label && (
        <div className="text-[9px] uppercase tracking-[0.2em] text-ink-soft font-bold text-center mb-1">
          {label}
        </div>
      )}
      <div
        className="relative rounded-2xl border border-line/40 bg-bg-elevated/60 overflow-hidden"
        style={{ height: VISIBLE * ITEM_HEIGHT }}
      >
        {/* центральный слот — полоса */}
        <div
          className="pointer-events-none absolute left-2 right-2 z-10 rounded-xl bg-brand-500/12 border border-brand-500/30"
          style={{ top: padding, height: ITEM_HEIGHT }}
        />
        {/* fade сверху / снизу */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-9 bg-gradient-to-b from-bg-card/95 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-9 bg-gradient-to-t from-bg-card/95 to-transparent" />

        <div
          ref={ref}
          onScroll={handleScroll}
          className="h-full overflow-y-scroll no-scrollbar touch-pan-y"
          style={{
            scrollSnapType: 'y mandatory',
            // на iOS нужен для native momentum:
            WebkitOverflowScrolling: 'touch',
            paddingTop: padding,
            paddingBottom: padding,
          }}
        >
          {items.map((it, i) => (
            <div
              key={`${i}-${String(it)}`}
              style={{ height: ITEM_HEIGHT, scrollSnapAlign: 'center' }}
              className={cn(
                'flex items-center justify-center text-[15px] tabular-nums transition-colors',
                it === value
                  ? 'text-ink font-bold'
                  : 'text-ink-muted font-medium',
              )}
            >
              {format(it)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
