// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: P&L page — Clean, high-end Stripe/Ramp CFO statement sheet.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, TrendingDown, TrendingUp } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabaseClient';
import { aggregateForShift, computeFifoCost } from '@/services/salesService';
import { listFuelSupply } from '@/services/fuelService';
import { listTaxes } from '@/services/taxService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatMoney, formatPercent } from '@/lib/formatters';
import { downloadCSV, todayStamp } from '@/lib/exporters';

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
      const fromDate = from.toISOString().slice(0, 10);
      const toDate = to.toISOString().slice(0, 10);

      const sales = await aggregateForShift({
        stationId,
        from: fromISO,
        to: toISO,
      }).catch(() => ({ revenue: 0, liters: 0 }));

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

      setData({ revenue: sales.revenue, liters: sales.liters, cost, expenses, salaries, taxes });
      setCostMode(mode);
      setFuelBreakdown(fuelBd);

      const now = new Date();
      const fromY = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const series12Sales = await aggregateForShift({
        stationId,
        from: fromY.toISOString(),
        to: now.toISOString(),
      }).catch(() => ({ rows: [] }));
      const monthsMap = {};
      for (let i = 0; i < 12; i++) {
        const d = new Date(fromY.getFullYear(), fromY.getMonth() + i, 1);
        const k = d.toISOString().slice(0, 7);
        monthsMap[k] = {
          month: d.toLocaleDateString('ru-RU', { month: 'short' }),
          revenue: 0, cost: 0, expenses: 0,
        };
      }
      for (const r of series12Sales.rows ?? []) {
        const dt = r.TransactionDatetime ?? r.transaction_datetime;
        if (!dt) continue;
        const k = String(dt).slice(0, 7);
        if (monthsMap[k]) monthsMap[k].revenue += Number(r.ShopCost ?? r.shop_cost ?? 0);
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

  const gross = data.revenue - data.cost;
  const opex = data.expenses + data.salaries + data.taxes;
  const net = gross - opex;
  const grossMargin = data.revenue > 0 ? (gross / data.revenue) * 100 : 0;
  const netMargin = data.revenue > 0 ? (net / data.revenue) * 100 : 0;

  const breakdownRows = useMemo(() => [
    { label: 'Выручка', value: data.revenue },
    { label: 'Себестоимость топлива', value: -data.cost },
    { label: 'Валовая прибыль', value: gross },
    { label: 'Зарплата', value: -data.salaries },
    { label: 'Прочие расходы', value: -data.expenses },
    { label: 'Налоги', value: -data.taxes },
    { label: 'Чистая прибыль', value: net },
  ], [data, gross, net]);

  function exportPL() {
    downloadCSV(`pl-${period}-${todayStamp()}`, breakdownRows, [
      { key: 'label', label: 'Статья' },
      { key: 'value', label: 'Сумма' },
    ]);
  }

  function exportMonthly() {
    downloadCSV(`pl-monthly-${todayStamp()}`, monthly, [
      { key: 'month', label: 'Месяц' },
      { key: 'revenue', label: 'Выручка' },
      { key: 'cost', label: 'Себестоимость' },
      { key: 'expenses', label: 'Расходы' },
      { key: 'net', label: 'Чистая' },
    ]);
  }

  return (
    <div className="space-y-4 pb-2">
      <ScreenHeader
        title="Прибыли и убытки"
        subtitle="Отчёт о прибылях и убытках"
        right={canExport(MODULES.PL) ? (
          <Button size="sm" variant="secondary" onClick={exportPL} className="h-9 w-9 p-0 flex items-center justify-center rounded-xl">
            <Download className="w-4 h-4" />
          </Button>
        ) : null}
      />

      {/* Spacious filter bar */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-bg-card/90 border border-line/30 shadow-sm overflow-x-auto no-scrollbar">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={
              'flex-shrink-0 px-4 h-8 rounded-xl text-xs font-semibold transition-all ' +
              (period === p.id
                ? 'bg-brand-500 text-white shadow-sm font-bold'
                : 'bg-bg-card/40 text-ink-muted border border-transparent hover:text-ink')
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {err && <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">{err}</div>}

      {/* Modern Net Profit Card - Stripe Inspired */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={
          'relative overflow-hidden rounded-3xl p-5 border shadow-sm ' +
          (net >= 0 
            ? 'border-success/30 bg-gradient-to-br from-success/10 via-success/5 to-bg-card' 
            : 'border-danger/30 bg-gradient-to-br from-danger/10 via-danger/5 to-bg-card')
        }
      >
        <div className="relative">
          <span className="text-[10px] uppercase tracking-wider text-ink-soft font-bold">Чистая прибыль за период</span>
          <div className="text-3xl font-bold text-ink mt-1 tracking-tight font-display tabular-nums">
            {loading ? '…' : formatMoney(net)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
            {net >= 0 ? <TrendingUp className="w-4 h-4 text-success flex-shrink-0" /> : <TrendingDown className="w-4 h-4 text-danger flex-shrink-0" />}
            <span className="text-ink-soft">
              Рентабельность: <span className={net >= 0 ? 'text-success' : 'text-danger'}>{formatPercent(netMargin)}</span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5 mt-4">
            <KpiCard label="Выручка" value={formatMoney(data.revenue)} tone="brand" />
            <KpiCard label="Себестоимость" value={formatMoney(data.cost)} tone="muted" />
            <KpiCard label="Операционные" value={formatMoney(opex)} tone={net >= 0 ? 'success' : 'danger'} />
          </div>
        </div>
      </motion.div>

      {/* Composition breakdown table */}
      <Card className="p-4 shadow-sm space-y-3">
        <div className="border-b border-line/20 pb-2">
          <span className="text-xs font-bold text-ink uppercase tracking-wider block">Финансовый результат</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">Операционные показатели в сом</span>
        </div>
        <Row label="Выручка" value={data.revenue} loading={loading} />
        <Row label="Себестоимость топлива" value={-data.cost} loading={loading} />
        <Divider />
        <Row label="Валовая прибыль" value={gross} loading={loading} bold rightHint={formatPercent(grossMargin)} />
        <Divider />
        <Row label="Зарплата" value={-data.salaries} loading={loading} />
        <Row label="Прочие расходы" value={-data.expenses} loading={loading} />
        <Row label="Налоги" value={-data.taxes} loading={loading} />
        <Divider />
        <Row label="Чистая прибыль" value={net} loading={loading} bold />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card hoverable className="p-4 shadow-sm">
          <span className="text-[9px] uppercase tracking-wider text-ink-soft font-bold block">Продано литров</span>
          <div className="text-base font-bold text-ink mt-1.5 tabular-nums">
            {loading ? '…' : `${(data.liters ?? 0).toLocaleString('ru-RU')} л`}
          </div>
        </Card>
        <Card hoverable className="p-4 shadow-sm">
          <span className="text-[9px] uppercase tracking-wider text-ink-soft font-bold block">Маржа с литра</span>
          <div className="text-base font-bold text-ink mt-1.5 tabular-nums">
            {loading || !data.liters ? '—' : formatMoney(gross / data.liters, 'сом/л')}
          </div>
        </Card>
      </div>

      {/* Fuel Margins */}
      {fuelBreakdown.length > 0 && (
        <Card className="p-4 shadow-sm space-y-3.5">
          <div>
            <span className="text-xs font-bold text-ink uppercase tracking-wider block">Маржинальность по топливу</span>
            <span className="text-[10px] text-ink-soft block mt-0.5">Расчет по методу {costMode === 'fifo' ? 'FIFO' : 'по среднему'}</span>
          </div>
          <div className="space-y-2 pt-1">
            {fuelBreakdown.map((f) => {
              const fuelRevenueShare = data.cost > 0 ? f.cost / data.cost : 0;
              const fuelRevenue = data.revenue * fuelRevenueShare;
              const fuelMargin = fuelRevenue - f.cost;
              const perLiter = f.sold_liters > 0 ? fuelMargin / f.sold_liters : 0;
              return (
                <div key={f.fuel} className="rounded-2xl bg-bg-elevated/40 border border-line/30 px-3.5 py-3 flex items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-ink truncate">{f.fuel || '—'}</div>
                    <div className="text-[10px] text-ink-soft mt-0.5 truncate">
                      {Math.round(f.sold_liters).toLocaleString('ru-RU')} л · себест. {formatMoney(f.avg_cost, 'сом/л')}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={'text-xs font-bold ' + (perLiter >= 0 ? 'text-success' : 'text-danger')}>
                      {formatMoney(perLiter, 'сом/л')}
                    </div>
                    <span className="text-[9px] text-ink-soft block mt-0.5">маржа/л</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Monthly chart in Crimson/Blue */}
      <Card className="p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-line/20 pb-2">
          <div>
            <span className="text-xs font-bold text-ink uppercase tracking-wider block">Аналитика 12 месяцев</span>
            <span className="text-[10px] text-ink-soft block mt-0.5">Выручка и результаты по месяцам</span>
          </div>
          {canExport(MODULES.PL) && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 flex items-center justify-center rounded-xl" onClick={exportMonthly}>
              <Download className="w-3.5 h-3.5 text-ink-soft" />
            </Button>
          )}
        </div>
        <div className="h-56 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 0, left: -22, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" vertical={false} />
              <XAxis dataKey="month" stroke="rgba(148, 163, 184, 0.4)" fontSize={9} />
              <YAxis stroke="rgba(148, 163, 184, 0.4)" fontSize={9} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}к` : v} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                contentStyle={{ background: 'rgba(8, 14, 28, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, fontSize: 11 }}
                formatter={(v) => formatMoney(v)}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              <Bar dataKey="revenue" name="Выручка" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cost" name="Себест." fill="#64748B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" name="Прибыль" fill="#E11D48" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, loading, bold = false, rightHint }) {
  const negative = value < 0;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg-elevated/40 border border-line/30 px-3.5 py-2.5 min-w-0">
      <div className={'text-xs ' + (bold ? 'text-ink font-bold' : 'text-ink-soft')}>{label}</div>
      <div className="text-right flex-shrink-0">
        <div className={
          (bold ? 'text-xs font-bold ' : 'text-xs font-bold ') +
          (loading ? 'text-ink-soft' : negative ? 'text-danger' : 'text-ink')
        }>
          {loading ? '…' : (negative ? '−' : '') + formatMoney(Math.abs(value))}
        </div>
        {rightHint && <div className="text-[10px] text-ink-soft mt-0.5">{rightHint}</div>}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-line/20" />;
}

// Minimal KpiCard
function KpiCard({ label, value, tone }) {
  const colour =
    tone === 'success' ? 'text-success' :
    tone === 'danger' ? 'text-danger' :
    tone === 'muted' ? 'text-ink-soft' : 'text-brand-500';
  return (
    <div className="rounded-2xl bg-bg-elevated/70 border border-line/30 p-2.5">
      <span className="text-[9px] uppercase tracking-wider text-ink-soft font-bold block">{label}</span>
      <div className={`text-[11px] font-bold mt-0.5 ${colour}`}>{value}</div>
    </div>
  );
}
