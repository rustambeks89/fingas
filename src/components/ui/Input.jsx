import { cn } from '@/lib/cn';

export function Input({
  label,
  hint,
  error,
  className,
  type = 'text',
  ...rest
}) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[13px] font-semibold text-ink mb-1.5">{label}</span>
      )}
      <input
        type={type}
        className={cn(
          'block w-full h-12 px-4 rounded-2xl bg-bg-elevated/70',
          'border border-line/50 text-[15px] text-ink placeholder:text-ink-soft',
          'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-all duration-200',
          error && 'border-danger focus:border-danger focus:ring-danger/15',
          className,
        )}
        {...rest}
      />
      {hint && !error && (
        <span className="block text-[11px] text-ink-soft mt-1.5">{hint}</span>
      )}
      {error && (
        <span className="block text-[11px] text-danger mt-1.5 font-medium">{error}</span>
      )}
    </label>
  );
}

export function Select({ label, hint, error, className, children, ...rest }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[13px] font-semibold text-ink mb-1.5">{label}</span>
      )}
      <select
        className={cn(
          'block w-full h-12 px-4 rounded-2xl bg-bg-elevated/70',
          'border border-line/50 text-[15px] text-ink transition-all duration-200',
          'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
          error && 'border-danger focus:border-danger focus:ring-danger/15',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {hint && !error && (
        <span className="block text-[11px] text-ink-soft mt-1.5">{hint}</span>
      )}
      {error && (
        <span className="block text-[11px] text-danger mt-1.5 font-medium">{error}</span>
      )}
    </label>
  );
}
