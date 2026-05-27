// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Admin dashboard — live KPIs for the assigned station: today's revenue, last fuel supply, latest tank dip, active shift, pending collections.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ClipboardList,
  Droplets,
  Fuel,
  Gauge,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { aggregateForShift } from '@/services/salesService';
import { listLatestBalances } from '@/services/balanceService';
import { listFuelSupply, listTankMeasurements } from '@/services/fuelService';
import { getCurrentOpenShift } from '@/services/shiftService';
import { supabase } from '@/lib/supabaseClient';
import { formatLiters, formatMoney, formatRelative } from '@/lib/formatters';


export default function AdminDashboard() {
  const { user } = useAuth();
  const stationId = user?.profile?.station_id;
  const [state, setState] = useState({
    revenue: 0,
    liters: 0,
    activeShift: null,
    lastSupply: null,
    lastDip: null,
    lastBalance: null,
    pendingCollections: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      try {
        const [sales, supplies, dips, balances, openShift, cf] = await Promise.all([
          aggregateForShift({ stationId, from: today.toISOString(), to: new Date().toISOString() })
            .catch(() => ({ revenue: 0, liters: 0 })),
          listFuelSupply({ stationId, limit: 1 }).catch(() => []),
          listTankMeasurements({ stationId, limit: 1 }).catch(() => []),
          listLatestBalances({ stationId }).catch(() => []),
          getCurrentOpenShift({ stationId }).catch(() => null),
          supabase
            .from('cashflow')
            .select('amount')
            .eq('operation_type', 'collection')
            .eq('status', 'pending_confirmation')
            .eq('station_id', stationId)
            .then(({ data }) => data ?? []),
        ]);

        if (cancelled) return;
        setState({
          revenue: sales.revenue,
          liters: sales.liters,
          activeShift: openShift,
          lastSupply: supplies[0] ?? null,
          lastDip: dips[0] ?? null,
          lastBalance: balances[0] ?? null,
          pendingCollections: cf.reduce((s, r) => s + Number(r.amount ?? 0), 0),
        });
      } catch (err) {
        console.error('Admin dashboard load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [stationId]);

  return (
    <div className="pb-2 space-y-2.5">
      <ScreenHeader
        title="Моя АЗС"
        subtitle="Смены, поставки, замеры и остатки"
        right={
          <Badge tone="info" className="text-[10px]">
            Управляющий
          </Badge>
        }
      />

      {/* Consolidated Station Stats Card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-line/40 bg-bg-card p-3.5 shadow-sm relative overflow-hidden"
      >
        <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-brand-500/5 blur-2xl" />
        
        <div className="relative space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">
              Выручка сегодня
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <div className="text-xl font-bold text-ink">
                {loading ? '…' : formatMoney(state.revenue)}
              </div>
              <div className="text-xs text-ink-muted">
                · {loading ? '…' : formatLiters(state.liters)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line/40 bg-bg-elevated/40 p-2">
              <div className="text-[9px] font-medium text-ink-soft uppercase tracking-wider truncate">Смена</div>
              <div className={`mt-0.5 text-xs font-bold truncate ${state.activeShift ? 'text-success' : 'text-ink-muted'}`}>
                {state.activeShift ? 'Активна' : 'Закрыта'}
              </div>
            </div>
            <div className="rounded-xl border border-line/40 bg-bg-elevated/40 p-2">
              <div className="text-[9px] font-medium text-ink-soft uppercase tracking-wider truncate">Инкассация</div>
              <div className="mt-0.5 text-xs font-bold text-ink truncate">
                {loading ? '…' : formatMoney(state.pendingCollections)}
              </div>
            </div>
            <div className="rounded-xl border border-line/40 bg-bg-elevated/40 p-2">
              <div className="text-[9px] font-medium text-ink-soft uppercase tracking-wider truncate">Замер</div>
              <div className="mt-0.5 text-xs font-bold text-ink truncate">
                {state.lastDip ? 'Есть' : 'Нет'}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Active Shift Banner (if open) */}
      {state.activeShift && (
        <Card className="!p-3 border-info/30 bg-bg-card">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-info/10 border border-info/20 text-info flex items-center justify-center flex-shrink-0">
                <ClipboardList className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ink truncate">Открытая смена</div>
                <div className="text-[10px] text-ink-muted mt-0.5">
                  с {formatRelative(state.activeShift.opened_at)}
                </div>
              </div>
            </div>
            <Link to="/shifts" className="flex-shrink-0">
              <Button size="sm" variant="secondary" className="h-7 text-[10px] px-2.5">
                Открыть
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-2">
        <Kpi
          to="/fuel-supply"
          icon={Fuel}
          label="Поставка топлива"
          value={state.lastSupply ? `${state.lastSupply.fuel_type ?? ''} ${formatLiters(state.lastSupply.liters_actual)}` : '—'}
          hint={state.lastSupply ? formatRelative(state.lastSupply.date) : 'нет поставок'}
        />
        <Kpi
          to="/tank-measurements"
          icon={Gauge}
          label="Последний замер"
          value={state.lastDip ? formatLiters(state.lastDip.liters ?? state.lastDip.level_cm) : '—'}
          hint={state.lastDip ? formatRelative(state.lastDip.date) : 'нет замеров'}
        />
        <Kpi
          to="/fuel-balances"
          icon={Droplets}
          label="Системный остаток"
          value={state.lastBalance ? formatLiters(state.lastBalance.liters) : '—'}
          hint={state.lastBalance?.fuel_name ?? 'остатки по видам'}
        />
        <Kpi
          to="/collections"
          icon={Wallet}
          label="Инкассации"
          value={loading ? '…' : formatMoney(state.pendingCollections)}
          hint="на подтверждение"
          tone="warn"
        />
      </div>


      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Link to="/shifts">
          <Card hoverable className="!p-2 text-center border-line/40 bg-bg-card h-full flex flex-col justify-center items-center">
            <ClipboardList className="w-4 h-4 text-brand-400 mb-1" />
            <span className="text-[10px] font-semibold text-ink">Смены</span>
          </Card>
        </Link>
        <Link to="/sales">
          <Card hoverable className="!p-2 text-center border-line/40 bg-bg-card h-full flex flex-col justify-center items-center">
            <TrendingUp className="w-4 h-4 text-brand-400 mb-1" />
            <span className="text-[10px] font-semibold text-ink">Продажи</span>
          </Card>
        </Link>
        <Link to="/calibrations">
          <Card hoverable className="!p-2 text-center border-line/40 bg-bg-card h-full flex flex-col justify-center items-center">
            <Gauge className="w-4 h-4 text-brand-400 mb-1" />
            <span className="text-[10px] font-semibold text-ink">Поверки</span>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function Kpi({ to, icon: Icon, label, value, hint, tone }) {
  const ring = tone === 'warn' ? 'border-warning/30 hover:border-warning/50' : 'border-line/40 hover:border-brand-500/50';
  const iconCls = tone === 'warn'
    ? 'bg-warning/10 border-warning/20 text-warning'
    : 'bg-brand-500/10 border-brand-500/20 text-brand-400';

  return (
    <Link to={to} className="block">
      <motion.div
        whileTap={{ scale: 0.98 }}
        className={`relative rounded-xl p-3 bg-bg-card border ${ring} transition-all duration-200 h-full flex flex-col justify-between`}
      >
        <div className="flex items-start justify-between gap-1.5">
          <span className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider truncate">
            {label}
          </span>
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${iconCls}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-3.5">
          <span className="text-sm font-bold text-ink truncate block">{value}</span>
          {hint && <span className="text-[10px] text-ink-muted truncate block mt-0.5">{hint}</span>}
        </div>
        <ArrowUpRight className="absolute bottom-3 right-3 w-3.5 h-3.5 text-ink-soft" />
      </motion.div>
    </Link>
  );
}
