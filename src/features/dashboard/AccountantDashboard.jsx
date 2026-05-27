// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Accountant dashboard — live KPIs over financial tables. Period MTD.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Building2,
  FileText,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabaseClient';
import { listCounterparties } from '@/services/counterpartyService';
import { listTaxes } from '@/services/taxService';
import { aggregateForShift } from '@/services/salesService';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney } from '@/lib/formatters';


export default function AccountantDashboard() {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const [data, setData] = useState({
    revenueMTD: 0,
    cashflowIncomeMTD: 0,
    cashflowExpenseMTD: 0,
    taxesMTD: 0,
    supplierDebt: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const startISO = start.toISOString();
      const startDate = start.toISOString().slice(0, 10);
      const now = new Date();

      try {
        const [sales, cf, taxes, suppliers] = await Promise.all([
          aggregateForShift({ from: startISO, to: now.toISOString() }).catch(() => ({ revenue: 0 })),
          supabase
            .from('cashflow')
            .select('operation_type, amount')
            .gte('date', startDate)
            .then(({ data }) => data ?? []),
          listTaxes({ limit: 500 }).then((rows) =>
            rows.filter((r) => r.payment_date >= startDate)
              .reduce((s, r) => s + Number(r.amount ?? 0), 0)
          ).catch(() => 0),
          listCounterparties({ organizationId: orgId, type: 'supplier', active: true })
            .then((rows) => rows.reduce((s, r) => s + Math.max(0, Number(r.balance ?? 0)), 0))
            .catch(() => 0),
        ]);

        if (cancelled) return;
        let income = 0, expense = 0;
        for (const r of cf) {
          const amt = Number(r.amount ?? 0);
          if (['income', 'collection', 'owner_contribution'].includes(r.operation_type)) income += amt;
          else if (r.operation_type !== 'transfer') expense += amt;
        }
        setData({
          revenueMTD: sales.revenue,
          cashflowIncomeMTD: income,
          cashflowExpenseMTD: expense,
          taxesMTD: taxes,
          supplierDebt: suppliers,
        });
      } catch (err) {
        console.error('Accountant dashboard load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orgId]);

  return (
    <div className="pb-2 space-y-2.5">
      <ScreenHeader
        title="Кэшфлоу"
        subtitle="За текущий месяц MTD"
        right={
          <Badge tone="warning" className="text-[10px]">
            Бухгалтер
          </Badge>
        }
      />

      {/* Consolidated MTD Stats Card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-line/40 bg-bg-card p-3.5 shadow-sm relative overflow-hidden"
      >
        <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-brand-500/5 blur-2xl" />
        
        <div className="relative space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">
              Выручка с начала месяца
            </div>
            <div className="mt-0.5 text-xl font-bold text-ink">
              {loading ? '…' : formatMoney(data.revenueMTD)}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line/40 bg-bg-elevated/40 p-2">
              <div className="text-[9px] font-medium text-ink-soft uppercase tracking-wider truncate">Приход</div>
              <div className="mt-0.5 text-xs font-bold text-success truncate">
                {loading ? '…' : formatMoney(data.cashflowIncomeMTD)}
              </div>
            </div>
            <div className="rounded-xl border border-line/40 bg-bg-elevated/40 p-2">
              <div className="text-[9px] font-medium text-ink-soft uppercase tracking-wider truncate">Расход</div>
              <div className="mt-0.5 text-xs font-bold text-danger truncate">
                {loading ? '…' : formatMoney(data.cashflowExpenseMTD)}
              </div>
            </div>
            <div className="rounded-xl border border-line/40 bg-bg-elevated/40 p-2">
              <div className="text-[9px] font-medium text-ink-soft uppercase tracking-wider truncate">Налоги</div>
              <div className="mt-0.5 text-xs font-bold text-warning truncate">
                {loading ? '…' : formatMoney(data.taxesMTD)}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-2">
        <Kpi
          to="/cashflow"
          icon={Wallet}
          label="Приходы"
          value={loading ? '…' : formatMoney(data.cashflowIncomeMTD)}
          tone="success"
        />
        <Kpi
          to="/cashflow"
          icon={Wallet}
          label="Расходы"
          value={loading ? '…' : formatMoney(data.cashflowExpenseMTD)}
          tone="danger"
        />
        <Kpi
          to="/taxes"
          icon={Receipt}
          label="Налоги"
          value={loading ? '…' : formatMoney(data.taxesMTD)}
          tone="warn"
        />
        <Kpi
          to="/suppliers"
          icon={Building2}
          label="Долг поставщикам"
          value={loading ? '…' : formatMoney(data.supplierDebt)}
          tone="info"
        />
      </div>


      {/* Action Links */}
      <div className="grid grid-cols-2 gap-2">
        <Link to="/pl">
          <Card hoverable className="!p-3 text-center border-line/40 bg-bg-card">
            <TrendingUp className="w-4 h-4 mx-auto text-brand-400 mb-1" />
            <div className="text-xs font-semibold text-ink">Отчёт P&L</div>
            <div className="text-[9px] text-ink-muted mt-0.5">P&L</div>
          </Card>
        </Link>
        <Link to="/documents">
          <Card hoverable className="!p-3 text-center border-line/40 bg-bg-card">
            <FileText className="w-4 h-4 mx-auto text-brand-400 mb-1" />
            <div className="text-xs font-semibold text-ink">Документы</div>
            <div className="text-[9px] text-ink-muted mt-0.5">Накладные и чеки</div>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function Kpi({ to, icon: Icon, label, value, tone }) {
  const ring =
    tone === 'success' ? 'border-success/30 hover:border-success/50' :
    tone === 'danger'  ? 'border-danger/30 hover:border-danger/50' :
    tone === 'warn'    ? 'border-warning/30 hover:border-warning/50' :
                         'border-line/40 hover:border-brand-500/50';

  const iconCls =
    tone === 'success' ? 'bg-success/10 border-success/20 text-success' :
    tone === 'danger'  ? 'bg-danger/10 border-danger/20 text-danger' :
    tone === 'warn'    ? 'bg-warning/10 border-warning/20 text-warning' :
                         'bg-brand-500/10 border-brand-500/20 text-brand-400';

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
        <div className="mt-3.5 flex items-end justify-between gap-1">
          <span className="text-sm font-bold text-ink truncate">{value}</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />
        </div>
      </motion.div>
    </Link>
  );
}
