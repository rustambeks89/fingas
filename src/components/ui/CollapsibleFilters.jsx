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
            'flex items-center gap-1.5 h-9 px-3 rounded-2xl border text-xs font-semibold transition-colors ' +
            (open || activeCount > 0
              ? 'border-brand-500/40 bg-brand-500/10 text-ink'
              : 'border-line bg-bg-card text-ink-muted hover:text-ink hover:border-brand-500/30')
          }
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{label}</span>
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-brand-500 text-white">
              {activeCount}
            </span>
          )}
          <ChevronDown className={'w-3.5 h-3.5 transition-transform ' + (open ? 'rotate-180' : '')} />
        </button>
        {activeCount > 0 && onReset && (
          <Button size="sm" variant="ghost" className="h-9 px-2.5 text-[11px]" onClick={onReset}>
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
