// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Empty list placeholder.

import { cn } from '@/lib/cn';

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('text-center py-12 px-6', className)}>
      {Icon && (
        <div className="w-14 h-14 mx-auto rounded-2xl bg-bg-elevated border border-line flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-ink-muted" />
        </div>
      )}
      {title && <div className="text-base font-semibold text-ink">{title}</div>}
      {description && (
        <p className="text-sm text-ink-muted mt-1 max-w-xs mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
