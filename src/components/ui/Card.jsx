import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export function Card({ className, children, hoverable = false, ...rest }) {
  const baseClasses = cn(
    'rounded-2xl bg-bg-card border border-line/40 shadow-sm p-3.5 relative overflow-hidden backdrop-blur-xl transition-all duration-200',
    className
  );
  if (hoverable) {
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        className={cn(baseClasses, 'cursor-pointer active:bg-bg-elevated/50')}
        {...rest}
      >
        {children}
      </motion.div>
    );
  }
  return <div className={baseClasses} {...rest}>{children}</div>;
}

export function CardTitle({ children, className }) {
  return <h3 className={cn('text-sm font-bold text-ink', className)}>{children}</h3>;
}

export function CardSubtitle({ children, className }) {
  return <p className={cn('text-[11px] text-ink-muted mt-0.5', className)}>{children}</p>;
}
