// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Horizontal tank visualisation. Premium cylindrical tank with a
// horizontal fill, % readout, fuel chip, status badge, and live metadata.
//
// Use:
//   <TankCard
//     name="Резервуар №1"
//     fuel="АИ-95"
//     fuelColor="#FF4D3D"
//     current={3628}
//     capacity={10000}
//     min={1500}
//     critical={500}
//     status="ok|low|critical|unknown"
//     lastSyncedAt={ISO}
//   />

import { motion } from 'framer-motion';
import { Fuel } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatLiters, formatRelative } from '@/lib/formatters';

const STATUS_META = {
  ok: { label: 'нормально', tone: 'success', ring: 'border-success/40', glow: 'rgba(34,197,94,0.18)' },
  low: { label: 'низко', tone: 'warning', ring: 'border-warning/40', glow: 'rgba(245,158,11,0.20)' },
  critical: { label: 'критично', tone: 'danger', ring: 'border-danger/40', glow: 'rgba(239,68,68,0.25)' },
  unknown: { label: 'нет замера', tone: 'default', ring: 'border-line/60', glow: 'rgba(148,163,184,0.10)' },
};

export function TankCard({
  name,
  number,
  fuel,
  fuelColor = '#FF4D3D',
  current,
  capacity,
  status = 'unknown',
  lastSyncedAt,
  compact = false,
  layout = 'horizontal',
}) {
  const pct = capacity > 0 ? Math.min(100, Math.max(0, (current / capacity) * 100)) : 0;
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  const hasReading = Number(current) > 0;
  const isVertical = layout === 'vertical';
  const barHeight = compact ? 28 : 36;
  const verticalTankHeight = compact ? 88 : 108;
  const verticalTankWidth = compact ? 40 : 48;
  const endCapSize = compact ? 18 : 24;
  const chipText = hasReading ? `${Math.round(pct)}%` : '—';

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className={`rounded-2xl border bg-bg-card p-3 min-w-0 ${meta.ring} ${isVertical ? 'h-full' : ''}`}
      style={{ boxShadow: `0 8px 24px -16px ${meta.glow}` }}
    >
      {isVertical ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-w-0">
          <div className="min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Fuel className="w-3.5 h-3.5 flex-shrink-0" style={{ color: fuelColor }} />
                <div className="font-semibold text-ink truncate text-sm">
                  {fuel || '—'}
                </div>
              </div>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>

            <div className="text-[10px] text-ink-soft truncate">
              {number != null ? `№${number} · ` : ''}{name}
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="rounded-lg bg-bg-elevated/50 border border-line/30 px-2 py-1 min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-ink-soft">Остаток</div>
                <div className="text-sm font-bold text-ink tabular-nums truncate">
                  {hasReading ? formatLiters(current) : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-bg-elevated/50 border border-line/30 px-2 py-1 min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-ink-soft">Объём</div>
                <div className="text-sm font-bold text-ink tabular-nums truncate">
                  {capacity > 0 ? formatLiters(capacity) : '—'}
                </div>
              </div>
            </div>

            {lastSyncedAt && (
              <div className="text-[10px] text-ink-soft truncate">
                синхр: {formatRelative(lastSyncedAt)}
              </div>
            )}
          </div>

          <div
            className="relative overflow-hidden border border-white/10 bg-bg-elevated/75"
            style={{
              width: verticalTankWidth,
              height: verticalTankHeight,
              borderRadius: 9999,
              boxShadow: [
                'inset 0 1px 0 rgba(255,255,255,0.08)',
                'inset 0 -10px 20px rgba(0,0,0,0.30)',
                '0 10px 24px -18px rgba(0,0,0,0.65)',
              ].join(', '),
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.10) 100%)',
              }}
            />

            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${pct}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-0 bottom-0"
              style={{
                background: hasReading
                  ? `linear-gradient(180deg, ${fuelColor}ff 0%, ${fuelColor}cc 36%, ${fuelColor}99 100%)`
                  : 'linear-gradient(180deg, rgba(148,163,184,0.28) 0%, rgba(148,163,184,0.14) 100%)',
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                borderBottomLeftRadius: 9999,
                borderBottomRightRadius: 9999,
                boxShadow: hasReading ? `inset 0 0 0 1px ${fuelColor}55` : 'inset 0 0 0 1px rgba(148,163,184,0.18)',
              }}
            />

            <div
              className="absolute left-0 right-0"
              style={{
                bottom: `${Math.max(0, pct - 4)}%`,
                height: 10,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.00) 100%)',
                opacity: hasReading ? 0.75 : 0,
              }}
            />

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-6 items-center rounded-full border border-white/12 bg-black/20 px-2 text-[10px] font-semibold text-white/90 backdrop-blur-sm tabular-nums">
                {chipText}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2 min-w-0">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Fuel className="w-3.5 h-3.5 flex-shrink-0" style={{ color: fuelColor }} />
              <div className="font-semibold text-ink truncate text-sm">
                {fuel || '—'}
              </div>
            </div>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>

          <div
            className="relative overflow-hidden border border-white/10 bg-bg-elevated/75"
            style={{
              height: barHeight,
              borderRadius: 9999,
              boxShadow: [
                'inset 0 1px 0 rgba(255,255,255,0.08)',
                'inset 0 -10px 20px rgba(0,0,0,0.30)',
                '0 10px 24px -18px rgba(0,0,0,0.65)',
              ].join(', '),
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.10) 100%)',
              }}
            />

            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 left-0"
              style={{
                background: hasReading
                  ? `linear-gradient(180deg, ${fuelColor}ff 0%, ${fuelColor}cc 36%, ${fuelColor}99 100%)`
                  : 'linear-gradient(180deg, rgba(148,163,184,0.28) 0%, rgba(148,163,184,0.14) 100%)',
                borderTopLeftRadius: 9999,
                borderBottomLeftRadius: 9999,
                borderTopRightRadius: pct >= 100 ? 9999 : 22,
                borderBottomRightRadius: pct >= 100 ? 9999 : 22,
                boxShadow: hasReading ? `inset 0 0 0 1px ${fuelColor}55` : 'inset 0 0 0 1px rgba(148,163,184,0.18)',
              }}
            />

            {hasReading && pct > 6 && (
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: `${Math.max(2, pct - 6)}%`,
                  width: 10,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.00) 0%, rgba(255,255,255,0.24) 50%, rgba(255,255,255,0.00) 100%)',
                  filter: 'blur(1px)',
                  opacity: 0.7,
                }}
              />
            )}

            {[18, 50, 82].map((p) => (
              <div
                key={p}
                className="absolute top-0 bottom-0 w-px bg-white/8"
                style={{ left: `${p}%`, opacity: 0.45 }}
              />
            ))}

            <div className="absolute top-1 left-0 right-0 h-px bg-white/14" style={{ opacity: 0.7 }} />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-black/20" style={{ opacity: 0.75 }} />

            <div className="absolute inset-0 flex items-center justify-between px-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="flex h-6 items-center rounded-full border border-white/12 bg-black/20 px-2 text-[10px] font-semibold text-white/90 backdrop-blur-sm tabular-nums"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
                >
                  {chipText}
                </div>
                {!compact && lastSyncedAt && (
                  <div className="hidden sm:block text-[10px] text-white/70 truncate">
                    {formatRelative(lastSyncedAt)}
                  </div>
                )}
              </div>
              <div className="text-[10px] font-semibold text-white/82 tabular-nums">
                {hasReading ? formatLiters(current) : '—'} / {capacity > 0 ? formatLiters(capacity) : '—'}
              </div>
            </div>

            <div
              className="absolute top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/6"
              style={{
                width: endCapSize,
                height: endCapSize,
                left: 3,
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.15), 0 0 0 1px rgba(0,0,0,0.25)',
              }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/6"
              style={{
                width: endCapSize,
                height: endCapSize,
                right: 3,
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.15), 0 0 0 1px rgba(0,0,0,0.25)',
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="rounded-lg bg-bg-elevated/50 border border-line/30 px-2 py-1 min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-ink-soft">Остаток</div>
              <div className="text-sm font-bold text-ink tabular-nums truncate">
                {hasReading ? formatLiters(current) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-bg-elevated/50 border border-line/30 px-2 py-1 min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-ink-soft">Объём</div>
              <div className="text-sm font-bold text-ink tabular-nums truncate">
                {capacity > 0 ? formatLiters(capacity) : '—'}
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-[10px] text-ink-soft truncate">
                {number != null ? `№${number} · ` : ''}{name}
              </div>
              {lastSyncedAt && (
                <div className="text-[10px] text-ink-soft mt-0.5 truncate">
                  синхр: {formatRelative(lastSyncedAt)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function TankCardSkeleton({ compact = false }) {
  return (
    <div className="rounded-2xl border border-line/40 bg-bg-card p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="h-3 w-24 rounded bg-bg-elevated animate-pulse" />
        <div className="h-4 w-16 rounded-full bg-bg-elevated/70 animate-pulse" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-w-0">
        <div className="space-y-2">
          <div className="h-3 w-32 rounded bg-bg-elevated animate-pulse" />
          <div className="h-10 rounded-lg bg-bg-elevated/40 animate-pulse" />
          <div className="grid grid-cols-2 gap-1.5">
            <div className="h-10 rounded-lg bg-bg-elevated/40 animate-pulse" />
            <div className="h-10 rounded-lg bg-bg-elevated/40 animate-pulse" />
          </div>
        </div>
        <div
          className="rounded-full border border-white/10 bg-bg-elevated/70 animate-pulse"
          style={{ width: compact ? 40 : 48, height: compact ? 88 : 108 }}
        />
      </div>
    </div>
  );
}
