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

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
const TrendChart = lazy(() => import('./TrendChart'));
const DashboardChatCard = lazy(() => import('./DashboardChatCard'));
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
  FileText,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TankCard, TankCardSkeleton } from '@/components/charts/TankCard';
import { Wrench, Gauge } from 'lucide-react';

// Quick forms and bottom sheet for reservoir click triggers
import { BottomSheet } from '@/components/bottom-sheets/BottomSheet';
import { TankMeasurementQuickForm } from '@/features/quick-add/forms/TankMeasurementQuickForm';
import { CalibrationQuickForm } from '@/features/quick-add/forms/CalibrationQuickForm';
import { CashflowQuickForm } from '@/features/quick-add/forms/CashflowQuickForm';
import { TankAdjustmentQuickForm } from '@/features/quick-add/forms/TankAdjustmentQuickForm';
import { getTankStatusesWithBalance } from '@/services/tankService';
import { listEmployees } from '@/services/profileService';
import {
  aggregateBalanceByDay,
  aggregateBalanceByMonth,
  listPendingShiftReports,
  getCurrentSalesShift,
} from '@/services/shiftService';
import { aggregateForShift } from '@/services/salesService';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, formatLiters } from '@/lib/formatters';
import { PROFILE_STATUS, ROLE_LABELS } from '@/lib/constants';

// Периоды для финансового отчёта/графика. Границы — реальные («с 1-го числа»,
// «с 1 января»), не «последние N дней», иначе «Месяц» показывает 30 дней
// поперёк двух месяцев, что путает.
const PERIODS = [
  { id: 'day',   label: 'День'   },
  { id: 'week',  label: 'Неделя' },
  { id: 'month', label: 'Месяц'  },
  { id: 'year',  label: 'Год'    },
];

const REPORTS = [
  { to: '/shifts',          label: 'Сменный отчёт',         icon: ClipboardList, desc: 'Смены · сверка · расхождения' },
  { to: '/pl',              label: 'P&L',                   icon: TrendingUp,    desc: 'Выручка · себест. · маржа' },
  { to: '/counterparties',  label: 'Контрагенты',           icon: Users,         desc: 'Сальдо · долги · поставщики' },
  { to: '/taxes',           label: 'Налоги',                icon: Receipt,       desc: 'Платежи и периоды' },
  { to: '/documents',       label: 'Документы',             icon: FileText,      desc: 'Накладные · чеки · акты' },
];

const TANK_STATUS_META = {
  ok: { label: 'нормально', tone: 'success' },
  low: { label: 'низко', tone: 'warning' },
  critical: { label: 'критично', tone: 'danger' },
  unknown: { label: 'нет замера', tone: 'default' },
};

// Реальные границы периода:
//   day   — сегодня с 00:00 до сейчас
//   week  — текущая неделя с понедельника 00:00 до сейчас
//   month — с 1-го числа текущего месяца до сейчас
//   year  — с 1 января текущего года до сейчас
function rangeFor(period) {
  const now = new Date();
  const to = new Date(now);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  let from;
  if (period === 'day') {
    from = today;
  } else if (period === 'week') {
    // Пн = 1, Вс = 0 → сдвиг до понедельника.
    const offsetToMonday = (today.getDay() + 6) % 7;
    from = new Date(today.getTime() - offsetToMonday * 86400000);
  } else if (period === 'month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
  } else { // year
    from = new Date(today.getFullYear(), 0, 1);
  }
  return { from, to };
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const profile = user?.profile;
  const orgId = profile?.organization_id;
  const stationId = profile?.station_id;

  const navigate = useNavigate();
  const [period, setPeriod] = useState('week');
  const [showAllReports, setShowAllReports] = useState(false);
  const [selectedTank, setSelectedTank] = useState(null);
  const [activeFormType, setActiveFormType] = useState(null);
  const [currentShift, setCurrentShift] = useState(null);
  const [currentShiftLoading, setCurrentShiftLoading] = useState(false);

  function handleFormDone() {
    setActiveFormType(null);
    setSelectedTank(null);
    setTanksLoading(true);
    getTankStatusesWithBalance({ organizationId: orgId, stationId })
      .then((rows) => setTanks(rows))
      .catch(() => setTanks([]))
      .finally(() => setTanksLoading(false));
  }

  // Каждый блок грузится независимо. Ничего не ждёт «всех» —
  // экран рисуется мгновенно, данные подтягиваются по мере готовности.
  const [trend, setTrend] = useState([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [periodAgg, setPeriodAgg] = useState({ current: { revenue: 0, liters: 0, count: 0 } });

  const [alerts, setAlerts] = useState([]);
  const [tanks, setTanks] = useState([]);
  const [tanksLoading, setTanksLoading] = useState(true);

  const [stationName, setStationName] = useState(null);

  // Один признак для UI кнопок «период» — есть/нет данных для текущего period.
  const loading = trendLoading;

  // 1. Тренд + агрегат периода — из azs_selling (для 'day' в реальном времени) или azs_balance (для архивов).
  //    На годе помесячно (12 точек), иначе по дням.
  useEffect(() => {
    let cancelled = false;
    setTrendLoading(true);
    const { from, to } = rangeFor(period);

    if (period === 'day') {
      aggregateForShift({ stationId, from: from.toISOString(), to: to.toISOString() })
        .then((result) => {
          if (cancelled) return;
          // Строим 8 трехчасовых бакетов для красивого суточного графика
          const buckets = [];
          for (let i = 0; i < 8; i++) {
            const bStart = new Date(from);
            bStart.setHours(i * 3, 0, 0, 0);
            const bEnd = new Date(from);
            bEnd.setHours(i * 3 + 3, 0, 0, 0);
            const label = `${String(i * 3).padStart(2, '0')}:00`;
            buckets.push({
              day: label,
              label,
              weekday: '',
              revenue: 0,
              liters: 0,
              count: 0,
            });
          }

          // Группируем транзакции azs_selling по бакетам
          const rows = result.rows || [];
          for (const r of rows) {
            const dt = new Date(r.TransactionDatetime || r.transaction_datetime);
            const hr = dt.getHours();
            const bucketIndex = Math.floor(hr / 3);
            if (bucketIndex >= 0 && bucketIndex < 8) {
              buckets[bucketIndex].revenue += Number(r.ShopCost ?? 0);
              buckets[bucketIndex].liters += Number(r.Volume ?? 0);
              buckets[bucketIndex].count += 1;
            }
          }

          setTrend(buckets);
          setPeriodAgg({
            current: {
              revenue: result.revenue,
              liters: result.liters,
              count: result.count,
            },
          });
        })
        .catch(() => {
          if (!cancelled) {
            setTrend([]);
            setPeriodAgg({ current: { revenue: 0, liters: 0, count: 0 } });
          }
        })
        .finally(() => {
          if (!cancelled) setTrendLoading(false);
        });
    } else {
      const trendLoader = period === 'year' ? aggregateBalanceByMonth : aggregateBalanceByDay;
      trendLoader({ stationId, from: from.toISOString(), to: to.toISOString() })
        .then((daily) => {
          if (cancelled) return;
          setTrend(daily);
          const periodRevenue = daily.reduce((s, d) => s + d.revenue, 0);
          const periodLiters  = daily.reduce((s, d) => s + d.liters, 0);
          const periodCount   = daily.reduce((s, d) => s + d.count, 0);
          setPeriodAgg({ current: { revenue: periodRevenue, liters: periodLiters, count: periodCount } });
        })
        .catch(() => { if (!cancelled) { setTrend([]); setPeriodAgg({ current: { revenue: 0, liters: 0, count: 0 } }); } })
        .finally(() => { if (!cancelled) setTrendLoading(false); });
    }
    return () => { cancelled = true; };
  }, [period, stationId]);

  // 2. Tanks — отдельный лёгкий запрос.
  useEffect(() => {
    let cancelled = false;
    setTanksLoading(true);
    getTankStatusesWithBalance({ organizationId: orgId, stationId })
      .then((rows) => { if (!cancelled) setTanks(rows); })
      .catch(() => { if (!cancelled) setTanks([]); })
      .finally(() => { if (!cancelled) setTanksLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, stationId]);

  // 3. Название станции — один маленький запрос, не блокирует ничего.
  useEffect(() => {
    if (!stationId) { setStationName(null); return; }
    let cancelled = false;
    supabase
      .from('stations')
      .select('name, city')
      .eq('id', stationId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setStationName(`${data.name}${data.city ? ` · ${data.city}` : ''}`);
      });
    return () => { cancelled = true; };
  }, [stationId]);

  // 3.5. Получение активной смены для отображения текущей выручки
  useEffect(() => {
    if (!stationId) { setCurrentShift(null); return; }
    let cancelled = false;
    setCurrentShiftLoading(true);
    getCurrentSalesShift({ stationId })
      .then((shift) => {
        if (!cancelled) setCurrentShift(shift);
      })
      .catch(() => {
        if (!cancelled) setCurrentShift(null);
      })
      .finally(() => {
        if (!cancelled) setCurrentShiftLoading(false);
      });
    return () => { cancelled = true; };
  }, [stationId]);

  // 4. Алерты — три параллельных независимых запроса. Каждый шлёт свой
  //    апдейт в общий список, а не ждёт остальных.
  useEffect(() => {
    let cancelled = false;
    const collected = { shifts: 0, requests: 0, collTotal: 0 };

    function rebuild() {
      if (cancelled) return;
      const a = [];
      if (collected.shifts > 0) {
        a.push({ tone: 'warn', icon: ClipboardList,
          title: `Смен на утверждении: ${collected.shifts}`,
          desc: 'Проверьте сверки операторов', to: '/shifts' });
      }
      if (collected.requests > 0) {
        a.push({ tone: 'info', icon: Users,
          title: `Заявок сотрудников: ${collected.requests}`,
          desc: 'Ожидают одобрения', to: '/counterparties?filter=employee' });
      }
      if (collected.collTotal > 0) {
        a.push({ tone: 'info', icon: Wallet,
          title: `Инкассации: ${formatMoney(collected.collTotal)}`,
          desc: 'Ждут подтверждения', to: '/collections' });
      }
      setAlerts(a);
    }

    listPendingShiftReports({}).then((rows) => {
      collected.shifts = rows?.length ?? 0; rebuild();
    }).catch(() => {});

    if (orgId) {
      listEmployees({ organizationId: orgId, status: PROFILE_STATUS.PENDING })
        .then((rows) => { collected.requests = rows?.length ?? 0; rebuild(); })
        .catch(() => {});
    }

    supabase
      .from('cashflow')
      .select('amount')
      .eq('operation_type', 'collection')
      .eq('status', 'pending_confirmation')
      .then(({ data }) => {
        collected.collTotal = (data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
        rebuild();
      });

    return () => { cancelled = true; };
  }, [orgId]);

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
            {period === 'day' && currentShift && (
              <div className="text-xs text-success mt-1 font-bold truncate flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                </span>
                Текущая активная смена #{currentShift.shiftKey}
              </div>
            )}
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
            <Suspense fallback={<ChartSkeleton />}>
              <TrendChart data={trendWithMA} />
            </Suspense>
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

      {/* CHAT WIDGET */}
      <Suspense fallback={null}>
        <DashboardChatCard />
      </Suspense>

      {/* TANKS RESERVOIRS STATUS PANEL */}
      <Card className="!p-4 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl">
        <SectionTitle
          icon={Droplets}
          title="Запасы топлива"
          right={tanks.length > 0 ? `${tanks.length} резервуаров` : ''}
        />
        {tanksLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[0, 1].map((i) => <TankCardSkeleton key={i} />)}
          </div>
        ) : tanks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line/60 p-6 text-center text-xs text-ink-muted">
            Резервуары АЗС пока не добавлены.{' '}
            <Link className="text-brand-400 font-bold hover:underline" to="/tanks">Добавить резервуар</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {tanks.map((t) => (
              <motion.div
                key={t.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="transition-transform duration-250 cursor-pointer"
                onClick={() => navigate(`/tanks/${t.id}`)}
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
            {REPORTS.map((r, idx) => (
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
      </Card>

      {/* TANK QUICK ACTION DIALOG SHEET */}
      <BottomSheet
        open={selectedTank !== null}
        onClose={() => {
          setSelectedTank(null);
          setActiveFormType(null);
        }}
        title={activeFormType ? (
          activeFormType === 'measurement' ? 'Замер резервуара' :
          activeFormType === 'calibration' ? 'Поверка ТРК' : 'Корректировка баланса'
        ) : (
          selectedTank ? `Управление резервуаром №${selectedTank.number}` : 'Управление резервуаром'
        )}
      >
        {selectedTank && (
          <div className="relative overflow-hidden min-h-[220px] pt-1">
            <AnimatePresence mode="wait">
              {activeFormType ? (
                <motion.div
                  key="form-view"
                  initial={{ opacity: 0, x: 28 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -28 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-3 border-b border-dashed border-line/30 dark:border-white/[0.06] pb-3 select-none">
                    <button
                      type="button"
                      onClick={() => setActiveFormType(null)}
                      className="w-8 h-8 rounded-xl bg-bg-elevated/70 border border-line/30 flex items-center justify-center text-ink cursor-pointer hover:bg-bg-elevated"
                    >
                      <ChevronRight className="w-4.5 h-4.5 rotate-180" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] uppercase tracking-[0.22em] text-brand-400 font-extrabold">Быстрый ввод</span>
                      <div className="text-[10px] text-ink-muted mt-0.5 font-bold truncate">
                        {selectedTank.name} · {selectedTank.fuelCode}
                      </div>
                    </div>
                    <Badge tone="brand" className="font-extrabold uppercase text-[8px] tracking-wider px-2.5 py-1">
                      {activeFormType === 'measurement' ? 'Замер' : activeFormType === 'calibration' ? 'Поверка' : 'Коррект.'}
                    </Badge>
                  </div>

                  <div className="pt-1">
                    {activeFormType === 'measurement' && (
                      <TankMeasurementQuickForm
                        defaultTankId={selectedTank.id}
                        defaultFuelType={selectedTank.fuelCode}
                        onDone={handleFormDone}
                        onCancel={() => setActiveFormType(null)}
                      />
                    )}
                    {activeFormType === 'calibration' && (
                      <CalibrationQuickForm
                        defaultFuelType={selectedTank.fuelCode}
                        onDone={handleFormDone}
                        onCancel={() => setActiveFormType(null)}
                      />
                    )}
                    {activeFormType === 'adjustment' && (
                      <TankAdjustmentQuickForm
                        defaultTankId={selectedTank.id}
                        defaultFuelType={selectedTank.fuelCode}
                        onDone={handleFormDone}
                        onCancel={() => setActiveFormType(null)}
                      />
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="actions-view"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  className="space-y-4"
                >
                  {/* Custom Header Info */}
                  <div className="rounded-2xl border border-line/30 bg-bg-elevated/40 p-3.5 flex items-center justify-between">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.22em] text-brand-400 font-extrabold">Топливный резервуар</div>
                      <div className="text-sm font-bold text-ink mt-1">
                        {selectedTank.fuelCode || '—'} · {selectedTank.name || `Резервуар №${selectedTank.number}`}
                      </div>
                    </div>
                    <Badge tone={selectedTank.currentLiters > 0 ? 'success' : 'default'} className="font-extrabold">
                      {selectedTank.currentLiters > 0 ? `${Math.round((selectedTank.currentLiters / selectedTank.capacityLiters) * 100)}%` : '—'}
                    </Badge>
                  </div>

                  {/* Actions Grid */}
                  <div className="grid grid-cols-1 gap-2">
                    {/* Action 1: Внести замер */}
                    <button
                      type="button"
                      onClick={() => setActiveFormType('measurement')}
                      className="flex items-center gap-3.5 rounded-2xl bg-bg-card border border-line/30 p-3.5 hover:border-brand-500/20 hover:bg-bg-soft/40 dark:hover:bg-white/[0.01] transition-all duration-200 shadow-sm relative group cursor-pointer"
                    >
                      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-lg bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-200">
                        <Gauge className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-extrabold text-ink group-hover:text-brand-400 transition-colors">
                          Внести замер резервуара
                        </div>
                        <div className="text-[10px] text-ink-muted font-bold mt-0.5">
                          Ввести уровень (см) или литры текущего остатка
                        </div>
                      </div>
                      <ChevronRight className="w-4.5 h-4.5 text-ink-soft flex-shrink-0 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </button>

                    {/* Action 2: Поверка ТРК */}
                    <button
                      type="button"
                      onClick={() => setActiveFormType('calibration')}
                      className="flex items-center gap-3.5 rounded-2xl bg-bg-card border border-line/30 p-3.5 hover:border-brand-500/20 hover:bg-bg-soft/40 dark:hover:bg-white/[0.01] transition-all duration-200 shadow-sm relative group cursor-pointer"
                    >
                      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-lg bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-200">
                        <Wrench className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-extrabold text-ink group-hover:text-brand-400 transition-colors">
                          Провести поверку ТРК
                        </div>
                        <div className="text-[10px] text-ink-muted font-bold mt-0.5">
                          Зафиксировать технический (мерный) пролив топлива
                        </div>
                      </div>
                      <ChevronRight className="w-4.5 h-4.5 text-ink-soft flex-shrink-0 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </button>

                    {/* Action 3: Корректировка остатка */}
                    <button
                      type="button"
                      onClick={() => setActiveFormType('adjustment')}
                      className="flex items-center gap-3.5 rounded-2xl bg-bg-card border border-line/30 p-3.5 hover:border-brand-500/20 hover:bg-bg-soft/40 dark:hover:bg-white/[0.01] transition-all duration-200 shadow-sm relative group cursor-pointer"
                    >
                      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-lg bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-200">
                        <Receipt className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-extrabold text-ink group-hover:text-brand-400 transition-colors">
                          Корректировка остатка
                        </div>
                        <div className="text-[10px] text-ink-muted font-bold mt-0.5">
                          Списать/начислить разницу для сверки баланса
                        </div>
                      </div>
                      <ChevronRight className="w-4.5 h-4.5 text-ink-soft flex-shrink-0 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </button>

                    {/* Action 4: Подробная история резервуара */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTank(null);
                        navigate(`/tanks/${selectedTank.id}`);
                      }}
                      className="flex items-center gap-3.5 rounded-2xl bg-bg-card border border-line/30 p-3.5 hover:border-brand-500/20 hover:bg-bg-soft/40 dark:hover:bg-white/[0.01] transition-all duration-200 shadow-sm relative group cursor-pointer"
                    >
                      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-lg bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-200">
                        <Building2 className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-extrabold text-ink group-hover:text-brand-400 transition-colors">
                          Открыть подробную карточку
                        </div>
                        <div className="text-[10px] text-ink-muted font-bold mt-0.5">
                          История поставок, замеры, температурные показатели и графики
                        </div>
                      </div>
                      <ChevronRight className="w-4.5 h-4.5 text-ink-soft flex-shrink-0 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ChartSkeleton() {
  return (
    <div className="h-full w-full rounded-2xl bg-bg-elevated/40 border border-line/20 animate-pulse" />
  );
}

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
