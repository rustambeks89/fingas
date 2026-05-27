// [CREATED BY CLAUDE CLI - 2026-05-27]
// Project: Fingas
// Purpose: Универсальный сворачиваемый блок фильтров. По умолчанию —
// одна кнопка-чип «Фильтры». При тапе разворачивается панель с детьми
// (полями ввода). Кнопка показывает счётчик активных фильтров и сбрасывает
// их при наличии reset-колбэка.

import { useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

export function CollapsibleFilters({
  children,
  activeCount = 0,
  onReset,
  label = 'Фильтры',
  defaultOpen = false,
  className = '',
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={
            'relative flex items-center justify-center w-9 h-9 rounded-xl border transition-colors ' +
            (open || activeCount > 0
              ? 'border-brand-500/45 bg-brand-500/10 text-brand-400'
              : 'border-line/45 bg-bg-card text-ink-muted hover:text-ink hover:border-brand-500/30')
          }
          title="Фильтры"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-black bg-brand-500 text-white shadow-sm">
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && onReset && (
          <Button size="sm" variant="ghost" className="h-9 px-2 text-[11px]" onClick={onReset}>
            <X className="w-3.5 h-3.5" />
            Сбросить
          </Button>
        )}
      </div>
      {open && (
        <Card className="!p-3 mt-2 space-y-2.5">
          {children}
        </Card>
      )}
    </div>
  );
}
