// [UPDATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY CODEX - 2026-05-25]
// Project: Fingas
// Purpose: Payroll read. Operator sees own (RLS-enforced); owner/payroll-perm
// sees everyone — grouped by employee with accrued/paid/remaining totals.

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Banknote, CalendarClock, Download, ReceiptText, UserCircle } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/status/EmptyState';
import { listPayroll } from '@/services/payrollService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES, ROLES } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/formatters';
import { downloadCSV, todayStamp } from '@/lib/exporters';

export default function PayrollScreen() {
  const { user } = useAuth();
  const { canExport } = usePermissions();
  const role = user?.profile?.role;
  const isSelf = role === ROLES.OPERATOR;

  function exportCSV(data) {
    downloadCSV(`payroll-${todayStamp()}`, data, [
      { key: 'user.full_name', label: 'Сотрудник' },
      { key: 'period', label: 'Период' },
      { key: 'salary_type', label: 'Тип' },
      { key: 'liters', label: 'Литры' },
      { key: 'rate', label: 'Ставка' },
      { key: 'accrued', label: 'Начислено' },
      { key: 'paid', label: 'Выплачено' },
    ]);
  }

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const data = await listPayroll(isSelf ? { userId: user?.id } : {});
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setErr(e?.message ?? 'Не удалось загрузить');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (user?.id) load();
    return () => { cancelled = true; };
  }, [user?.id, isSelf]);

  const totals = useMemo(() => {
    let accrued = 0, paid = 0;
    for (const r of rows) {
      accrued += Number(r.accrued ?? 0);
      paid += Number(r.paid ?? 0);
    }
    return { accrued, paid, remaining: accrued - paid };
  }, [rows]);

  const groups = useMemo(() => {
    if (isSelf) return null;
    const map = new Map();
    for (const r of rows) {
      const k = r.user_id;
      if (!map.has(k)) map.set(k, { user: r.user, accrued: 0, paid: 0, items: [] });
      const g = map.get(k);
      g.accrued += Number(r.accrued ?? 0);
      g.paid += Number(r.paid ?? 0);
      g.items.push(r);
    }
    return [...map.values()].sort((a, b) => (b.accrued - b.paid) - (a.accrued - a.paid));
  }, [rows, isSelf]);

  return (
    <div>
      <ScreenHeader
        title={isSelf ? 'Моя зарплата' : 'Зарплата команды'}
        subtitle={isSelf ? 'Начисления по моим сменам' : 'Начислено, выплачено, остаток к выплате'}
        right={canExport(MODULES.PAYROLL) && rows.length > 0 ? (
          <Button size="sm" variant="secondary" onClick={() => exportCSV(rows)}>
            <Download className="w-4 h-4" />
          </Button>
        ) : null}
      />

      {err && <Card className="text-sm text-danger mb-3">{err}</Card>}
      {!loading && rows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">
              <Banknote className="w-3 h-3 text-brand-500" />
              {isSelf ? 'Мои начисления' : 'Фонд оплаты'}
            </div>
            <div className={`mt-1 text-xl font-bold ${totals.remaining > 0 ? 'text-warning' : 'text-success'}`}>
              {formatMoney(totals.remaining)}
            </div>
            <div className="mt-0.5 text-xs text-ink-muted">
              {isSelf ? 'Остаток к выплате по моим сменам' : 'Текущий остаток по команде'}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              <Stat label="Начислено" value={formatMoney(totals.accrued)} />
              <Stat label="Выплачено" value={formatMoney(totals.paid)} tone="success" />
              <Stat label="Остаток" value={formatMoney(totals.remaining)} tone={totals.remaining > 0 ? 'warn' : 'default'} />
            </div>
          </div>
        </motion.div>
      )}

      {loading && (
        <div className="space-y-2">
          {[0,1,2].map((i) => <div key={i} className="h-16 rounded-xl bg-bg-card border border-line/30 animate-pulse" />)}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <EmptyState
          icon={Banknote}
          title="Начислений пока нет"
          description="Начисления появятся автоматически при закрытии смен."
        />
      )}

      {/* operator: flat list of own periods */}
      {!loading && isSelf && rows.map((r, i) => (
        <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
          <Card hoverable className="!p-3 rounded-xl border border-line/30 bg-bg-card shadow-sm mb-2">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
                <ReceiptText className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-ink-soft">Период</div>
                    <div className="font-semibold text-ink text-xs mt-0.5">{formatDate(r.period)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-ink leading-tight">{formatMoney(r.accrued)}</div>
                    <Badge tone={Number(r.paid) >= Number(r.accrued) ? 'success' : 'warning'}>
                      {Number(r.paid) >= Number(r.accrued) ? 'Выплачено' : 'К выплате'}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2.5">
                  <DetailPill
                    icon={CalendarClock}
                    label={r.salary_type === 'piecework' && r.liters ? `${r.liters} л × ${r.rate}` : 'Фикс за смену'}
                  />
                  <DetailPill icon={Banknote} label={`Выплачено ${formatMoney(r.paid)}`} />
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      ))}

      {/* owner / payroll: per-employee groups */}
      {!loading && !isSelf && groups && groups.map((g, i) => (
        <motion.div key={g.user?.id ?? i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
          <Card hoverable className="!p-3 rounded-xl border border-line/30 bg-bg-card shadow-sm mb-2">
            <div className="flex items-center gap-3 mb-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <UserCircle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-ink truncate">{g.user?.full_name ?? g.user?.email ?? 'Сотрудник'}</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-ink-soft mt-0.5">{g.items.length} начислений</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-warning leading-tight">{formatMoney(g.accrued - g.paid)}</div>
                <div className="text-[10px] text-ink-soft">к выплате</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <DetailPill icon={ReceiptText} label={`Начислено ${formatMoney(g.accrued)}`} />
              <DetailPill icon={Banknote} label={`Выплачено ${formatMoney(g.paid)}`} />
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const colour =
    tone === 'success' ? 'text-success' :
    tone === 'warn' ? 'text-warning' :
    tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-xl bg-bg-card/70 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className={`text-xs font-bold mt-0.5 ${colour}`}>{value}</div>
    </div>
  );
}

function DetailPill({ icon: Icon, label }) {
  return (
    <div className="rounded bg-bg-soft/40 border border-line/20 px-2 py-1 text-[11px] text-ink-muted flex items-center gap-1.5 min-w-0">
      <Icon className="w-3 h-3 text-brand-500 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
