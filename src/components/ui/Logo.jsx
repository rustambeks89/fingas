// [UPDATED BY CLAUDE CLI - 2026-05-26]
// Project: Fingas
// Purpose: Чистый минималистичный лого + текстовый wordmark Trebuchet.

import { cn } from '@/lib/cn';

const TREBUCHET = '"Trebuchet MS", "Outfit", system-ui, sans-serif';

export function LogoMark({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={cn('w-9 h-9 flex-shrink-0', className)}
    >
      <defs>
        <linearGradient id="logoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#16181D" />
          <stop offset="100%" stopColor="#0A0C10" />
        </linearGradient>
        <linearGradient id="logoBrand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FB7185" />
          <stop offset="100%" stopColor="#E11D48" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" ry="14" fill="url(#logoBg)" />
      <path
        d="M20 14h24a3 3 0 0 1 0 6H26v10h15a3 3 0 0 1 0 6H26v14a3 3 0 0 1-6 0V17a3 3 0 0 1 0-3z"
        fill="url(#logoBrand)"
      />
    </svg>
  );
}

export function Wordmark({ className, size = 'md' }) {
  const sizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-3xl',
    xl: 'text-4xl',
  };
  return (
    <span
      className={cn(
        'inline-flex items-baseline select-none leading-none tracking-[-0.02em]',
        sizes[size] ?? sizes.md,
        className,
      )}
      style={{ fontFamily: TREBUCHET, fontWeight: 700 }}
    >
      <span className="text-ink">fin</span>
      <span className="text-brand-500">gas</span>
    </span>
  );
}
