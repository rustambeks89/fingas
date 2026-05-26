// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Avatar with image fallback to initials.

import { cn } from '@/lib/cn';
import { initials } from '@/lib/formatters';

export function Avatar({ src, name = '', size = 'md', className }) {
  const sizeCls =
    size === 'sm' ? 'w-9 h-9 text-xs' :
    size === 'lg' ? 'w-16 h-16 text-2xl' : 'w-12 h-12 text-base';
  return (
    <div
      className={cn(
        'rounded-2xl bg-bg-elevated border border-line flex items-center justify-center overflow-hidden font-semibold text-ink',
        sizeCls,
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
