// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Elegant screen header with luxury details and micro-elements.

export function ScreenHeader({ title, subtitle, right }) {
  return (
    <div className="border-b border-line/15 pb-2.5 mb-3.5 flex items-end justify-between gap-2">
      <div className="min-w-0">
        <h1 className="text-[17px] font-bold tracking-tight text-ink flex items-center font-display">
          {title}
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-500 ml-1.5 shadow-[0_0_8px_rgba(244,63,94,0.65)]" />
        </h1>
        {subtitle && (
          <p className="text-[10px] text-ink-muted mt-0.5 tracking-wide uppercase font-semibold">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}
