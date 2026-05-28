// [UPDATED BY ANTIGRAVITY CLI - 2026-05-26]
// Project: Fingas
// Purpose: Финансы — Stripe-style роскошный, темонезависимый финансовый отчет и
// книга движения денежных средств (CFO ledger) в премиум-логике AinurPOS:
//   1. Header (заголовок + экспорт)
//   2. Капсюльный переключатель периодов с скользящим Framer Motion
//   3. Роскошный баннер валового денежного потока за период (Net Cash Flow) с Glowing AreaChart
//   4. Текущие остатки кошельков с элегантными скруглениями
//   5. Графики поступлений и статей расходов с неоновыми шкалами
//   6. Долги перед контрагентами с индикаторами
//   7. История операций (Ledger list) с парящими интерактивными OpRow чеками
// Все расчеты, вызовы Supabase, RLS, удаление с синхронизацией и фильтрации сохранены на 100% в исходном виде.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Download,
  Pencil,
  Repeat,
  Sparkles,
  Trash2,
  Wallet,
  Calendar,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { deleteCashflowWithSync, listCashflow, listWallets, updateCashflow } from '@/services/cashflowService';
import { Input, Select } from '@/components/ui/Input';
import { listCounterparties } from '@/services/counterpartyService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/formatters';
import { downloadCSV, todayStamp } from '@/lib/exporters';

const POSITIVE_OPS = new Set(['income', 'collection', 'owner_contribution']);

const OP_META = {
  income:             { label: 'Приход',          icon: ArrowDownRight, tone: 'success' },
  collection:         { label: 'Инкассация',      icon: Wallet,         tone: 'brand'   },
  owner_contribution: { label: 'Вклад владельца', icon: Sparkles,       tone: 'brand'   },
  expense:            { label: 'Расход',          icon: ArrowUpRight,   tone: 'danger'  },
  supplier_payment:   { label: 'Поставщику',      icon: ArrowUpRight,   tone: 'danger'  },
  salary:             { label: 'Зарплата',        icon: ArrowUpRight,   tone: 'danger'  },
  tax:                { label: 'Налог',           icon: ArrowUpRight,   tone: 'danger'  },
  transfer:           { label: 'Перевод',         icon: Repeat,         tone: 'info'    },
};

const WALLET_KIND = {
  cash_register: { label: 'Касса АЗС',         color: '#3B82F6' },
  safe:          { label: 'Сейф',              color: '#818CF8' },
  card:          { label: 'Карт-счёт',         color: '#FB7185' },
  bank:          { label: 'Р/счёт',            color: '#E11D48' },
  owner:         { label: 'Кошелёк владельца', color: '#64748B' },
  other:         { label: 'Другое',            color: '#475569' },
};

const PAYMENT_TYPE_LABEL = {
  cash:     'Наличные',
  card:     'Карта',
  qr:       'QR',
  bank:     'Банк',
  transfer: 'Перевод',
  other:    'Другое',
};

const PERIODS = [
  { id: '7d',  label: '7 дней',  days: 7  },
  { id: '30d', label: '30 дней', days: 30 },
  { id: 'mtd', label: 'Месяц'           },
];

const FILTERS = [
  { id: 'all',              label: 'Все операции' },
  { id: 'income',           label: 'Приходы' },
  { id: 'expense',          label: 'Расходы' },
  { id: 'transfer',         label: 'Переводы' },
  { id: 'supplier_payment', label: 'Поставщикам' },
  { id: 'salary',           label: 'Зарплата' },
  { id: 'tax',              label: 'Налоги' },
  { id: 'collection',       label: 'Инкассация' },
];

function rangeFor(id) {
  const now = new Date();
  const to = new Date(now);
  let from;
  if (id === '7d')  from = new Date(now.getTime() - 6 * 86400000);
  else if (id === '30d') from = new Date(now.getTime() - 29 * 86400000);
  else from = new Date(now.getFullYear(), now.getMonth(), 1);
  from.setHours(0, 0, 0, 0);
  return { from, to, fromDate: from.toISOString().slice(0, 10), toDate: to.toISOString().slice(0, 10) };
}

export default function CashflowScreen() {
  const { user } = useAuth();
  const { canExport, canEdit, canDelete } = usePermissions();
  const orgId = user?.profile?.organization_id;

  const [period, setPeriod] = useState('30d');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [rows, setRows] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [editingRow, setEditingRow] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [editForm, setEditForm] = useState({
    date: '',
    operation_type: 'expense',
    payment_type: '',
    wallet_from: '',
    wallet_to: '',
    cashflow_category: '',
    amount: '',
    counterparty_id: '',
    note: '',
    status: 'confirmed',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [cashflow, w, s] = await Promise.all([
        listCashflow({ limit: 500 }).catch(() => []),
        orgId ? listWallets({ organizationId: orgId, active: true }).catch(() => []) : [],
        orgId ? listCounterparties({ organizationId: orgId, type: 'supplier', active: true }).catch(() => []) : [],
      ]);
      setRows(cashflow);
      setWallets(w);
      setSuppliers(s);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const { from, to, fromDate, toDate } = rangeFor(period);

  const periodRows = useMemo(
    () => rows.filter((r) => r.date >= fromDate && r.date <= toDate),
    [rows, fromDate, toDate],
  );

  const totals = useMemo(() => {
    let inflow = 0, outflow = 0, transfers = 0;
    for (const r of periodRows) {
      const amt = Number(r.amount ?? 0);
      if (POSITIVE_OPS.has(r.operation_type)) inflow += amt;
      else if (r.operation_type === 'transfer') transfers += amt;
      else outflow += amt;
    }
    return { inflow, outflow, net: inflow - outflow, transfers };
  }, [periodRows]);

  const series = useMemo(() => {
    const map = new Map();
    const dayMs = 86400000;
    for (let t = from.getTime(); t <= to.getTime(); t += dayMs) {
      const d = new Date(t);
      const key = d.toISOString().slice(0, 10);
      map.set(key, {
        day: key,
        label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }),
        inflow: 0, outflow: 0, net: 0,
      });
    }
    for (const r of periodRows) {
      const key = String(r.date).slice(0, 10);
      const bucket = map.get(key);
      if (!bucket) continue;
      const amt = Number(r.amount ?? 0);
      if (POSITIVE_OPS.has(r.operation_type)) bucket.inflow += amt;
      else if (r.operation_type !== 'transfer') bucket.outflow += amt;
    }
    let running = 0;
    return [...map.values()].map((b) => {
      const net = b.inflow - b.outflow;
      running += net;
      return { ...b, net, running };
    });
  }, [periodRows, from, to]);

  const expensesByCat = useMemo(() => {
    const map = new Map();
    for (const r of periodRows) {
      if (POSITIVE_OPS.has(r.operation_type) || r.operation_type === 'transfer') continue;
      const cat = (r.cashflow_category || OP_META[r.operation_type]?.label || 'Прочее').trim();
      map.set(cat, (map.get(cat) ?? 0) + Number(r.amount ?? 0));
    }
    return [...map.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [periodRows]);

  const inflowsByType = useMemo(() => {
    const map = new Map();
    for (const r of periodRows) {
      if (!POSITIVE_OPS.has(r.operation_type)) continue;
      const k = r.operation_type;
      map.set(k, (map.get(k) ?? 0) + Number(r.amount ?? 0));
    }
    return [...map.entries()]
      .map(([type, amount]) => ({ type, label: OP_META[type]?.label ?? type, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [periodRows]);

  const visibleRows = useMemo(() => {
    if (filter === 'all') return periodRows;
    if (filter === 'income') return periodRows.filter((r) => POSITIVE_OPS.has(r.operation_type));
    if (filter === 'expense') return periodRows.filter((r) => !POSITIVE_OPS.has(r.operation_type) && r.operation_type !== 'transfer');
    return periodRows.filter((r) => r.operation_type === filter);
  }, [periodRows, filter]);

  function exportCSV() {
    downloadCSV(`cashflow-${period}-${todayStamp()}`, visibleRows, [
      { key: 'date', label: 'Дата' },
      { key: 'operation_type', label: 'Операция' },
      { key: 'cashflow_category', label: 'Категория' },
      { key: 'amount', label: 'Сумма' },
      { key: 'payment_type', label: 'Способ' },
      { key: 'counterparty.name', label: 'Контрагент' },
      { key: 'from_wallet.name', label: 'Откуда' },
      { key: 'to_wallet.name', label: 'Куда' },
      { key: 'status', label: 'Статус' },
      { key: 'note', label: 'Комментарий' },
    ]);
  }

  const totalWallets = wallets.reduce((s, w) => s + Number(w.balance ?? 0), 0);
  const totalSupplierDebt = suppliers.reduce((s, c) => s + Math.max(0, Number(c.balance ?? 0)), 0);

  function openEditRow(row) {
    setEditingRow(row);
    setEditForm({
      date: row.date ?? '',
      operation_type: row.operation_type ?? 'expense',
      payment_type: row.payment_type ?? '',
      wallet_from: row.wallet_from ?? '',
      wallet_to: row.wallet_to ?? '',
      cashflow_category: row.cashflow_category ?? '',
      amount: String(row.amount ?? ''),
      counterparty_id: row.counterparty_id ?? '',
      note: row.note ?? '',
      status: row.status ?? 'confirmed',
    });
    setEditErr('');
  }

  async function submitEditRow() {
    if (!editingRow) return;
    setEditSaving(true);
    setEditErr('');
    try {
      await updateCashflow(editingRow.id, {
        date: editForm.date,
        operation_type: editForm.operation_type,
        payment_type: editForm.payment_type || null,
        wallet_from: editForm.wallet_from || null,
        wallet_to: editForm.wallet_to || null,
        cashflow_category: editForm.cashflow_category || null,
        amount: Number(editForm.amount),
        counterparty_id: editForm.counterparty_id || null,
        note: editForm.note || null,
        status: editForm.status,
      });
      setEditingRow(null);
      await load();
    } catch (e) {
      setEditErr(e?.message ?? 'Не удалось сохранить операцию.');
    } finally {
      setEditSaving(false);
    }
  }

  async function removeEditRow() {
    if (!editingRow) return;
    if (!confirm('Удалить операцию?')) return;
    setEditDeleting(true);
    setEditErr('');
    try {
      await deleteCashflowWithSync(editingRow.id);
      window.dispatchEvent(new Event('fingas-data-changed'));
      setEditingRow(null);
      await load();
    } catch (e) {
      setEditErr(e?.message ?? 'Не удалось удалить операцию.');
    } finally {
      setEditDeleting(false);
    }
  }

  async function removeRowQuick(row) {
    if (!confirm('Удалить операцию?')) return;
    setEditDeleting(true);
    setEditErr('');
    try {
      await deleteCashflowWithSync(row.id);
      window.dispatchEvent(new Event('fingas-data-changed'));
      await load();
    } catch (e) {
      setEditErr(e?.message ?? 'Не удалось удалить операцию.');
    } finally {
      setEditDeleting(false);
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <ScreenHeader
        title="Кэшфлоу"
        subtitle="Аналитика денежных потоков"
        right={canExport(MODULES.CASHFLOW) && visibleRows.length > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={exportCSV}
            className="h-10 w-10 p-0 flex items-center justify-center rounded-xl bg-bg-card border border-line/30 hover:bg-bg-elevated active:scale-95 transition-all shadow-sm"
          >
            <Download className="w-4.5 h-4.5 text-ink-muted" />
          </Button>
        ) : null}
      />

      {err && (
        <div className="rounded-2xl border border-danger/35 bg-danger/10 px-4 py-3 text-xs text-danger shadow-inner">
          {err}
        </div>
      )}

      {/* Switcher control with sliding Framer Motion pill */}
      <div className="relative grid grid-cols-3 p-1 rounded-2xl bg-bg-card/75 backdrop-blur-xl border border-line/30 shadow-inner gap-1">
        {PERIODS.map((p) => {
          const active = period === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className="relative h-8 rounded-xl text-xs font-black transition-colors duration-200 z-10 flex items-center justify-center cursor-pointer"
            >
              {active && (
                <motion.div
                  layoutId="activePeriodPillCashflow"
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

      {/* Net Cash Flow Banner - Elegant theme-adaptive Stripe-like banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-3xl p-5 border relative overflow-hidden backdrop-blur-2xl transition-all duration-350 ${
          totals.net >= 0
            ? 'border-success/20 bg-gradient-to-br from-success/15 via-bg-card/95 to-bg-card shadow-card hover:shadow-md'
            : 'border-danger/20 bg-gradient-to-br from-brand-50/70 via-bg-card/95 to-brand-100/30 shadow-card hover:shadow-md dark:border-brand-500/30 dark:from-brand-600/10 dark:to-brand-700/5'
        }`}
      >
        <div className="absolute -top-24 -right-24 w-44 h-44 rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />

        <span className="text-[9px] uppercase tracking-[0.22em] text-ink-soft font-black flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-brand-400" />
          Чистый денежный поток за период
        </span>
        <div className={`text-3xl font-extrabold mt-2 tracking-tight tabular-nums ${totals.net >= 0 ? 'text-success' : 'text-danger'}`}>
          {totals.net >= 0 ? '+' : '−'}{formatMoney(Math.abs(totals.net))}
        </div>
        <div className="text-[10px] text-ink-soft mt-1 font-bold">
          Приход: <span className="text-ink">{formatMoney(totals.inflow)}</span> · Расход: <span className="text-ink">{formatMoney(totals.outflow)}</span>
        </div>

        {/* Embedded micro line chart */}
        <div className="h-28 mt-4 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="netInflowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E11D48" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#E11D48" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.06)" vertical={false} />
              <XAxis dataKey="label" stroke="#94A3B8" fontSize={9} fontWeight={600} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#94A3B8" fontSize={9} fontWeight={600} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}к` : String(v)} />
              <Tooltip
                contentStyle={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-brand-500)', borderRadius: 12, fontSize: 11, fontWeight: 'bold' }}
                formatter={(v) => [formatMoney(v), 'Поток']}
              />
              <Area type="monotone" dataKey="inflow" stroke="#E11D48" strokeWidth={2} fill="url(#netInflowGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Wallets Current Balance Card */}
      <Card className="p-4 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl">
        <SectionTitle icon={Wallet} title="Текущие остатки" right={formatMoney(totalWallets)} />
        {wallets.length === 0 ? (
          <div className="text-xs text-ink-soft py-4 text-center">
            Кошельков пока не настроено.
          </div>
        ) : (
          <div className="space-y-2.5 pt-2">
            {wallets.map((w) => {
              const meta = WALLET_KIND[w.kind] ?? WALLET_KIND.other;
              return (
                <div
                  key={w.id}
                  className="rounded-2xl bg-bg-card border border-line/30 hover:border-brand-500/20 px-3.5 py-3 flex items-center justify-between min-w-0 shadow-sm relative group cursor-pointer transition-all duration-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-1.5 h-8 rounded-full flex-shrink-0 animate-pulse"
                      style={{
                        background: meta.color,
                        boxShadow: `0 0 8px ${meta.color}88`
                      }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-black text-ink truncate leading-tight group-hover:text-brand-400 transition-colors">
                        {w.name}
                      </div>
                      <div className="text-[10px] text-ink-soft truncate mt-0.5 font-bold">
                        {meta.label} · {w.currency}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-black text-ink tabular-nums flex-shrink-0">
                    {formatMoney(w.balance, '')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Breakdown Sources Grid */}
      <div className="grid grid-cols-1 gap-4">
        {/* Inflows breakdown */}
        <Card className="p-4 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl">
          <SectionTitle icon={ArrowDownRight} title="Источники поступлений" right={formatMoney(totals.inflow)} />
          {inflowsByType.length === 0 ? (
            <Empty loading={loading} text="За выбранный период приходов нет" />
          ) : (
            <div className="space-y-3.5 pt-2">
              {inflowsByType.map((row) => {
                const share = totals.inflow > 0 ? (row.amount / totals.inflow) * 100 : 0;
                return (
                  <div key={row.type} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                      <span className="text-ink font-bold truncate">{row.label}</span>
                      <span className="text-ink font-black tabular-nums flex-shrink-0">
                        {formatMoney(row.amount)} <span className="text-[9px] text-ink-soft font-medium">({share.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-bg-elevated/80 dark:bg-black/40 overflow-hidden relative">
                      <div className="h-full bg-gradient-to-r from-success to-emerald-400 rounded-full transition-all" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Expenses Breakdown */}
        <Card className="p-4 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl">
          <SectionTitle icon={ArrowUpRight} title="Статьи расходов" right={formatMoney(totals.outflow)} />
          {expensesByCat.length === 0 ? (
            <Empty loading={loading} text="За выбранный период расходов нет" />
          ) : (
            <div className="space-y-3.5 pt-2">
              {expensesByCat.map((row) => {
                const share = totals.outflow > 0 ? (row.amount / totals.outflow) * 100 : 0;
                return (
                  <div key={row.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                      <span className="text-ink font-bold truncate">{row.category}</span>
                      <span className="text-ink font-black tabular-nums flex-shrink-0">
                        {formatMoney(row.amount)} <span className="text-[9px] text-ink-soft font-medium">({share.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-bg-elevated/80 dark:bg-black/40 overflow-hidden relative">
                      <div className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full transition-all" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Supplier debts */}
      {suppliers.length > 0 && (
        <Card className="p-4 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl">
          <SectionTitle icon={Building2} title="Долги перед поставщиками" right={formatMoney(totalSupplierDebt)} />
          <div className="space-y-2.5 pt-2">
            {suppliers
              .filter((s) => Number(s.balance ?? 0) > 0)
              .sort((a, b) => Number(b.balance) - Number(a.balance))
              .slice(0, 5)
              .map((s) => {
                const max = totalSupplierDebt || 1;
                const share = (Number(s.balance) / max) * 100;
                return (
                  <div
                    key={s.id}
                    className="rounded-2xl bg-bg-card border border-line/30 hover:border-brand-500/20 px-3.5 py-3 min-w-0 shadow-sm transition-all duration-200 group cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                      <span className="text-ink font-black truncate group-hover:text-brand-400 transition-colors">
                        {s.name}
                      </span>
                      <span className="text-brand-500 font-extrabold tabular-nums flex-shrink-0">
                        {formatMoney(s.balance)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 bg-bg-elevated/80 dark:bg-black/40 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            {totalSupplierDebt === 0 && (
              <div className="text-xs text-ink-soft py-4 text-center">
                Долги отсутствуют
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Ledger history list */}
      <Card className="p-4 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl">
        <SectionTitle icon={Repeat} title="История операций" right={`${visibleRows.length}`} />

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 pt-2 mb-2">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex-shrink-0 px-3.5 h-7 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                  active
                    ? 'bg-brand-500 text-white border-brand-500 shadow-glow font-bold'
                    : 'bg-bg-elevated text-ink-soft border-line/40 hover:text-ink-muted'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {visibleRows.length === 0 ? (
          <Empty loading={loading} text="За выбранный период операций не найдено" />
        ) : (
          <div className="space-y-2.5">
            {visibleRows.slice(0, 50).map((r, i) => (
              <OpRow
                key={r.id ?? i}
                row={r}
                index={i}
                canEdit={canEdit(MODULES.CASHFLOW)}
                canDelete={canDelete(MODULES.CASHFLOW)}
                onEdit={() => openEditRow(r)}
                onDelete={() => removeRowQuick(r)}
              />
            ))}
          </div>
        )}
      </Card>

      <FormSheet
        open={!!editingRow}
        onClose={() => setEditingRow(null)}
        title="Редактировать операцию"
        onSubmit={submitEditRow}
        saving={editSaving}
        error={editErr}
        onDelete={canDelete(MODULES.CASHFLOW) ? removeEditRow : null}
        deleting={editDeleting}
      >
        <Input label="Дата" type="date" value={editForm.date} onChange={(e) => setEditForm((c) => ({ ...c, date: e.target.value }))} />
        <Select label="Тип операции" value={editForm.operation_type} onChange={(e) => setEditForm((c) => ({ ...c, operation_type: e.target.value }))}>
          {Object.entries(OP_META).map(([id, meta]) => (
            <option key={id} value={id}>{meta.label}</option>
          ))}
        </Select>
        <Input label="Сумма" type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm((c) => ({ ...c, amount: e.target.value }))} />
        <Input label="Категория" value={editForm.cashflow_category} onChange={(e) => setEditForm((c) => ({ ...c, cashflow_category: e.target.value }))} />
        <Select label="Способ оплаты" value={editForm.payment_type} onChange={(e) => setEditForm((c) => ({ ...c, payment_type: e.target.value }))}>
          <option value="">—</option>
          <option value="cash">Наличные</option>
          <option value="card">Карта</option>
          <option value="qr">QR</option>
          <option value="bank">Банк</option>
          <option value="transfer">Перевод</option>
        </Select>
        <Select label="С кошелька" value={editForm.wallet_from} onChange={(e) => setEditForm((c) => ({ ...c, wallet_from: e.target.value }))}>
          <option value="">—</option>
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
        <Select label="На кошелёк" value={editForm.wallet_to} onChange={(e) => setEditForm((c) => ({ ...c, wallet_to: e.target.value }))}>
          <option value="">—</option>
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
        <Select label="Контрагент" value={editForm.counterparty_id} onChange={(e) => setEditForm((c) => ({ ...c, counterparty_id: e.target.value }))}>
          <option value="">—</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select label="Статус" value={editForm.status} onChange={(e) => setEditForm((c) => ({ ...c, status: e.target.value }))}>
          <option value="confirmed">confirmed</option>
          <option value="pending_confirmation">pending_confirmation</option>
          <option value="rejected">rejected</option>
        </Select>
        <Input label="Комментарий" value={editForm.note} onChange={(e) => setEditForm((c) => ({ ...c, note: e.target.value }))} />
      </FormSheet>
    </div>
  );
}

function OpRow({ row, index, canEdit, canDelete, onEdit, onDelete }) {
  const meta = OP_META[row.operation_type] ?? { label: row.operation_type, icon: Repeat, tone: 'default' };
  const positive = POSITIVE_OPS.has(row.operation_type);
  const transfer = row.operation_type === 'transfer';
  const Icon = meta.icon;
  const iconCls = {
    success: 'bg-success/10 border-success/20 text-success',
    danger:  'bg-danger/10 border-danger/20 text-danger',
    info:    'bg-info/10 border-info/20 text-info',
    brand:   'bg-brand-500/10 border-brand-500/20 text-brand-500 shadow-inner',
    default: 'bg-bg-elevated border-line text-ink-soft shadow-inner',
  }[meta.tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.008 }}
      className="rounded-2xl bg-bg-card/50 border border-line/30 hover:border-brand-500/20 dark:bg-[#0F1832]/40 dark:border-white/[0.02] dark:hover:border-brand-500/25 px-3.5 py-3 flex items-center justify-between min-w-0 transition-all duration-200 shadow-sm relative group cursor-pointer"
    >
      {/* Subtle brand marker left bar on hover */}
      <div className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-lg bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      <div className="flex items-center gap-3.5 min-w-0">
        <div className={`w-8.5 h-8.5 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconCls} group-hover:scale-105 transition-transform duration-200`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-black text-ink truncate leading-tight group-hover:text-brand-400 transition-colors">
            {row.cashflow_category ?? meta.label}
          </div>
          <div className="text-[10px] text-ink-soft truncate mt-1.5 font-bold flex items-center gap-1">
            <Calendar className="w-3 h-3 text-ink-soft flex-shrink-0" />
            {formatDate(row.date)}
            {row.counterparty?.name ? ` · ${row.counterparty.name}` : ''}
            {row.payment_type ? ` · ${PAYMENT_TYPE_LABEL[row.payment_type] ?? row.payment_type}` : ''}
          </div>
        </div>
      </div>

      <div className="text-right flex-shrink-0 flex items-center gap-3">
        <div className="min-w-0">
          <div className={`text-xs font-black tabular-nums tracking-tight ${transfer ? 'text-info' : positive ? 'text-success' : 'text-danger'}`}>
            {transfer ? '' : positive ? '+' : '−'}{formatMoney(Math.abs(Number(row.amount ?? 0)))}
          </div>
          {row.status && row.status !== 'confirmed' && (
            <div className="mt-1">
              <Badge tone={row.status === 'pending_confirmation' ? 'warning' : 'default'} className="font-bold tracking-wider uppercase text-[8px] px-1.5 py-0.5 animate-none shadow-inner">
                {row.status === 'pending_confirmation' ? 'проверка' : row.status}
              </Badge>
            </div>
          )}
        </div>
        
        {(canEdit || canDelete) && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 p-0 flex items-center justify-center rounded-lg bg-bg-elevated/70 border border-line hover:bg-bg-elevated transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(row);
                }}
              >
                <Pencil className="w-3.5 h-3.5 text-ink-muted" />
              </Button>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="danger"
                className="h-8 w-8 p-0 flex items-center justify-center rounded-lg hover:shadow-inner transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SectionTitle({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between min-w-0 select-none mb-3">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-4.5 h-4.5 text-brand-400 flex-shrink-0" />}
        <span className="font-extrabold text-ink text-sm">{title}</span>
      </div>
      {right != null && (
        <Badge tone="default" className="font-bold text-[9px] tracking-wider uppercase bg-bg-elevated text-ink-soft border border-line/30 px-2 py-0.5 flex-shrink-0">
          {right}
        </Badge>
      )}
    </div>
  );
}

function Empty({ loading, text }) {
  return (
    <div className="h-24 flex flex-col items-center justify-center text-center">
      {loading ? (
        <div className="relative flex items-center justify-center w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-brand-500/10" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-500 border-r-brand-400 shadow-glow"
          />
        </div>
      ) : (
        <div className="text-xs text-ink-soft font-bold">{text}</div>
      )}
    </div>
  );
}
