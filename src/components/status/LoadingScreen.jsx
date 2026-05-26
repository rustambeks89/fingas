// [UPDATED BY CLAUDE CLI - 2026-05-26]
// Project: Fingas
// Purpose: Полноэкранный лоадер — лаконичный wordmark fingas (Trebuchet)
// + три пульсирующие точки.

import { Wordmark } from '@/components/ui/Logo';

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg gap-5">
      <Wordmark size="xl" />
      <Dots />
    </div>
  );
}

export function Dots({ className }) {
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <Dot delay="0ms" />
      <Dot delay="160ms" />
      <Dot delay="320ms" />
    </div>
  );
}

function Dot({ delay }) {
  return (
    <span
      className="w-2 h-2 rounded-full bg-brand-500 inline-block animate-bounce"
      style={{ animationDelay: delay, animationDuration: '1s' }}
    />
  );
}
