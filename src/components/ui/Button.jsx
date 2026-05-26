// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Primary mobile button — large tap area, compressed luxury styling, modern variants.

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

const VARIANTS = {
  primary:
    'bg-gradient-to-tr from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-[0_4px_24px_rgba(239,68,68,0.45)] border border-brand-400/30 active:brightness-95 backdrop-blur-md relative overflow-hidden before:absolute before:inset-0 before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.15),transparent_60%)]',
  secondary:
    'bg-bg-card text-ink border border-line/45 hover:border-brand-500/60 active:bg-bg-elevated/50 backdrop-blur-md',
  ghost: 'bg-transparent text-ink hover:bg-bg-elevated/30 active:bg-bg-elevated/50',
  success:
    'bg-gradient-to-tr from-emerald-800 to-emerald-700 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-[0_4px_20px_rgba(4,120,87,0.35)] border border-emerald-600/20 active:brightness-95 relative overflow-hidden before:absolute before:inset-0 before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.12),transparent_60%)]',
  danger:
    'bg-gradient-to-tr from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-[0_4px_24px_rgba(239,68,68,0.45)] border border-brand-400/30 active:brightness-95 backdrop-blur-md relative overflow-hidden before:absolute before:inset-0 before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.15),transparent_60%)]',
};

const SIZES = {
  sm: 'h-10 px-4 text-xs rounded-xl tracking-wide',
  md: 'h-12 px-6 text-[13px] rounded-2xl tracking-wide',
  lg: 'h-14 px-8 text-[14px] rounded-2xl tracking-wide',
  block: 'h-13 w-full px-6 py-3.5 text-[14px] rounded-2xl tracking-wide flex items-center justify-center',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  ...rest
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-bold uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        children
      )}
    </motion.button>
  );
}
