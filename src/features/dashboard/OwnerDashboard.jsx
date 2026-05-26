// [UPDATED BY ANTIGRAVITY CLI - 2026-05-26]
// Project: Fingas
// Purpose: Главная — роскошный, темонезависимый рабочий dashboard (Owner/Admin view)
// в премиум-логике AinurPOS:
//   1. Header (станция · дата · приветствие) с красивым сбалансированным легированием
//   2. Роскошная люксовая карточка Выручки с капсюльным переключателем на Framer Motion
//   3. Умные системные оповещения (ALERTS) с индикаторами
//   4. Инновационная визуализация запасов топлива (TANKS)
//   5. Геймифицированный плиточный список отчетов (QUICK REPORTS)
// Все расчеты, RLS, вызовы Supabase и дельты сохранены на 100% в исходном виде.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  Droplets,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TankCard, TankCardSkeleton } from '@/components/charts/TankCard';
import {
  aggregateByDay,
  compareWindows,
  computeFifoCost,
} from '@/services/salesService';
import { getTankStatusesWithBalance } from '@/services/tankService';
import { listEmployees } from '@/services/profileService';
import { listPendingShiftReports } from '@/services/shiftService';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, formatLiters } from '@/lib/formatters';
import { PROFILE_STATUS, ROLE_LABELS } from '@/lib/constants';

const PERIODS = [
  { id: 'day',   label: 'День',    days: 1   },
  { id: 'week',  label: 'Неделя',  days: 7   },
  { id: 'month', label: 'Месяц',   days: 30  },
  { id: 'year',  label: 'Год',     days: 365 },
];

const REPORTS = [
  { to: '/shifts',          label: 'Сменный отчёт',         icon: ClipboardList, desc: 'Смены · сверка · расхождения' },
  { to: '/pl',              label: 'Прибыли и убытки',      icon: TrendingUp,    desc: 'Выручка · себест. · маржа' },
  { to: '/counterparties',  label: 'Контрагенты и долги',   icon: Users,         desc: 'Сальдо · долги · поставщики' },
  { to: '/fuel-balances',   label: 'Резервуары',            icon: Droplets,      desc: 'Остатки и замеры' },
  { to: '/cashflow',        label: 'Движение денег',        icon: Wallet,        desc: 'Приход · расход · поток' },
  { to: '/taxes',           label: 'Налоги',                icon: Receipt,       desc: 'Платежи и периоды' },
];

const TANK_STATUS_META = {
  ok: { label: 'нормально', tone: 'success' },
  low: { label: 'низко', tone: 'warning' },
  critical: { label: 'критично', tone: 'danger' },
  unknown: { label: 'нет замера', tone: 'default' },
};

function rangeFor(daysBack) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const to = new Date();
  const from = new Date(today.getTime() - (daysBack - 1) * 86400000);
  return { from, to };
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d)   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export default function OwnerDashboard() {
  const { user } = useAuth();
  const profile = user?.profile;
  const orgId = profile?.organization_id;
  const stationId = profile?.station_id;

  const [period, setPeriod] = useState('week');
  const [showAllReports, setShowAllReports] = useState(false);
  const [trend, setTrend] = useState([]);
  const [, setTodayCmp] = useState(null);
  const [periodAgg, setPeriodAgg] = useState({ current: { revenue: 0, liters: 0, count: 0 } });
  const [, setMargin] = useState({ revenue: 0, cost: 0, marginPct: null });
  const [alerts, setAlerts] = useState([]);
  const [tanks, setTanks] = useState([]);
  const [showTankDetails, setShowTankDetails] = useState(false);
  const [stationName, setStationName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tanksLoading, setTanksLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const days = PERIODS.find((p) => p.id === period)?.days ?? 7;
      const { from, to } = rangeFor(days);
      const fromISO = from.toISOString();
      const toISO = to.toISOString();
      const fromDate = from.toISOString().slice(0, 10);
      const toDate = to.toISOString().slice(0, 10);

      const today = startOfDay(new Date());
      const yesterday = startOfDay(new Date(today.getTime() - 86400000));
      const yesterdayEnd = endOfDay(yesterday);

      const [cmp, daily, fifo, pendingShifts, requests, { data: collRows }, stationRow] = await Promise.all([
        compareWindows({
          currentFrom: today.toISOString(),
          currentTo: new Date().toISOString(),
          priorFrom: yesterday.toISOString(),
          priorTo: yesterdayEnd.toISOString(),
        }).catch(() => null),
        aggregateByDay({ from: fromISO, to: toISO }).catch(() => []),
        computeFifoCost({ from: fromDate, to: toDate }).catch(() => ({ total: 0 })),
        listPendingShiftReports({}).catch(() => []),
        listEmployees({ organizationId: orgId, status: PROFILE_STATUS.PENDING }).catch(() => []),
        supabase
          .from('cashflow')
          .select('amount')
          .eq('operation_type', 'collection')
          .eq('status', 'pending_confirmation'),
        stationId
          ? supabase.from('stations').select('name, city').eq('id', stationId).maybeSingle().then(({ data }) => data)
          : Promise.resolve(null),
      ]);

      setTodayCmp(cmp);
      setTrend(daily);
      setStationName(stationRow ? `${stationRow.name}${stationRow.city ? ` · ${stationRow.city}` : ''}` : null);

      const periodRevenue = daily.reduce((s, d) => s + d.revenue, 0);
      const periodLiters = daily.reduce((s, d) => s + d.liters, 0);
      const periodCount = daily.reduce((s, d) => s + d.count, 0);
      setPeriodAgg({ current: { revenue: periodRevenue, liters: periodLiters, count: periodCount } });

      const cost = fifo.total ?? 0;
      setMargin({
        revenue: periodRevenue,
        cost,
        marginPct: periodRevenue > 0 ? ((periodRevenue - cost) / periodRevenue) * 100 : null,
      });

      // alerts
      const a = [];
      if (pendingShifts.length > 0) {
        a.push({
          tone: 'warn',
          icon: ClipboardList,
          title: `Смен на утверждении: ${pendingShifts.length}`,
          desc: 'Проверьте сверки операторов',
          to: '/shifts',
        });
      }
      if (requests.length > 0) {
        a.push({
          tone: 'info',
          icon: Users,
          title: `Заявок сотрудников: ${requests.length}`,
          desc: 'Ожидают одобрения',
          to: '/employees',
        });
      }
      const collTotal = (collRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      if (collTotal > 0) {
        a.push({
          tone: 'info',
          icon: Wallet,
          title: `Инкассации: ${formatMoney(collTotal)}`,
          desc: 'Ждут подтверждения',
          to: '/collections',
        });
      }
      setAlerts(a);
    } finally {
      setLoading(false);
    }
  }, [period, orgId, stationId]);

  useEffect(() => { load(); }, [load]);

  // Tanks load separately
  useEffect(() => {
    let cancelled = false;
    setTanksLoading(true);
    getTankStatusesWithBalance({ organizationId: orgId, stationId })
      .then((rows) => { if (!cancelled) setTanks(rows); })
      .catch(() => { if (!cancelled) setTanks([]); })
      .finally(() => { if (!cancelled) setTanksLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, stationId]);

  // Add tank-derived alerts
  const allAlerts = useMemo(() => {
    const extras = [];
    for (const t of tanks) {
      if (t.status === 'critical') {
        extras.push({
          tone: 'danger',
          icon: AlertTriangle,
          title: `${t.fuelCode || t.name}: критично`,
          desc: `${t.name}: ${formatLiters(t.currentLiters)} / ${formatLiters(t.capacityLiters)}`,
          to: '/fuel-balances',
        });
      } else if (t.status === 'low') {
        extras.push({
          tone: 'warn',
          icon: Droplets,
          title: `${t.fuelCode || t.name}: низкий остаток`,
          desc: `${t.name}: ${formatLiters(t.currentLiters)}`,
          to: '/fuel-balances',
        });
      }
    }
    return [...extras, ...alerts];
  }, [tanks, alerts]);

  const trendWithMA = useMemo(() => {
    if (trend.length === 0) return [];
    const N = 7;
    return trend.map((d, i) => {
      const window = trend.slice(Math.max(0, i - N + 1), i + 1);
      const ma = window.reduce((s, x) => s + x.revenue, 0) / window.length;
      return { ...d, ma };
    });
  }, [trend]);

  const todayDateStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4 pb-4">
      {/* HEADER - Luxury sleek welcome strip */}
      <div className="pt-1.5 px-0.5">
        <div className="flex items-end justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.25em] text-ink-soft font-black">
              {todayDateStr}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-ink mt-0.5 truncate select-none">
              {profile?.full_name ? `Привет, ${profile.full_name.split(' ')[0]}` : 'Главная'}
            </h1>
            {stationName && (
              <div className="text-xs text-ink-muted truncate flex items-center gap-1.5 mt-1 font-semibold">
                <Building2 className="w-3.5 h-3.5 text-brand-400" /> {stationName}
              </div>
            )}
          </div>
          <Badge
            tone="brand"
            className="font-extrabold px-3 py-1 bg-brand-500/10 text-brand-500 border border-brand-500/20 shadow-inner text-[10px] tracking-wider uppercase rounded-xl flex-shrink-0"
          >
            {ROLE_LABELS[profile?.role] ?? 'Владелец'}
          </Badge>
        </div>
      </div>

      {/* REVENUE TREND - Spectacular brand visual dashboard card */}
      <Card className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-50/70 via-bg-card/95 to-brand-100/30 p-5 relative overflow-hidden backdrop-blur-2xl shadow-card transition-all duration-350 hover:shadow-md dark:border-brand-500/40 dark:from-brand-600/20 dark:via-bg-card/95 dark:to-brand-700/10 dark:shadow-card-premium dark:hover:shadow-[0_24px_50px_-12px_rgba(239, 68, 68, 0.35)]">
        {/* Glowing backdrop ambient orb */}
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-brand-500/15 blur-3xl pointer-events-none animate-pulse" />

        <div className="relative flex items-start justify-between gap-3 mb-4 min-w-0">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.25em] text-brand-400 font-black flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-brand-400 animate-pulse" />
              Финансовый отчёт · {PERIODS.find((p) => p.id === period)?.label}
            </div>
            <div className="text-3xl font-extrabold text-ink mt-1.5 tracking-tight tabular-nums select-all">
              {loading ? '…' : formatMoney(periodAgg.current.revenue)}
            </div>
            <div className="text-xs text-ink-muted mt-1 font-bold truncate">
              {loading ? '…' : `${formatLiters(periodAgg.current.liters)} · ${periodAgg.current.count.toLocaleString('ru-RU')} чеков`}
            </div>
          </div>
        </div>

        {/* Period Selector - Segmented capsule switcher control with smooth frame transitions */}
        <div className="relative grid grid-cols-4 p-1 rounded-2xl bg-bg-card/75 backdrop-blur-xl border border-line/30 shadow-inner gap-1 mb-4">
          {PERIODS.map((p) => {
            const active = period === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className="relative h-8 rounded-xl text-[11px] font-black transition-colors duration-200 z-10 flex items-center justify-center cursor-pointer"
              >
                {active && (
                  <motion.div
                    layoutId="activePeriodPillDashboard"
                    className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 rounded-xl shadow-glow -z-10"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className={active ? 'text-white' : 'text-ink-soft hover:text-ink-muted'}>
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Chart area */}
        <div className="h-44 mt-2">
          {trendWithMA.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendWithMA} margin={{ top: 6, right: 0, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="ownerRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E11D48" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#E11D48" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#94A3B8"
                  fontSize={10}
                  fontWeight={600}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={10}
                  fontWeight={600}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}к` : String(v)}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(225,29,72,0.2)', strokeWidth: 1.5 }}
                  contentStyle={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-brand-500)',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 'bold',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'
                  }}
                  formatter={(v) => formatMoney(v)}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#E11D48"
                  strokeWidth={2.5}
                  fill="url(#ownerRevGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="ma"
                  stroke="#94A3B8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center bg-bg-soft/40 dark:bg-black/10 rounded-2xl border border-line/20">
              <div className="text-xs text-ink-muted text-center py-6">
                <TrendingDown className="w-6 h-6 mx-auto text-ink-soft mb-1.5 animate-bounce" />
                {loading ? 'Загрузка финансовых данных…' : 'Нет данных за период'}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* SYSTEM ALERTS - Sleek glowing notifications */}
      {allAlerts.length > 0 && (
        <div className="space-y-2">
          {allAlerts.slice(0, 4).map((a, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <AlertRow alert={a} />
            </motion.div>
          ))}
        </div>
      )}

      {/* TANKS RESERVOIRS STATUS PANEL */}
      <Card className="!p-4 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl">
        <SectionTitle
          icon={Droplets}
          title="Запасы топлива"
          right={tanks.length > 0 ? `${tanks.length} резервуаров` : ''}
          action={tanks.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowTankDetails((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line/30 bg-bg-elevated/80 px-3.5 py-1 text-[10px] font-black text-ink hover:text-brand-400 hover:border-brand-500/30 transition-all active:scale-95 cursor-pointer select-none"
            >
              {showTankDetails ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 rotate-180 text-brand-400" />
                  Свернуть
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-brand-400" />
                  Развернуть
                </>
              )}
            </button>
          ) : null}
        />
        {tanksLoading ? (
          showTankDetails ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[0, 1].map((i) => <TankCardSkeleton key={i} />)}
            </div>
          ) : (
            <div className="space-y-2">
              {[0, 1].map((i) => <TankSummarySkeleton key={i} />)}
            </div>
          )
        ) : tanks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line/60 p-6 text-center text-xs text-ink-muted">
            Резервуары АЗС пока не добавлены.{' '}
            <Link className="text-brand-400 font-bold hover:underline" to="/tanks">Добавить резервуар</Link>
          </div>
        ) : !showTankDetails ? (
          <div className="space-y-2.5">
            {tanks.map((t) => (
              <TankSummaryRow
                key={t.id}
                name={t.name}
                number={t.number}
                fuel={t.fuelCode}
                fuelColor={t.fuel_type?.color || '#FF4D3D'}
                current={t.currentLiters}
                capacity={t.capacityLiters}
                status={t.currentLiters > 0 ? t.status : 'unknown'}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {tanks.map((t) => (
              <motion.div
                key={t.id}
                whileHover={{ scale: 1.01 }}
                className="transition-transform duration-250"
              >
                <TankCard
                  name={t.name}
                  number={t.number}
                  fuel={t.fuelCode}
                  fuelColor={t.fuel_type?.color || '#FF4D3D'}
                  current={t.currentLiters}
                  capacity={t.capacityLiters}
                  status={t.currentLiters > 0 ? t.status : 'unknown'}
                  lastSyncedAt={t.lastSyncedAt}
                  compact
                  layout="vertical"
                />
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      {/* QUICK REPORTS TILES PANEL */}
      <Card className="!p-4 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl">
        <SectionTitle icon={ShieldCheck} title="Аналитические отчёты" right={`${REPORTS.length}`} />
        <div className="grid grid-cols-1 gap-2">
          <AnimatePresence initial={false}>
            {(showAllReports ? REPORTS : REPORTS.slice(0, 3)).map((r, idx) => (
              <motion.div
                key={r.to}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
              >
                <Link
                  to={r.to}
                  className="flex items-center gap-3.5 rounded-2xl bg-bg-card border border-line/30 p-3.5 min-w-0 hover:border-brand-500/20 hover:bg-bg-soft/40 dark:hover:bg-white/[0.01] transition-all duration-200 shadow-sm relative group cursor-pointer"
                >
                  <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-lg bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-200">
                    <r.icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold text-ink truncate group-hover:text-brand-400 transition-colors">
                      {r.label}
                    </div>
                    <div className="text-[10px] text-ink-muted font-bold truncate mt-0.5">
                      {r.desc}
                    </div>
                  </div>
                  <ChevronRight className="w-4.5 h-4.5 text-ink-soft flex-shrink-0 group-hover:translate-x-0.5 transition-transform duration-200" />
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {REPORTS.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAllReports((v) => !v)}
            className="w-full mt-3 text-xs font-black text-brand-400 hover:text-brand-500 py-1.5 border border-dashed border-line/45 rounded-xl hover:border-brand-500/30 transition-all duration-200 cursor-pointer select-none"
          >
            {showAllReports ? 'Свернуть список' : `Показать ещё ${REPORTS.length - 3} отчетов`}
          </button>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AlertRow({ alert }) {
  const { tone, icon: Icon, title, desc, to } = alert;
  const wrap =
    tone === 'danger' ? 'border-danger/35 bg-danger/5 hover:border-danger/60'   :
    tone === 'warn'   ? 'border-warning/35 bg-warning/5 hover:border-warning/60' :
                        'border-info/35 bg-info/5 hover:border-info/60';
  const iconCls =
    tone === 'danger' ? 'bg-danger/15 border-danger/25 text-danger'   :
    tone === 'warn'   ? 'bg-warning/15 border-warning/25 text-warning' :
                        'bg-info/15 border-info/25 text-info';
  return (
    <Link to={to ?? '#'} className="block">
      <motion.div
        whileTap={{ scale: 0.985 }}
        className={`rounded-2xl border ${wrap} p-3.5 flex items-center gap-3.5 min-w-0 transition-all duration-200 shadow-sm relative group cursor-pointer`}
      >
        <div className={`w-9.5 h-9.5 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-inner ${iconCls}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-extrabold text-ink truncate">{title}</div>
          <div className="text-[10px] text-ink-muted mt-0.5 font-bold truncate">{desc}</div>
        </div>
        <ChevronRight className="w-4.5 h-4.5 text-ink-soft flex-shrink-0 group-hover:translate-x-0.5 transition-transform duration-200" />
      </motion.div>
    </Link>
  );
}

function TankSummaryRow({ name, number, fuel, fuelColor, current, capacity, status = 'unknown' }) {
  const meta = TANK_STATUS_META[status] ?? TANK_STATUS_META.unknown;
  const hasReading = Number(current) > 0;
  const pct = capacity > 0 ? Math.min(100, Math.max(0, (current / capacity) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-line/30 bg-bg-card/60 p-3.5 hover:border-brand-500/20 transition-all duration-200 shadow-sm relative overflow-hidden group">
      {/* Background tracking percentage bar */}
      <div
        className="absolute left-0 top-0 bottom-0 bg-bg-soft/40 dark:bg-white/[0.015] -z-10 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
      <div className="flex items-center gap-3 min-w-0 relative">
        {/* Glowing Fuel indicator indicator */}
        <div
          className="w-3 h-3 rounded-full flex-shrink-0 shadow-glow animate-pulse"
          style={{
            background: fuelColor,
            boxShadow: `0 0 10px ${fuelColor}aa`
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-ink truncate">
            {fuel || '—'}{number != null ? ` · №${number}` : ''}{name ? ` · ${name}` : ''}
          </div>
        </div>
        <div className="text-[10px] text-ink-muted font-bold tabular-nums whitespace-nowrap flex-shrink-0">
          {hasReading ? formatLiters(current) : '—'} / {capacity > 0 ? formatLiters(capacity) : '—'}
        </div>
        <div className="text-[10px] font-black text-ink tabular-nums whitespace-nowrap flex-shrink-0">
          {Math.round(pct)}%
        </div>
        <Badge
          tone={meta.tone}
          className="text-[8px] font-black tracking-wider uppercase px-2 py-0.5 flex-shrink-0 shadow-inner animate-none"
        >
          {meta.label}
        </Badge>
      </div>
    </div>
  );
}

function TankSummarySkeleton() {
  return (
    <div className="rounded-2xl border border-line/30 bg-bg-card/50 px-3.5 py-3 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-2.5 h-2.5 rounded-full bg-bg-elevated animate-pulse flex-shrink-0" />
        <div className="h-3 rounded bg-bg-elevated animate-pulse flex-1 min-w-0" />
        <div className="h-3 rounded bg-bg-elevated animate-pulse w-24 flex-shrink-0" />
        <div className="h-4 rounded bg-bg-elevated animate-pulse w-10 flex-shrink-0" />
        <div className="h-5 rounded-full bg-bg-elevated animate-pulse w-16 flex-shrink-0" />
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, right, action }) {
  return (
    <div className="flex items-center justify-between mb-4 min-w-0 gap-2 select-none">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-4.5 h-4.5 text-brand-400 flex-shrink-0" />}
        <div className="font-extrabold text-ink truncate text-sm">{title}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {right && (
          <Badge
            tone="default"
            className="font-bold text-[9px] tracking-wider uppercase bg-bg-elevated text-ink-soft border border-line/30 px-2 py-0.5"
          >
            {right}
          </Badge>
        )}
        {action}
      </div>
    </div>
  );
}
