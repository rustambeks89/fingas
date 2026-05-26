// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Status pill used in lists.

import { cn } from '@/lib/cn';

const TONES = {
  default: 'bg-bg-elevated text-ink-muted border border-line',
  success: 'bg-success/15 text-success border border-success/30',
  warning: 'bg-warning/15 text-warning border border-warning/30',
  danger: 'bg-danger/15 text-danger border border-danger/30',
  info: 'bg-info/15 text-info border border-info/30',
  brand: 'bg-brand-500/15 text-brand-400 border border-brand-500/30',
};

export function Badge({ children, tone = 'default', className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
