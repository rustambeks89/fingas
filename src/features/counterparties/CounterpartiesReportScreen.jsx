// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Counterparties report — list with balance, search, type/debt filters,
// summary KPIs (total receivable / payable). Tap a row → opens supplier
// detail page (existing /suppliers/:id) which has full ledger.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  Download,
  Search,
  Truck,
  UserCircle,
  Users,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { listCounterparties } from '@/services/counterpartyService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatMoney, formatPhone } from '@/lib/formatters';
import { downloadCSV, todayStamp } from '@/lib/exporters';
import EmployeesScreen from '@/features/employees/EmployeesScreen';

const FILTERS = [
  { id: 'all',      label: 'Все' },
  { id: 'supplier', label: 'Поставщики' },
  { id: 'customer', label: 'Клиенты' },
  { id: 'employee', label: 'Сотрудники' },
  { id: 'other',    label: 'Прочие' },
  { id: 'debt',     label: 'С долгом' },
];

const TYPE_META = {
  supplier:   { label: 'Поставщик',  icon: Truck,       tone: 'brand'   },
  customer:   { label: 'Клиент',     icon: UserCircle,  tone: 'info'    },
  employee:   { label: 'Сотрудник',  icon: Users,       tone: 'success' },
  government: { label: 'Гос.',       icon: Building2,   tone: 'warning' },
  other:      { label: 'Другое',     icon: Building2,   tone: 'default' },
};

export default function CounterpartiesReportScreen() {
  const { user } = useAuth();
  const { canExport } = usePermissions();
  const orgId = user?.profile?.organization_id;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get('filter') ?? 'all';
  const setFilter = (val) => {
    setSearchParams({ filter: val });
  };
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    if (!orgId) { setRows([]); setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const data = await listCounterparties({ organizationId: orgId });
      setRows(data);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === 'debt') {
      list = list.filter((r) => Number(r.balance ?? 0) > 0);
    } else if (filter !== 'all') {
      list = list.filter((r) => r.type === filter);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((r) =>
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.inn ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
  }, [rows, filter, query]);

  const summary = useMemo(() => {
    let owe = 0;       // мы должны (positive balance)
    let receivable = 0; // должны нам (negative balance)
    let suppliers = 0, customers = 0;
    for (const r of rows) {
      const b = Number(r.balance ?? 0);
      if (b > 0) owe += b;
      if (b < 0) receivable += Math.abs(b);
      if (r.type === 'supplier') suppliers++;
      if (r.type === 'customer') customers++;
    }
    return { owe, receivable, suppliers, customers, total: rows.length };
  }, [rows]);

  function exportCSV() {
    downloadCSV(`counterparties-${todayStamp()}`, filtered, [
      { key: 'name',     label: 'Контрагент' },
      { key: 'type',     label: 'Тип',     format: (t) => TYPE_META[t]?.label ?? t },
      { key: 'inn',      label: 'ИНН' },
      { key: 'phone',    label: 'Телефон' },
      { key: 'email',    label: 'Email' },
      { key: 'balance',  label: 'Сальдо' },
      { key: 'address',  label: 'Адрес' },
      { key: 'note',     label: 'Комментарий' },
    ]);
  }

  return (
    <div className="space-y-3 pb-2">
      <ScreenHeader
        title="Контрагенты"
        subtitle="Долги · отношения"
        right={canExport(MODULES.SUPPLIERS) && filtered.length > 0 ? (
          <Button size="sm" variant="secondary" onClick={exportCSV}>
            <Download className="w-4 h-4" />
          </Button>
        ) : null}
      />

      {err && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      )}

      {/* SUMMARY */}
      {filter !== 'employee' && (
        <div className="grid grid-cols-2 gap-2">
          <SummaryTile
            tone="warning"
            label="Мы должны"
            value={loading ? '…' : formatMoney(summary.owe)}
            hint={`${summary.suppliers} поставщиков`}
          />
          <SummaryTile
            tone="success"
            label="Должны нам"
            value={loading ? '…' : formatMoney(summary.receivable)}
            hint={`${summary.customers} клиентов`}
          />
        </div>
      )}

      {/* SEARCH + FILTERS */}
      <div className="space-y-2">
        {filter !== 'employee' && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
            <Input
              placeholder="Поиск по названию / ИНН / телефону"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="!pl-9"
            />
          </div>
        )}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={
                'flex-shrink-0 px-3 h-7 rounded-lg text-[11px] font-medium border transition-colors ' +
                (filter === f.id
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-bg-elevated text-ink-muted border-line/40')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* LIST */}
      {filter === 'employee' ? (
        <EmployeesScreen embedded={true} />
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-bg-card border border-line/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="!p-4">
          <EmptyState
            icon={Building2}
            title="Не найдено"
            description={rows.length === 0
              ? 'Добавьте поставщиков и клиентов через «+» → «Поставщик»'
              : 'Никто не подходит под фильтры'}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.015 }}
            >
              <Row counterparty={r} />
            </motion.div>
          ))}
        </div>
      )}

      {filter !== 'employee' && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft text-center pt-1">
          {filtered.length} из {summary.total}
        </div>
      )}
    </div>
  );
}

function Row({ counterparty: r }) {
  const meta = TYPE_META[r.type] ?? TYPE_META.other;
  const Icon = meta.icon;
  const balance = Number(r.balance ?? 0);
  const iconCls = {
    brand:   'bg-brand-500/15 border-brand-500/30 text-brand-400',
    info:    'bg-info/15 border-info/30 text-info',
    success: 'bg-success/15 border-success/30 text-success',
    warning: 'bg-warning/15 border-warning/30 text-warning',
    default: 'bg-bg-elevated border-line text-ink-muted',
  }[meta.tone];

  // For suppliers we deep-link to the existing supplier detail page (ledger).
  // For other types we use the same route — it works regardless of type.
  const linkTo = r.type === 'supplier' ? `/suppliers/${r.id}` : `/suppliers/${r.id}`;

  return (
    <Link to={linkTo} className="block">
      <motion.div
        whileTap={{ scale: 0.99 }}
        className="rounded-2xl bg-bg-card border border-line/60 px-4 py-3 flex items-center gap-3 min-w-0 hover:border-brand-500/40 transition-colors"
      >
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconCls}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-semibold text-ink truncate">{r.name}</div>
            {!r.active && <Badge>archived</Badge>}
          </div>
          <div className="text-[10px] text-ink-muted truncate">
            {meta.label}
            {r.phone ? ` · ${formatPhone(r.phone)}` : ''}
            {r.inn ? ` · ИНН ${r.inn}` : ''}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {balance === 0 ? (
            <div className="text-xs text-ink-muted tabular-nums">0</div>
          ) : balance > 0 ? (
            <div>
              <div className="text-sm font-bold text-warning tabular-nums">{formatMoney(balance)}</div>
              <div className="text-[10px] text-ink-soft">мы должны</div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-bold text-success tabular-nums">{formatMoney(Math.abs(balance))}</div>
              <div className="text-[10px] text-ink-soft">должны нам</div>
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-ink-soft flex-shrink-0" />
      </motion.div>
    </Link>
  );
}

function SummaryTile({ tone, label, value, hint }) {
  const wrap =
    tone === 'success' ? 'border-success/30 bg-success/5' :
    tone === 'warning' ? 'border-warning/30 bg-warning/5' :
                         'border-line/60';
  const v =
    tone === 'success' ? 'text-success' :
    tone === 'warning' ? 'text-warning' : 'text-ink';
  return (
    <div className={`rounded-2xl border ${wrap} bg-bg-card p-3 min-w-0`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-ink-soft truncate">{label}</div>
        <ArrowUpRight className="w-3 h-3 text-ink-soft flex-shrink-0" />
      </div>
      <div className={`text-lg font-bold tabular-nums truncate mt-0.5 ${v}`}>{value}</div>
      <div className="text-[10px] text-ink-muted truncate">{hint}</div>
    </div>
  );
}
