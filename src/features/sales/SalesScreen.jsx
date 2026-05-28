import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Download,
  Fuel,
  Layers,
  Trophy,
  UserCircle2,
  TrendingUp,
  Sparkles,
  Clock,
  Calendar,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/status/EmptyState';
import { getCurrentSalesShift, listSalesShiftGroups } from '@/services/shiftService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatDateTime, formatLiters, formatMoney, formatTime, parsePosDate } from '@/lib/formatters';
import { downloadCSV, todayStamp } from '@/lib/exporters';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

const PERIODS = [
  { id: 'week', label: '7 дней' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
];

function rangeFor(period) {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);

  if (period === 'day') {
    from.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    from.setDate(now.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setMonth(0, 1);
    from.setHours(0, 0, 0, 0);
  }

  return { from, to };
}

function dateValue(value) {
  if (!value) return null;
  return parsePosDate(value);
}

function isInRange(shift, from, to) {
  const stamp = dateValue(shift?.firstAt ?? shift?.lastAt);
  if (!stamp) return true;
  if (from && stamp < from) return false;
  if (to && stamp > to) return false;
  return true;
}

function durationBetween(start, end) {
  const a = dateValue(start);
  const b = dateValue(end);
  if (!a || !b) return '—';
  const diff = Math.max(0, b.getTime() - a.getTime());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours} ч ${minutes} м`;
  return `${minutes} м`;
}

function buildLeaders(rows) {
  const map = new Map();
  for (const row of rows) {
    const name = String(
      row?.operatorFinal ?? row?.operatorOriginal ?? row?.operator ?? '—',
    ).trim() || '—';
    if (name === '—') continue;

    if (!map.has(name)) {
      map.set(name, {
        name,
        revenue: 0,
        liters: 0,
        count: 0,
        shifts: 0,
      });
    }

    const leader = map.get(name);
    leader.revenue += Number(row?.revenue ?? 0);
    leader.liters += Number(row?.liters ?? 0);
    leader.count += Number(row?.count ?? 0);
    leader.shifts += 1;
  }

  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

function exportRows(period, rows) {
  downloadCSV(`sales-shifts-${period}-${todayStamp()}`, rows, [
    { key: 'shiftKey', label: 'Смена' },
    {
      key: 'mergedKeys',
      label: 'Части',
      format: (value, row) => (Array.isArray(value) && value.length ? value.join(', ') : row.shiftKey),
    },
    {
      key: 'operatorFinal',
      label: 'Оператор',
      format: (value, row) => value || row.operatorOriginal || row.operator || '—',
    },
    { key: 'firstAt', label: 'Открыта', format: (value) => (value ? formatDateTime(value) : '—') },
    { key: 'lastAt', label: 'Закрыта', format: (value) => (value ? formatDateTime(value) : '—') },
    { key: 'liters', label: 'Литры', format: (value) => Number(value ?? 0).toFixed(3) },
    { key: 'revenue', label: 'Выручка', format: (value) => Number(value ?? 0).toFixed(2) },
    { key: 'count', label: 'Чеки' },
    { key: 'source', label: 'Источник' },
  ]);
}

export default function SalesScreen() {
  const { user } = useAuth();
  const { canExport } = usePermissions();
  const stationId = user?.profile?.station_id;
  const isOperator = user?.profile?.role === 'operator';

  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const { from, to } = rangeFor(period);
      const [currentSettled, archivedSettled] = await Promise.allSettled([
        getCurrentSalesShift({ stationId }),
        listSalesShiftGroups({
          stationId,
          from: from.toISOString(),
          to: to.toISOString(),
          limit: 1000,
          includeCurrent: false,
        }),
      ]);
      const current = currentSettled.status === 'fulfilled' ? currentSettled.value : null;
      const archived = archivedSettled.status === 'fulfilled' ? archivedSettled.value : [];
      if (archivedSettled.status === 'rejected') {
        const e = archivedSettled.reason;
        console.error('[SalesScreen] archive load failed:', e);
        setErr(`Архив: ${e?.message ?? e?.code ?? 'unknown error'}`);
      } else if (currentSettled.status === 'rejected') {
        console.warn('[SalesScreen] current shift load failed:', currentSettled.reason);
      }

      const visibleCurrent = current && isInRange(current, from, to) ? current : null;
      const currentKeys = new Set(visibleCurrent?.mergedKeys ?? [visibleCurrent?.shiftKey].filter(Boolean));
      const archivedOnly = archived.filter((row) => {
        const keys = row?.mergedKeys ?? [row?.shiftKey].filter(Boolean);
        return !keys.some((key) => currentKeys.has(key));
      });

      setCurrentShift(visibleCurrent);
      setHistory(archivedOnly);
    } catch (e) {
      setErr(e?.message ?? 'Ошибка загрузки');
      setCurrentShift(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [period, stationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleUpdate = () => load();
    window.addEventListener('fingas-data-changed', handleUpdate);
    return () => window.removeEventListener('fingas-data-changed', handleUpdate);
  }, [load]);

  const allRows = useMemo(
    () => (currentShift ? [currentShift, ...history] : history),
    [currentShift, history],
  );

  const leaders = useMemo(() => buildLeaders(allRows), [allRows]);

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-4 pb-4">
      <ScreenHeader
        title="Продажи"
        subtitle="Аналитика текущей смены и архив операционных данных АЗС"
        right={
          canExport(MODULES.SALES) && allRows.length > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => exportRows(period, allRows)}
              className="w-10 h-10 p-0 flex items-center justify-center rounded-xl bg-bg-card border border-line/30 hover:bg-bg-elevated active:scale-95 transition-all shadow-sm"
            >
              <Download className="w-4.5 h-4.5 text-ink-muted hover:text-ink" />
            </Button>
          ) : null
        }
      />

      {err && (
        <div className="rounded-2xl border border-danger/35 bg-danger/10 px-4 py-3 text-xs text-danger shadow-inner">
          {err}
        </div>
      )}

      {loading ? (
        <SalesScreenSkeleton />
      ) : (
        <>
          {currentShift && !isOperator ? (
            <LiveSalesCard shift={currentShift} />
          ) : !isOperator ? (
            <Card className="relative overflow-hidden border border-line/30 bg-bg-card/50">
              <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />
              <EmptyState
                icon={Fuel}
                title="Открытой смены нет"
                description="Текущая карточка появится, когда в azs_selling будет активная смена."
                className="py-10"
              />
            </Card>
          ) : null}

          <TopOperatorsCard leaders={leaders} />

          {/* Period Selector - Now placed precisely above the Previous Shifts section */}
          <div className="space-y-1.5 mt-2">
            <span className="text-[9px] uppercase tracking-[0.25em] text-brand-400 font-extrabold px-1.5">
              Период архива смен
            </span>
            <div className="relative grid grid-cols-3 p-1 rounded-2xl bg-bg-card/75 backdrop-blur-xl border border-line/30 shadow-inner gap-1">
              {PERIODS.map((item) => {
                const active = period === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPeriod(item.id)}
                    className="relative h-9 rounded-xl text-xs font-black transition-colors duration-200 z-10 flex items-center justify-center cursor-pointer"
                  >
                    {active && (
                      <motion.div
                        layoutId="activePeriodPill"
                        className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 rounded-xl shadow-glow -z-10"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className={active ? 'text-white' : 'text-ink-soft hover:text-ink-muted'}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Previous Shifts Collapsible Panel */}
          <Card className="!p-0 overflow-hidden shadow-card border border-line/30 relative bg-bg-card/75 backdrop-blur-2xl dark:shadow-card-premium">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left hover:bg-bg-elevated/20 active:bg-bg-elevated/40 transition-all duration-200 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.25em] text-brand-400 font-black flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-brand-400" />
                  Предыдущие смены
                </div>
                <div className="mt-1 text-base font-extrabold text-ink tracking-tight">
                  {history.length} {pluralizeShifts(history.length)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  tone="default"
                  className="font-bold px-3 py-1 text-[10px] tracking-wider bg-brand-500/10 text-brand-500 border border-brand-500/20 shadow-inner dark:bg-white/5 dark:border-white/10 dark:text-white"
                >
                  {formatMoney(history.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0))}
                </Badge>
                <div className="w-8 h-8 rounded-lg bg-bg-elevated/60 border border-line/30 flex items-center justify-center text-ink-muted">
                  <ChevronDown
                    className={
                      'w-4.5 h-4.5 transition-transform duration-350 ease-out ' + (expanded ? 'rotate-180 text-brand-400' : '')
                    }
                  />
                </div>
              </div>
            </button>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  {history.length > 0 ? (
                    <div className="border-t border-line/30 px-4 pb-4 pt-3.5 space-y-3">
                      {history.map((shift, idx) => (
                        <motion.div
                          key={`${shift.shiftKey}-${shift.lastAt ?? ''}`}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                        >
                          <ArchivedShiftRow shift={shift} />
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-t border-line/30 bg-black/[0.03] dark:bg-black/[0.05]">
                      <EmptyState
                        icon={Layers}
                        title="Архивных смен нет"
                        description="За выбранный период архив не найден."
                        className="py-10"
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </>
      )}
    </div>
    </PullToRefresh>
  );
}

function SalesScreenSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-60 rounded-3xl bg-bg-card border border-line/30 animate-pulse relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-bg-elevated/20 to-transparent -translate-x-full animate-shimmer" />
      </div>
      <div className="h-44 rounded-2xl bg-bg-card border border-line/30 animate-pulse relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-bg-elevated/20 to-transparent -translate-x-full animate-shimmer" />
      </div>
      <div className="h-16 rounded-2xl bg-bg-card border border-line/30 animate-pulse relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-bg-elevated/20 to-transparent -translate-x-full animate-shimmer" />
      </div>
    </div>
  );
}

function getFuelStyles(fuelName) {
  const name = String(fuelName || '').toUpperCase();
  if (name.includes('98') || name.includes('100')) {
    return {
      gradient: 'from-violet-600 to-fuchsia-400',
      glow: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]',
      dot: '#C084FC',
    };
  }
  if (name.includes('95')) {
    return {
      gradient: 'from-amber-500 to-yellow-300',
      glow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]',
      dot: '#FBBF24',
    };
  }
  if (name.includes('92')) {
    return {
      gradient: 'from-emerald-500 to-teal-300',
      glow: 'shadow-[0_0_8px_rgba(16,185,129,0.5)]',
      dot: '#34D399',
    };
  }
  if (name.includes('ДТ') || name.includes('DIESEL') || name.includes('ДИЗЕЛЬ')) {
    return {
      gradient: 'from-sky-600 to-cyan-400',
      glow: 'shadow-[0_0_8px_rgba(14,165,233,0.5)]',
      dot: '#38BDF8',
    };
  }
  return {
    gradient: 'from-brand-500 to-rose-400',
    glow: 'shadow-[0_0_8px_rgba(244,63,94,0.5)]',
    dot: '#FB7185',
  };
}

function LiveSalesCard({ shift }) {
  const fuelEntries = Object.entries(shift?.fuels ?? {}).sort((a, b) => b[1].liters - a[1].liters);
  const totalLiters = Number(shift?.liters ?? 0) || 1;
  const operator = shift?.operatorFinal ?? shift?.operatorOriginal ?? shift?.operator ?? '—';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-50/70 via-bg-card/95 to-brand-100/30 p-5 relative overflow-hidden backdrop-blur-2xl shadow-card transition-all duration-350 hover:shadow-md dark:border-brand-500/40 dark:from-brand-600/20 dark:via-bg-card/95 dark:to-brand-700/10 dark:shadow-card-premium dark:hover:shadow-[0_24px_50px_-12px_rgba(239, 68, 68, 0.3)]"
    >
      {/* Dynamic ambient lights */}
      <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-brand-500/15 blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-success/10 blur-3xl pointer-events-none" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.25em] text-success font-black">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            Идёт сейчас
          </div>
          <div className="mt-1.5 text-3xl font-extrabold text-ink tracking-tight tabular-nums select-all">
            {formatMoney(shift.revenue)}
          </div>
          <div className="mt-1 text-xs text-ink-muted flex items-center gap-1.5 truncate">
            <UserCircle2 className="w-3.5 h-3.5 text-ink-soft" />
            Оператор: <span className="font-bold text-ink">{operator}</span>
          </div>
        </div>
        <Badge
          tone="success"
          className="font-extrabold px-3 py-1 shadow-[0_0_12px_rgba(16,185,129,0.12)] bg-success/15 border border-success/30 text-success text-[10px] tracking-wider rounded-xl uppercase"
        >
          #{shift.shiftKey}
          {shift.parts > 1 ? ` (×${shift.parts})` : ''}
        </Badge>
      </div>

      {/* Внутренний блок для детальных данных смены */}
      <div className="relative mt-5 rounded-2xl border border-brand-500/10 bg-bg-soft/75 backdrop-blur-xl p-4 space-y-4 shadow-inner dark:border-white/[0.04] dark:bg-[#0A1128]/70">
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={Fuel} label="Литры" value={formatLiters(shift.liters)} />
          <Stat icon={Clock} label="Открыта" value={shift.firstAt ? formatTime(shift.firstAt) : '—'} />
          <Stat icon={Zap} label="Длительность" value={durationBetween(shift.firstAt, shift.lastAt)} />
        </div>

        {fuelEntries.length > 0 ? (
          <div className="pt-4 border-t border-line/30 dark:border-white/[0.06] space-y-3">
            {fuelEntries.slice(0, 4).map(([fuel, value]) => {
              const pct = (Number(value.liters ?? 0) / totalLiters) * 100;
              const fstyle = getFuelStyles(fuel);
              return (
                <div key={fuel} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-ink font-bold truncate flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{
                          background: fstyle.dot,
                          boxShadow: `0 0 6px ${fstyle.dot}aa`
                        }}
                      />
                      {fuel}
                    </span>
                    <span className="text-ink-muted font-bold tabular-nums text-right">
                      {formatLiters(value.liters)} <span className="text-[9px] text-ink-soft font-medium">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-elevated/80 dark:bg-black/40 overflow-hidden border border-line/30 dark:border-white/[0.03] p-[2px] relative">
                    <div
                      className={`h-full bg-gradient-to-r ${fstyle.gradient} rounded-full transition-all duration-500 ${fstyle.glow}`}
                      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-right font-bold text-ink">
                    {formatMoney(value.revenue)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function TopOperatorsCard({ leaders }) {
  const maxRevenue = useMemo(() => Math.max(...leaders.map((l) => l.revenue), 1), [leaders]);

  return (
    <Card className="shadow-card relative overflow-hidden border border-brand-500/10 bg-bg-card/75 backdrop-blur-2xl dark:shadow-card-premium dark:border-white/[0.03]">
      <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />

      <div className="relative flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-brand-400 font-black flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-brand-400" />
            Рейтинг операторов
          </div>
          <div className="mt-1 text-base font-extrabold text-ink tracking-tight">Лидеры смен по выручке</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shadow-inner">
          <Sparkles className="w-4 h-4 text-brand-400 animate-pulse" />
        </div>
      </div>

      {leaders.length > 0 ? (
        <div className="space-y-2.5">
          {leaders.map((leader, index) => {
            const isTop3 = index < 3;
            const colors = [
              // 1st Place - Gold
              {
                border: 'border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 via-bg-card to-bg-card shadow-[0_4px_16px_rgba(234,179,8,0.04)] dark:border-yellow-500/35 dark:from-yellow-500/10 dark:via-bg-elevated/20 dark:to-bg-elevated/5',
                badge: 'bg-gradient-to-br from-yellow-300 via-yellow-500 to-amber-600 text-black shadow-[0_0_12px_rgba(234,179,8,0.35)]',
                label: 'text-yellow-500 font-black',
                bar: 'bg-gradient-to-r from-yellow-400 to-amber-500 shadow-[0_0_6px_rgba(234,179,8,0.3)]',
              },
              // 2nd Place - Silver
              {
                border: 'border-slate-300/30 bg-gradient-to-r from-slate-300/5 via-bg-card to-bg-card dark:border-slate-400/20 dark:from-slate-400/5 dark:via-bg-elevated/20 dark:to-bg-elevated/5',
                badge: 'bg-gradient-to-br from-slate-200 via-slate-400 to-slate-500 text-black shadow-[0_0_8px_rgba(203,213,225,0.25)]',
                label: 'text-slate-300 font-bold',
                bar: 'bg-gradient-to-r from-slate-400 to-slate-300',
              },
              // 3rd Place - Bronze
              {
                border: 'border-amber-700/15 bg-gradient-to-r from-amber-700/5 via-bg-card to-bg-card dark:border-amber-700/20 dark:from-amber-700/5 dark:via-bg-elevated/20 dark:to-bg-elevated/5',
                badge: 'bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900 text-white shadow-[0_0_6px_rgba(180,83,9,0.2)]',
                label: 'text-amber-600 font-bold',
                bar: 'bg-gradient-to-r from-amber-600 to-amber-500',
              },
              // 4th & 5th Places
              {
                border: 'border-line/30 bg-bg-elevated/30 dark:border-white/[0.02] dark:bg-bg-elevated/25',
                badge: 'bg-bg-soft border border-line/30 text-ink-soft dark:bg-white/5 dark:border-white/10 text-ink-soft',
                label: 'text-ink-soft font-semibold',
                bar: 'bg-brand-400/40 dark:bg-brand-500/60',
              },
              {
                border: 'border-line/30 bg-bg-elevated/30 dark:border-white/[0.02] dark:bg-bg-elevated/25',
                badge: 'bg-bg-soft border border-line/30 text-ink-soft dark:bg-white/5 dark:border-white/10 text-ink-soft',
                label: 'text-ink-soft font-semibold',
                bar: 'bg-brand-400/40 dark:bg-brand-500/60',
              },
            ];

            const style = colors[index] || colors[3];
            const revSharePct = (leader.revenue / maxRevenue) * 100;

            return (
              <motion.div
                key={leader.name}
                whileTap={{ scale: 0.985 }}
                className={`rounded-2xl border ${style.border} p-3 flex flex-col gap-2 transition-all duration-200 shadow-sm relative overflow-hidden`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl border-transparent flex items-center justify-center text-xs font-black select-none ${style.badge}`}>
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-ink truncate flex items-center gap-1.5">
                      {leader.name}
                      {index === 0 && <Trophy className="w-3.5 h-3.5 text-yellow-500 inline flex-shrink-0" />}
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-soft flex items-center gap-1.5 leading-none font-medium">
                      <span>{leader.shifts} {pluralizeShifts(leader.shifts)}</span>
                      <span>·</span>
                      <span>{leader.count} чеков</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-extrabold text-ink tabular-nums tracking-tight">
                      {formatMoney(leader.revenue)}
                    </div>
                    <div className="text-[10px] text-ink-muted mt-0.5 font-bold tabular-nums">
                      {formatLiters(leader.liters)}
                    </div>
                  </div>
                </div>

                {/* Shimmering performance bar indicator for gaming look */}
                <div className="mt-1 space-y-1">
                  <div className="h-1 rounded-full bg-bg-elevated/70 dark:bg-black/35 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
                      style={{ width: `${Math.max(3, revSharePct)}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Trophy}
          title="Нет лидеров"
          description="Список пуст за выбранный период"
          className="py-6"
        />
      )}
    </Card>
  );
}

function ArchivedShiftRow({ shift }) {
  const operator = shift?.operatorFinal ?? shift?.operatorOriginal ?? shift?.operator ?? '—';
  // Даты — приоритет azs_shift.DatetimeShiftBegin/End (firstAt/lastAt). balanceAt
  // = synced_at из azs_balance, это момент репликации в Supabase, а не реальное
  // время смены — оставляем как fallback на случай если строки в azs_shift нет.
  const startedAt = shift?.firstAt ?? shift?.balanceAt ?? null;
  const endedAt = shift?.lastAt ?? shift?.firstAt ?? shift?.balanceAt ?? startedAt;
  const showChecks = Boolean(shift?.hasSellingTime);

  return (
    <div className="rounded-2xl bg-bg-card/50 border border-line/30 hover:border-brand-500/20 dark:bg-[#0F1832]/40 dark:border-white/[0.02] dark:hover:border-brand-500/25 p-4 flex flex-col gap-3 transition-all duration-200 shadow-sm relative group cursor-pointer">
      {/* Subtle indicator bar on hover */}
      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-lg bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-ink tabular-nums truncate">
            #{shift.shiftKey}
            {shift.parts > 1 ? (
              <span className="inline-flex items-center gap-0.5 text-[8px] text-info font-black px-1.5 py-0.5 rounded bg-info/10 border border-info/20 tracking-wider uppercase">
                <Layers className="w-2.5 h-2.5" />×{shift.parts}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[10px] text-ink-muted font-bold truncate flex items-center gap-1.5">
            <UserCircle2 className="w-3.5 h-3.5 text-ink-soft" />
            {operator}
          </div>
          <div className="text-[9px] text-ink-soft font-semibold mt-1 flex items-center gap-1 truncate">
            <Calendar className="w-3 h-3 text-ink-soft flex-shrink-0" />
            {startedAt
              ? `${formatDateTime(startedAt)} → ${formatTime(endedAt)}`
              : 'дата отсутствует'}
          </div>
        </div>
        <Badge
          tone={shift.source === 'azs_balance' ? 'default' : 'info'}
          className="font-bold tracking-wider uppercase text-[8px] px-2 py-0.5 shadow-inner animate-none"
        >
          {shift.source === 'azs_balance' ? 'архив' : shift.source}
        </Badge>
      </div>

      <div className="border-t border-dashed border-line/30 dark:border-white/[0.06] my-0.5" />

      <div className="grid grid-cols-3 gap-2 text-[10px] pt-1">
        <MetricCell icon={TrendingUp} label="Выручка" value={formatMoney(shift.revenue)} bold />
        <MetricCell icon={Fuel} label="Литры" value={formatLiters(shift.liters)} />
        <MetricCell icon={Clock} label="Чеки" value={showChecks ? Number(shift.count ?? 0).toLocaleString('ru-RU') : '—'} />
      </div>
      {(shift.calibrationDeducted ?? 0) > 0 && (
        <div className="text-[10px] text-warning font-bold flex items-center gap-1.5 mt-1">
          <span>— поверка</span>
          <span>{formatLiters(shift.calibrationDeducted)}</span>
          {(shift.calibrationDeductedRevenue ?? 0) > 0 && (
            <span className="text-ink-soft">· {formatMoney(shift.calibrationDeductedRevenue)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-line/30 bg-bg-card px-2 py-2 text-center transition-all hover:bg-bg-soft hover:border-brand-500/20 shadow-sm relative group dark:border-white/[0.03] dark:bg-white/[0.02] dark:hover:bg-white/[0.05]">
      {Icon && <Icon className="w-3 h-3 text-ink-soft mx-auto mb-1 group-hover:text-brand-400 transition-colors" />}
      <div className="text-[9px] uppercase tracking-wider text-ink-soft font-black">{label}</div>
      <div className="mt-0.5 text-xs font-bold text-ink truncate tabular-nums">{value}</div>
    </div>
  );
}

function MetricCell({ icon: Icon, label, value, bold = false }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-ink-soft font-black flex items-center gap-1">
        {Icon && <Icon className="w-2.8 h-2.8 text-ink-soft" />}
        {label}
      </div>
      <div className={`mt-1 text-xs tabular-nums truncate ${bold ? 'font-extrabold text-ink' : 'text-ink-muted font-bold'}`}>
        {value}
      </div>
    </div>
  );
}

function pluralizeShifts(value) {
  const n = Math.abs(Number(value) || 0) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return 'смен';
  if (last === 1) return 'смена';
  if (last >= 2 && last <= 4) return 'смены';
  return 'смен';
}
