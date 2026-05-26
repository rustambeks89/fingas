// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: iOS-style toggle switch used everywhere in the permissions matrix.

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export function Toggle({ checked, onChange, disabled, label, hint, className }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      {(label || hint) && (
        <div className="min-w-0 flex-1">
          {label && (
            <div className="text-sm font-medium text-ink truncate">{label}</div>
          )}
          {hint && <div className="text-xs text-ink-soft mt-0.5">{hint}</div>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => !disabled && onChange?.(!checked)}
        className={cn(
          'relative w-12 h-7 rounded-full transition-colors flex-shrink-0',
          checked ? 'bg-brand-500' : 'bg-bg-elevated border border-line',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={cn(
            'absolute top-0.5 w-6 h-6 rounded-full bg-white shadow',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}
