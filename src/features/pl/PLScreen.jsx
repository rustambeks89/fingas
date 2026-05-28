// [UPDATED BY ANTIGRAVITY CLI - 2026-05-28]
// Project: Fingas
// Purpose: P&L Screen — Ultra-premium financial statement sheet (AinurPOS premium style)
// Illustrates COGS, OPEX, EBITDA, Taxes, Net Profit, and Margins with gorgeous waterfall bars.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Download,
  TrendingDown,
  TrendingUp,
  Percent,
  Sparkles,
  Layers,
  Activity,
  Calculator,
  ShieldCheck,
  Fuel,
  Coins,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabaseClient';
import { computeFifoCost } from '@/services/salesService';
import { aggregateBalanceByDay, aggregateBalanceByMonth } from '@/services/shiftService';
import { listFuelSupply } from '@/services/fuelService';
import { listTaxes } from '@/services/taxService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatMoney, formatPercent } from '@/lib/formatters';
import { downloadCSV, todayStamp } from '@/lib/exporters';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

const PERIODS = [
  { id: '7d',  label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: 'mtd', label: 'Месяц' },
  { id: 'ytd', label: 'Год' },
];

function periodRange(id) {
  const now = new Date();
  const to = new Date(now);
  let from;
  if (id === '7d') from = new Date(now.getTime() - 7 * 86400000);
  else if (id === '30d') from = new Date(now.getTime() - 30 * 86400000);
  else if (id === 'mtd') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (id === 'ytd') from = new Date(now.getFullYear(), 0, 1);
  return { from, to };
}

export default function PLScreen() {
  const { user } = useAuth();
  const { canExport } = usePermissions();
  const stationId = user?.profile?.station_id;
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState({
    revenue: 0, liters: 0, cost: 0, expenses: 0, salaries: 0, taxes: 0,
  });
  const [costMode, setCostMode] = useState('fifo');
  const [fuelBreakdown, setFuelBreakdown] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const { from, to } = periodRange(period);
      const fromISO = from.toISOString();
      const toISO = to.toISOString();
      const localYMD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const fromDate = localYMD(from);
      const toDate = localYMD(to);

      const dayAgg = await aggregateBalanceByDay({
        stationId,
        from: fromISO,
        to: toISO,
      }).catch(() => []);
      const balanceRevenue = dayAgg.reduce((sum, day) => sum + Number(day.revenue ?? 0), 0);
      const balanceLiters = dayAgg.reduce((sum, day) => sum + Number(day.liters ?? 0), 0);

      const supplies = await listFuelSupply({ stationId, limit: 1000 }).catch(() => []);
      const flatCost = supplies
        .filter((s) => s.date >= fromDate && s.date <= toDate)
        .reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

      const fifo = await computeFifoCost({
        stationId, from: fromDate, to: toDate,
      }).catch(() => ({ total: 0, byFuel: {} }));

      const cost = fifo.total > 0 ? fifo.total : flatCost;
      const mode = fifo.total > 0 ? 'fifo' : 'flat';

      const fuelBd = Object.entries(fifo.byFuel ?? {})
        .map(([fuel, v]) => ({
          fuel,
          sold_liters: v.sold_liters,
          cost: v.cost,
          avg_cost: v.sold_liters > 0 ? v.cost / v.sold_liters : 0,
        }))
        .sort((a, b) => b.cost - a.cost);

      const { data: cf } = await supabase
        .from('cashflow')
        .select('operation_type, amount, date')
        .gte('date', fromDate)
        .lte('date', toDate);
      let expenses = 0, salaries = 0;
      for (const r of cf ?? []) {
        const amt = Number(r.amount ?? 0);
        if (r.operation_type === 'salary') salaries += amt;
        else if (['expense', 'supplier_payment'].includes(r.operation_type)) expenses += amt;
      }

      const taxList = await listTaxes({ limit: 1000 }).catch(() => []);
      const taxes = taxList
        .filter((t) => t.payment_date >= fromDate && t.payment_date <= toDate)
        .reduce((s, t) => s + Number(t.amount ?? 0), 0);

      setData({ revenue: balanceRevenue, liters: balanceLiters, cost, expenses, salaries, taxes });
      setCostMode(mode);
      setFuelBreakdown(fuelBd);

      const now = new Date();
      const fromY = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const monthlyAgg = await aggregateBalanceByMonth({
        stationId,
        from: fromY.toISOString(),
        to: now.toISOString(),
      }).catch(() => []);
      const monthsMap = {};
      for (let i = 0; i < 12; i++) {
        const d = new Date(fromY.getFullYear(), fromY.getMonth() + i, 1);
        const k = d.toISOString().slice(0, 7);
        monthsMap[k] = {
          month: d.toLocaleDateString('ru-RU', { month: 'short' }),
          revenue: 0, cost: 0, expenses: 0,
        };
      }
      for (const m of monthlyAgg) {
        const k = m.day.slice(0, 7);
        if (monthsMap[k]) monthsMap[k].revenue = Number(m.revenue ?? 0);
      }
      for (const s of supplies) {
        const k = String(s.date).slice(0, 7);
        if (monthsMap[k]) monthsMap[k].cost += Number(s.total_amount ?? 0);
      }
      for (const c of cf ?? []) {
        const k = String(c.date).slice(0, 7);
        if (monthsMap[k]) {
          const amt = Number(c.amount ?? 0);
          if (['expense', 'supplier_payment', 'salary', 'tax'].includes(c.operation_type)) {
            monthsMap[k].expenses += amt;
          }
        }
      }
      const series = Object.values(monthsMap).map((m) => ({
        ...m,
        net: m.revenue - m.cost - m.expenses,
      }));
      setMonthly(series);
    } catch (e) {
      setErr(e?.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [period, stationId]);

  useEffect(() => { load(); }, [load]);

  // Финансовые расчеты P&L
  const gross = data.revenue - data.cost;
  const opex = data.salaries + data.expenses; // Только операционные расходы (зарплаты + прочие)
  const ebitda = gross - opex; // EBITDA
  const net = ebitda - data.taxes; // Чистая прибыль (EBITDA минус налоги)

  // Рентабельность
  const grossMargin = data.revenue > 0 ? (gross / data.revenue) * 100 : 0;
  const ebitdaMargin = data.revenue > 0 ? (ebitda / data.revenue) * 100 : 0;
  const netMargin = data.revenue > 0 ? (net / data.revenue) * 100 : 0;

  const breakdownRows = useMemo(() => [
    { label: 'Выручка (Revenue)', value: data.revenue },
    { label: 'Себестоимость топлива (COGS)', value: -data.cost },
    { label: 'Валовая прибыль (Gross Profit)', value: gross },
    { label: 'Операционные расходы (OPEX)', value: -opex },
    { label: '  Зарплата', value: -data.salaries },
    { label: '  Прочие расходы', value: -data.expenses },
    { label: 'EBITDA', value: ebitda },
    { label: 'Налоги (Taxes)', value: -data.taxes },
    { label: 'Чистая прибыль (Net Profit)', value: net },
  ], [data, gross, opex, ebitda, net]);

  function exportPL() {
    downloadCSV(`pl-${period}-${todayStamp()}`, breakdownRows, [
      { key: 'label', label: 'Статья' },
      { key: 'value', label: 'Сумма' },
    ]);
  }

  return (
    <PullToRefresh onRefresh={load}>
      <div className="space-y-4 pb-4">
        <ScreenHeader
          title="P&L"
          subtitle="Отчёт о прибылях и убытках"
          right={canExport(MODULES.PL) ? (
            <Button size="sm" variant="secondary" onClick={exportPL} className="h-10 w-10 p-0 flex items-center justify-center rounded-xl bg-bg-card border border-line/30">
              <Download className="w-4 h-4 text-ink-muted" />
            </Button>
          ) : null}
        />

        {/* Spacious period filter bar */}
        <div className="flex gap-1.5 p-1 rounded-2xl bg-bg-card/70 border border-line/30 shadow-inner overflow-x-auto no-scrollbar">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={
                'flex-shrink-0 px-4 h-8 rounded-xl text-xs font-black transition-all cursor-pointer ' +
                (period === p.id
                  ? 'bg-gradient-to-r from-brand-400 to-brand-500 text-white shadow-glow'
                  : 'bg-transparent text-ink-soft hover:text-ink-muted')
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        {err && <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">{err}</div>}

        {/* 1. HERO CARD: Stacked Progressive Waterfall Visual of Revenue Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-3xl p-5 border relative overflow-hidden backdrop-blur-2xl transition-all duration-300 ${
            net >= 0
              ? 'border-success/20 bg-gradient-to-br from-success/15 via-bg-card/95 to-bg-card shadow-card'
              : 'border-danger/20 bg-gradient-to-br from-danger/15 via-bg-card/95 to-bg-card shadow-card'
          }`}
        >
          <div className="absolute -top-24 -right-24 w-44 h-44 rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />

          <div className="relative">
            <span className="text-[9px] uppercase tracking-[0.2em] text-ink-soft font-black flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-400" />
              Чистая прибыль за период
            </span>
            <div className={`text-3xl font-extrabold mt-2 tracking-tight tabular-nums ${net >= 0 ? 'text-success' : 'text-danger'}`}>
              {net >= 0 ? '+' : '−'}{formatMoney(Math.abs(net))}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-ink-soft">
              {net >= 0 ? <TrendingUp className="w-4 h-4 text-success flex-shrink-0" /> : <TrendingDown className="w-4 h-4 text-danger flex-shrink-0" />}
              Рентабельность чистой прибыли: <span className={net >= 0 ? 'text-success' : 'text-danger'}>{formatPercent(netMargin)}</span>
            </div>

            {/* Illustrative Horizontal Flow Bar Stacked Progress */}
            <div className="mt-6 space-y-3.5">
              <span className="text-[9px] uppercase tracking-wider text-ink-soft font-black block">Финансовый поток (Структура Выручки):</span>
              
              {/* Dynamic Stacked Bar Progress indicators */}
              <div className="space-y-2.5 pt-1">
                {/* 1. Выручка */}
                <FlowBar
                  label="1. Выручка АЗС"
                  value={data.revenue}
                  percent={100}
                  colorClass="bg-gradient-to-r from-blue-400 to-indigo-400"
                  icon={Coins}
                  loading={loading}
                />

                {/* 2. COGS (Себестоимость топлива) */}
                <FlowBar
                  label="2. Себестоимость топлива (COGS)"
                  value={data.cost}
                  percent={data.revenue > 0 ? (data.cost / data.revenue) * 100 : 0}
                  colorClass="bg-gradient-to-r from-orange-400 to-amber-500"
                  icon={Fuel}
                  negative
                  loading={loading}
                />

                {/* 3. Валовая прибыль */}
                <FlowBar
                  label="3. Валовая прибыль"
                  value={gross}
                  percent={grossMargin}
                  colorClass="bg-gradient-to-r from-emerald-400 to-teal-400"
                  icon={Activity}
                  rightHint={`Маржа ${formatPercent(grossMargin)}`}
                  loading={loading}
                />

                {/* 4. OPEX (Операционные расходы: зарплата + аренда + прочие) */}
                <FlowBar
                  label="4. Операционные расходы (OPEX)"
                  value={opex}
                  percent={data.revenue > 0 ? (opex / data.revenue) * 100 : 0}
                  colorClass="bg-gradient-to-r from-rose-400 to-pink-500"
                  icon={Layers}
                  negative
                  loading={loading}
                />

                {/* 5. EBITDA */}
                <FlowBar
                  label="5. Операционная прибыль (EBITDA)"
                  value={ebitda}
                  percent={ebitdaMargin}
                  colorClass="bg-gradient-to-r from-brand-400 to-brand-500"
                  icon={Calculator}
                  rightHint={`Маржа ${formatPercent(ebitdaMargin)}`}
                  loading={loading}
                />

                {/* 6. Налоги */}
                <FlowBar
                  label="6. Налоги за период"
                  value={data.taxes}
                  percent={data.revenue > 0 ? (data.taxes / data.revenue) * 100 : 0}
                  colorClass="bg-gradient-to-r from-red-400 to-rose-500"
                  icon={ShieldCheck}
                  negative
                  loading={loading}
                />

                {/* 7. Чистая прибыль */}
                <FlowBar
                  label="7. Чистая прибыль (Net Profit)"
                  value={net}
                  percent={netMargin}
                  colorClass={net >= 0 ? "bg-gradient-to-r from-success to-emerald-400 shadow-glow" : "bg-gradient-to-r from-danger to-rose-400"}
                  icon={DollarSign}
                  rightHint={`Рентабельность ${formatPercent(netMargin)}`}
                  loading={loading}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* 2. KPI Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <KpiCard icon={Coins} label="Выручка АЗС" value={formatMoney(data.revenue)} tone="brand" />
          <KpiCard icon={Layers} label="Всего расходов" value={formatMoney(data.cost + opex + data.taxes)} tone="danger" />
          <KpiCard icon={Calculator} label="EBITDA Маржа" value={formatPercent(ebitdaMargin)} tone="success" />
          <KpiCard icon={Percent} label="Чистая рентаб." value={formatPercent(netMargin)} tone={net >= 0 ? 'success' : 'danger'} />
        </div>

        {/* 3. Detailed CFO P&L Statement Sheet */}
        <Card className="p-4 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl space-y-3.5">
          <div className="border-b border-line/20 pb-2 flex items-center justify-between">
            <div>
              <span className="text-xs font-black text-ink uppercase tracking-wider block">Детализированный P&L Отчет</span>
              <span className="text-[10px] text-ink-soft block mt-0.5">Классификация доходов и расходов в сом</span>
            </div>
            <Badge tone="default">CFO Sheet</Badge>
          </div>

          <div className="space-y-2.5">
            {/* Доходы */}
            <div className="text-[9px] uppercase tracking-widest text-brand-400 font-black pl-1 mt-1">Доходы</div>
            <PLRow label="Выручка от продаж топлива" value={data.revenue} loading={loading} />
            <PLRow label="Себестоимость проданного топлива (COGS)" value={-data.cost} loading={loading} negative />

            <Divider />
            <PLRow label="Валовая прибыль (Gross Profit)" value={gross} loading={loading} bold rightHint={formatPercent(grossMargin)} />
            <Divider />

            {/* Операционные Расходы */}
            <div className="text-[9px] uppercase tracking-widest text-pink-400 font-black pl-1 mt-1">Операционные Расходы (OPEX)</div>
            <PLRow label="Начисления заработных плат сотрудникам" value={-data.salaries} loading={loading} negative />
            <PLRow label="Прочие операционные расходы" value={-data.expenses} loading={loading} negative />

            <Divider />
            <PLRow label="EBITDA (Прибыль до налогов и амортизации)" value={ebitda} loading={loading} bold rightHint={formatPercent(ebitdaMargin)} />
            <Divider />

            {/* Налоги */}
            <div className="text-[9px] uppercase tracking-widest text-orange-400 font-black pl-1 mt-1">Налоги и Финансы</div>
            <PLRow label="Налоги и обязательные платежи" value={-data.taxes} loading={loading} negative />

            <Divider />
            <PLRow label="Чистая прибыль (Net Profit)" value={net} loading={loading} bold highlight={net >= 0 ? 'success' : 'danger'} rightHint={formatPercent(netMargin)} />
          </div>
        </Card>

        {/* 4. Sales Litres & Margin per Litre */}
        <div className="grid grid-cols-2 gap-3">
          <Card hoverable className="p-4 shadow-sm border border-line/30 bg-bg-card">
            <span className="text-[9px] uppercase tracking-wider text-ink-soft font-black block">Продано литров топлива</span>
            <div className="text-base font-extrabold text-ink mt-1.5 tabular-nums">
              {loading ? '…' : `${Math.round(data.liters ?? 0).toLocaleString('ru-RU')} л`}
            </div>
          </Card>
          <Card hoverable className="p-4 shadow-sm border border-line/30 bg-bg-card">
            <span className="text-[9px] uppercase tracking-wider text-ink-soft font-black block">Валовая маржа с литра</span>
            <div className="text-base font-extrabold text-ink mt-1.5 tabular-nums">
              {loading || !data.liters ? '—' : formatMoney(gross / data.liters, 'сом/л')}
            </div>
          </Card>
        </div>

        {/* 5. Fuel Type Margins */}
        {fuelBreakdown.length > 0 && (
          <Card className="p-4 shadow-card border border-line/30 bg-bg-card/75 space-y-3.5">
            <div>
              <span className="text-xs font-black text-ink uppercase tracking-wider block">Маржинальность по сортам топлива</span>
              <span className="text-[10px] text-ink-soft block mt-0.5">Оценка себестоимости по методу {costMode === 'fifo' ? 'FIFO' : 'по среднему'}</span>
            </div>
            <div className="space-y-2 pt-1">
              {fuelBreakdown.map((f) => {
                const fuelRevenueShare = data.cost > 0 ? f.cost / data.cost : 0;
                const fuelRevenue = data.revenue * fuelRevenueShare;
                const fuelMargin = fuelRevenue - f.cost;
                const perLiter = f.sold_liters > 0 ? fuelMargin / f.sold_liters : 0;
                return (
                  <div key={f.fuel} className="rounded-2xl bg-bg-elevated/30 border border-line/30 px-3.5 py-2.5 flex items-center justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-ink truncate">{f.fuel || '—'}</div>
                      <div className="text-[10px] text-ink-soft mt-0.5 truncate">
                        {Math.round(f.sold_liters).toLocaleString('ru-RU')} л · себест. {formatMoney(f.avg_cost, 'сом/л')}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={'text-xs font-black ' + (perLiter >= 0 ? 'text-success' : 'text-danger')}>
                        {formatMoney(perLiter, 'сом/л')}
                      </div>
                      <span className="text-[9px] text-ink-soft block mt-0.5">чистая маржа/л</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* 6. Dynamic 12 Month Trend Area Chart */}
        <Card className="p-4 shadow-card border border-line/30 bg-bg-card/75 space-y-3">
          <div className="flex items-center justify-between border-b border-line/20 pb-2">
            <div>
              <span className="text-xs font-black text-ink uppercase tracking-wider block">Аналитика 12 месяцев</span>
              <span className="text-[10px] text-ink-soft block mt-0.5">Финансовые потоки по отчетным периодам</span>
            </div>
          </div>
          <div className="h-44 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 8, right: 0, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradPL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="profitGradPL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.06)" vertical={false} />
                <XAxis dataKey="month" stroke="rgba(148, 163, 184, 0.4)" fontSize={9} fontWeight={600} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(148, 163, 184, 0.4)" fontSize={9} fontWeight={600} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}к` : v} />
                <Tooltip
                  cursor={{ stroke: 'rgba(255, 255, 255, 0.05)', strokeWidth: 1 }}
                  contentStyle={{ background: 'rgba(18, 24, 37, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, fontSize: 11 }}
                  formatter={(v) => [formatMoney(v), '']}
                />
                <Area type="monotone" dataKey="revenue" name="Выручка" stroke="#3B82F6" strokeWidth={2} fill="url(#revenueGradPL)" />
                <Area type="monotone" dataKey="net" name="Чистая Прибыль" stroke="#10B981" strokeWidth={2.5} fill="url(#profitGradPL)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </PullToRefresh>
  );
}

// Illustrative Horizontal Flow Bar representing P&L components
function FlowBar({ label, value, percent, colorClass, icon: Icon, negative = false, rightHint, loading }) {
  const displayPercent = Math.max(2, Math.min(100, Math.abs(percent)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] gap-2 min-w-0">
        <span className="text-ink-muted font-bold flex items-center gap-1 truncate">
          <Icon className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />
          {label}
        </span>
        <span className="text-right flex-shrink-0 font-bold tabular-nums">
          <span className={negative ? 'text-danger' : 'text-ink'}>
            {loading ? '…' : (negative && value > 0 ? '−' : '') + formatMoney(Math.abs(value))}
          </span>
          {rightHint && <span className="text-[9px] text-ink-soft font-normal ml-1.5">({rightHint})</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-bg-elevated/75 dark:bg-black/35 overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: loading ? '0%' : `${displayPercent}%` }}
        />
      </div>
    </div>
  );
}

// Detailed row in statement
function PLRow({ label, value, loading, bold = false, negative = false, highlight, rightHint }) {
  const valColor =
    highlight === 'success' ? 'text-success font-black text-sm' :
    highlight === 'danger' ? 'text-danger font-black text-sm' :
    bold ? 'text-ink font-black' :
    negative ? 'text-danger font-bold' : 'text-ink font-bold';

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg-elevated/30 border border-line/20 px-3.5 py-2.5 min-w-0 hover:bg-bg-elevated/55 transition-colors">
      <div className={'text-xs ' + (bold ? 'text-ink font-extrabold' : 'text-ink-soft font-bold')}>{label}</div>
      <div className="text-right flex-shrink-0">
        <div className={`text-xs tabular-nums ${valColor}`}>
          {loading ? '…' : (value < 0 ? '−' : '') + formatMoney(Math.abs(value))}
        </div>
        {rightHint && <div className="text-[9px] text-ink-soft mt-0.5 font-bold">Рентабельность: {rightHint}</div>}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-line/25" />;
}

// Visual Premium KpiCard
function KpiCard({ icon: Icon, label, value, tone }) {
  const colour =
    tone === 'success' ? 'text-success' :
    tone === 'danger' ? 'text-danger' :
    tone === 'muted' ? 'text-ink-soft' : 'text-brand-500';
  const bg =
    tone === 'success' ? 'bg-success/5 border-success/15' :
    tone === 'danger' ? 'bg-danger/5 border-danger/15' : 'bg-brand-500/5 border-brand-500/15';

  return (
    <div className={`rounded-2xl border p-3 flex flex-col justify-between h-full bg-bg-card ${bg}`}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[9px] uppercase tracking-wider text-ink-soft font-bold truncate">{label}</span>
        <Icon className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />
      </div>
      <div className={`text-sm font-black mt-2 tabular-nums ${colour}`}>{value}</div>
    </div>
  );
}
