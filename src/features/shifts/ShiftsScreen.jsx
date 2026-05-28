// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Shifts UI. Current open shift comes from azs_selling; archived
// shifts come from azs_balance counter totalizers. Archive sales come from the
// TRK counter diff (EndBalance − BeginBalance); rows with counters ≤ 1 000 000
// are excluded as remnants.
//
// Split shifts (same physical shift broken into several ShiftKeys after power
// loss / re-login) are merged in shiftService.listShiftsFromBalance.
//
// Operator names come from azs_selling but can be overridden via
// shift_operator_overrides — the owner taps the name to fix it.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Fuel,
  Layers,
  Pencil,
  Square,
  Trash2,
  XCircle,
  AlertTriangle,
  Coins,
  Banknote,
  Wallet,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { CollapsibleFilters } from '@/components/ui/CollapsibleFilters';
import {
  closeoutByShiftKey,
  deleteOperatorOverride,
  getCurrentShiftFromBalance,
  getShiftReportByKey,
  listPendingShiftReports,
  listSalesShiftGroups,
  reviewShiftReport,
  setOperatorOverride,
  listShiftReportLines,
  saveShiftReportLines,
  updateShiftReport,
} from '@/services/shiftService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatDateTime, formatLiters, formatMoney } from '@/lib/formatters';
import { PullToRefresh } from '@/components/ui/PullToRefresh';


export default function ShiftsScreen() {
  const { user } = useAuth();
  const { canApprove, canCreate, canEdit } = usePermissions();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const canReconcile = canCreate(MODULES.SHIFTS);
  const canReview = canApprove(MODULES.SHIFTS);
  const canRenameOperator = canEdit(MODULES.SHIFTS);
  const isOperator = user?.profile?.role === 'operator';

  const [current, setCurrent] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [closeoutShift, setCloseoutShift] = useState(null);
  const [viewReport, setViewReport] = useState(null);
  const [editReport, setEditReport] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [editingOperator, setEditingOperator] = useState(null);

  const [cashiers, setCashiers] = useState([]);
  const [filterCashier, setFilterCashier] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [filterDateTo, setFilterDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [filterShiftKey, setFilterShiftKey] = useState('');

  useEffect(() => {
    if (!orgId) return;
    import('@/lib/supabaseClient').then(({ supabase }) =>
      supabase
        .from('profiles')
        .select('id, user_id, full_name, email')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .then(({ data }) => {
          if (data) setCashiers(data);
        })
    );
  }, [orgId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const defaultFrom = new Date();
      defaultFrom.setDate(defaultFrom.getDate() - 30);
      defaultFrom.setHours(0, 0, 0, 0);

      const defaultTo = new Date();
      defaultTo.setHours(23, 59, 59, 999);

      const queryFrom = filterDateFrom ? new Date(filterDateFrom).toISOString() : defaultFrom.toISOString();
      const queryTo = filterDateTo ? new Date(filterDateTo + 'T23:59:59.999Z').toISOString() : defaultTo.toISOString();

      const [cur, list, pend] = await Promise.all([
        getCurrentShiftFromBalance({ stationId }).catch(() => null),
        listSalesShiftGroups({
          stationId,
          from: queryFrom,
          to: queryTo,
          limit: 150,
          includeCurrent: false,
        }).catch(() => []),
        canReview
          ? listPendingShiftReports({ stationId }).catch(() => [])
          : Promise.resolve([]),
      ]);
      setCurrent(cur);
      setShifts(list);
      setPending(pend);
    } catch (e) {
      setErr(e?.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [stationId, canReview, filterDateFrom, filterDateTo]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const handleUpdate = () => reload();
    window.addEventListener('fingas-data-changed', handleUpdate);
    return () => window.removeEventListener('fingas-data-changed', handleUpdate);
  }, [reload]);

  // Attach reconcile report (shift_reports rows) to balance-shifts by ShiftKey.
  // Declared early so filteredShifts can read it without TDZ issues.
  const [reportByKey, setReportByKey] = useState(new Map());

  const filteredShifts = useMemo(() => {
    let result = shifts;

    // IF operator/cashier, only show their own shifts!
    const isOperator = user?.profile?.role === 'operator';
    if (isOperator) {
      result = result.filter((s) => {
        // 1. If there's a shift report in reportByKey, match by operator_user_id
        const report = reportByKey.get(s.shiftKey);
        if (report) {
          return report.operator_user_id === user.id;
        }
        // 2. If no report yet, match by operator name/email
        const myName = user?.profile?.full_name?.toLowerCase();
        const myEmail = user?.email?.toLowerCase();
        const opFinal = s.operatorFinal?.toLowerCase() || '';
        const opOrig = s.operatorOriginal?.toLowerCase() || '';
        
        return (
          (myName && (opFinal.includes(myName) || opOrig.includes(myName))) ||
          (myEmail && (opFinal.includes(myEmail) || opOrig.includes(myEmail))) ||
          // Or if it is the current open shift that they are working on
          (current?.shiftKey === s.shiftKey)
        );
      });
    }

    if (filterCashier) {
      const p = cashiers.find((c) => c.user_id === filterCashier || c.id === filterCashier);
      if (p) {
        const name = p.full_name?.toLowerCase() || p.email?.toLowerCase();
        result = result.filter(
          (s) =>
            s.operatorFinal?.toLowerCase().includes(name) ||
            s.operatorOriginal?.toLowerCase().includes(name)
        );
      }
    }
    if (filterShiftKey) {
      result = result.filter(
        (s) =>
          String(s.shiftKey).includes(filterShiftKey) ||
          s.mergedKeys?.some((k) => String(k).includes(filterShiftKey))
      );
    }
    return result;
  }, [shifts, filterCashier, filterShiftKey, cashiers, user, reportByKey, current]);

  async function approve(reportId, decision) {
    setReviewing(reportId);
    try {
      await reviewShiftReport(reportId, decision);
      await reload();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось обновить статус');
    } finally {
      setReviewing(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      const keys = shifts.flatMap((s) => s.mergedKeys ?? [s.shiftKey]);
      if (keys.length === 0) { setReportByKey(new Map()); return; }
      const uniq = [...new Set(keys)];
      const { data } = await import('@/lib/supabaseClient').then(({ supabase }) =>
        supabase
          .from('shift_reports')
          .select('*')
          .in('external_shift_key', uniq),
      );
      if (cancelled) return;
      const m = new Map();
      for (const r of data ?? []) m.set(r.external_shift_key, r);
      setReportByKey(m);
    }
    fetchReports();
    return () => { cancelled = true; };
  }, [shifts]);

  const totals = useMemo(() => {
    let revenue = 0, liters = 0, parts = 0;
    for (const s of filteredShifts) {
      revenue += s.revenue;
      liters += s.liters;
      parts += s.parts;
    }
    return { revenue, liters, parts };
  }, [filteredShifts]);

  return (
    <PullToRefresh onRefresh={reload}>
    <div className="space-y-3 pb-2">
      <ScreenHeader
        title="Смены"
        subtitle={user?.profile?.role === 'operator' ? 'Список моих рабочих смен и отчетов' : 'Все смены и сданные отчеты АСУ'}
      />

      {err && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      )}

      {/* CURRENT SHIFT */}
      {current && !filterCashier && !filterShiftKey && !isOperator ? (
        <CurrentShiftHero
          shift={current}
          report={reportForShift(reportByKey, current)}
          canReconcile={canReconcile}
          canRenameOperator={canRenameOperator}
          onCloseout={() => setCloseoutShift(current)}
          onViewReport={() => {
            const r = reportForShift(reportByKey, current);
            if (r) setViewReport(r);
          }}
          onEditOperator={() => setEditingOperator(current)}
        />
      ) : null}

      {/* PENDING */}
      {canReview && pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-warning font-bold">
              На утверждении
            </div>
            <Badge tone="warning">{pending.length}</Badge>
          </div>
          <div className="space-y-2">
            {pending.map((r) => (
              <PendingCard
                key={r.id}
                report={r}
                reviewing={reviewing === r.id}
                onApprove={() => approve(r.id, 'approved')}
                onReject={() => approve(r.id, 'rejected')}
                onOpen={() => setViewReport(r)}
              />
            ))}
          </div>
        </div>
      )}

      {/* HISTORY */}
      <Card className="!p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line/30 pb-3 mb-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">
              История смен
            </div>
            <div className="text-base font-semibold text-ink mt-0.5 truncate">
              {loading ? '…' : `${filteredShifts.length} смен · ${formatMoney(totals.revenue)}`}
            </div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              {formatLiters(totals.liters)} · {totals.parts > filteredShifts.length ? `${totals.parts} частей собрано` : 'без разрывов'}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
            {/* Date Pickers Inline */}
            <div className="flex items-center gap-1 bg-bg-elevated/45 border border-line/40 rounded-xl px-2 py-1">
              <span className="text-[9px] text-ink-soft uppercase font-bold">С</span>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="bg-transparent text-xs text-ink font-semibold focus:outline-none w-[94px]"
              />
              <span className="text-[9px] text-ink-soft uppercase font-bold ml-1">По</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="bg-transparent text-xs text-ink font-semibold focus:outline-none w-[94px]"
              />
            </div>

            {/* Icon filter button next to it */}
            <CollapsibleFilters
              activeCount={(filterCashier ? 1 : 0) + (filterShiftKey ? 1 : 0)}
              onReset={() => {
                setFilterCashier('');
                setFilterShiftKey('');
              }}
            >
              <div className={user?.profile?.role === 'operator' ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-3'}>
                {user?.profile?.role !== 'operator' ? (
                  <Select
                    label="Кассир"
                    value={filterCashier}
                    onChange={(e) => setFilterCashier(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  >
                    <option value="">Все кассиры</option>
                    {cashiers.map((c) => (
                      <option key={c.id} value={c.user_id}>
                        {c.full_name || c.email}
                      </option>
                    ))}
                  </Select>
                ) : null}

                <Input
                  label="№ Смены"
                  placeholder="Поиск по номеру"
                  value={filterShiftKey}
                  onChange={(e) => setFilterShiftKey(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </CollapsibleFilters>
          </div>
        </div>

        <div className="relative min-h-[120px]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-card/60 backdrop-blur-[1px] rounded-xl transition-opacity duration-200">
              <div className="flex flex-col items-center gap-2">
                <svg className="animate-spin h-6 w-6 text-brand-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-[10px] uppercase tracking-widest text-ink-muted font-bold">Загрузка смен...</span>
              </div>
            </div>
          )}

          <div className={loading ? 'opacity-40 space-y-1.5 pointer-events-none transition-opacity duration-200' : 'space-y-1.5 transition-opacity duration-200'}>
            {filteredShifts.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="За период смен нет"
                description="Смены появятся, когда АСУ отправит данные в систему."
              />
            ) : (
              filteredShifts.map((s) => (
                <ShiftRow
                  key={s.shiftKey}
                  shift={s}
                  report={reportForShift(reportByKey, s)}
                  canReconcile={canReconcile}
                  canRenameOperator={canRenameOperator}
                  onCloseout={() => setCloseoutShift(s)}
                  onOpenReport={() => {
                    const r = reportForShift(reportByKey, s);
                    if (r) setViewReport(r);
                  }}
                  onEditReport={() => {
                    const r = reportForShift(reportByKey, s);
                    if (r) setEditReport(r);
                  }}
                  onEditOperator={() => setEditingOperator(s)}
                />
              ))
            )}
          </div>
        </div>
      </Card>

      <CloseoutSheet
        shift={closeoutShift}
        organizationId={orgId}
        stationId={stationId}
        onClose={() => setCloseoutShift(null)}
        onDone={async () => {
          const just = closeoutShift?.shiftKey;
          setCloseoutShift(null);
          if (just != null) {
            const rep = await getShiftReportByKey(just).catch(() => null);
            if (rep) setViewReport(rep);
          }
          await reload();
        }}
      />

      <ReportSheet report={viewReport} onClose={() => setViewReport(null)} />

      <EditReportSheet
        report={editReport}
        organizationId={orgId}
        stationId={stationId}
        cashiers={cashiers}
        onClose={() => setEditReport(null)}
        onDone={async () => {
          setEditReport(null);
          await reload();
        }}
      />

      <OperatorSheet
        shift={editingOperator}
        organizationId={orgId}
        stationId={stationId}
        onClose={() => setEditingOperator(null)}
        onDone={async () => { setEditingOperator(null); await reload(); }}
      />
    </div>
    </PullToRefresh>
  );
}


function reportForShift(reportByKey, shift) {
  if (!shift) return null;
  const keys = shift.mergedKeys ?? [shift.shiftKey];
  for (const k of keys) {
    const r = reportByKey.get(k);
    if (r) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
function CurrentShiftHero({ shift, report, canReconcile, canRenameOperator, onCloseout, onViewReport, onEditOperator }) {
  const fuelEntries = Object.entries(shift.fuels ?? {}).sort((a, b) => b[1].liters - a[1].liters);
  const totalLiters = shift.liters || 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-success/40 bg-gradient-to-br from-success/20 via-success/5 to-bg-soft p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-success font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            Идёт сейчас
          </div>
          <div className="mt-1 text-2xl font-bold text-ink tabular-nums truncate">
            {formatMoney(shift.revenue)}
          </div>
          <OperatorLine
            shift={shift}
            canEdit={canRenameOperator}
            onEdit={onEditOperator}
          />
        </div>
        <Badge tone="success">#{shift.shiftKey}{shift.parts > 1 ? ` (×${shift.parts})` : ''}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="Литры" value={formatLiters(shift.liters)} />
        <Stat label="Открыта" value={shift.firstAt ? new Date(shift.firstAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'} />
        <Stat label="Длит." value={durationBetween(shift.firstAt, shift.lastAt)} />
      </div>

      {fuelEntries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-success/20 space-y-1.5">
          {fuelEntries.slice(0, 4).map(([fuel, v]) => {
            const pct = (v.liters / totalLiters) * 100;
            return (
              <div key={fuel}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink truncate flex items-center gap-1 min-w-0">
                    <Fuel className="w-3 h-3 text-ink-soft flex-shrink-0" /> {fuel}
                  </span>
                  <span className="text-ink-muted tabular-nums">
                    {formatLiters(v.liters)} · {formatMoney(v.revenue)}
                  </span>
                </div>
                <div className="mt-0.5 h-1 rounded-full bg-bg-elevated overflow-hidden">
                  <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {report ? (
          <Button size="sm" variant="secondary" className="h-9 text-xs" onClick={onViewReport}>
            <CheckCircle2 className="w-4 h-4" /> Отчёт сдан
          </Button>
        ) : canReconcile ? (
          <Button size="sm" className="h-9 text-xs" onClick={onCloseout}>
            <Square className="w-4 h-4" /> Сверка / закрытие
          </Button>
        ) : (
          <Button size="sm" variant="secondary" className="h-9 text-xs" disabled>
            <Square className="w-4 h-4" /> Сверка
          </Button>
        )}
        <div className="rounded-2xl bg-bg-elevated/50 border border-line/40 px-3 py-2 text-[10px] text-ink-muted flex items-center justify-center text-center">
          Открывается автоматически в АСУ
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
function ShiftRow({ shift, report, canReconcile, canRenameOperator, onCloseout, onOpenReport, onEditReport, onEditOperator }) {
  const status = report?.result_status;
  const diff = Number(report?.total_difference ?? 0);
  const statusTone =
    !report ? 'default' :
    status === 'ok' ? 'success' :
    status === 'overage' ? 'warning' :
    status === 'shortage' ? 'danger' : 'info';
  const statusLabel =
    !report ? 'без сверки' :
    status === 'ok' ? 'сошлось' :
    status === 'overage' ? `+${Math.round(Math.abs(diff))}` :
    status === 'shortage' ? `−${Math.round(Math.abs(diff))}` :
    'submitted';

  return (
    <div className="rounded-xl bg-bg-elevated/60 border border-line/40 px-3 py-2.5 min-w-0">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink tabular-nums truncate">
            #{shift.shiftKey}
            {shift.parts > 1 && (
              <span title="Объединено из частей" className="inline-flex items-center gap-0.5 text-[10px] text-info">
                <Layers className="w-3 h-3" />×{shift.parts}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={canRenameOperator ? onEditOperator : undefined}
            disabled={!canRenameOperator}
            className={
              'mt-0.5 inline-flex items-center gap-1 text-[11px] truncate text-left ' +
              (canRenameOperator ? 'text-ink-muted hover:text-ink' : 'text-ink-muted')
            }
          >
            <span className="truncate">{shift.operatorFinal || '—'}</span>
            {shift.operatorOverride && shift.operatorOverride !== shift.operatorOriginal && (
              <Badge tone="info">правка</Badge>
            )}
            {canRenameOperator && <Pencil className="w-2.5 h-2.5 flex-shrink-0" />}
          </button>
          <div className="text-[10px] text-ink-soft truncate">
            {shift.firstAt
              ? `${formatDateTime(shift.firstAt)} → ${new Date(shift.lastAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
              : 'без даты'}
          </div>
        </div>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <MetricCell label="Выручка" value={formatMoney(shift.revenue)} bold />
        <MetricCell label="Литры" value={formatLiters(shift.liters)} />
        <MetricCell label="Чеки" value={shift.count.toLocaleString('ru-RU')} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {report ? (
          <Button size="sm" variant="ghost" className="h-7 !px-1 text-[10px] whitespace-nowrap" onClick={onOpenReport}>
            Отчёт <ChevronRight className="w-2.5 h-2.5 ml-0.5" />
          </Button>
        ) : (
          <span />
        )}
        {report && canRenameOperator ? (
          <Button size="sm" variant="ghost" className="h-7 !px-1 text-[10px] whitespace-nowrap" onClick={onEditReport}>
            <Pencil className="w-2.5 h-2.5 mr-0.5" /> Изменить
          </Button>
        ) : (
          <span />
        )}
        {!report && canReconcile ? (
          <Button size="sm" variant="secondary" className="h-7 text-[11px] whitespace-nowrap" onClick={onCloseout}>
            Сверка
          </Button>
        ) : report && report.approved_at == null ? (
          <Badge tone="warning" className="text-[9px] h-7 flex items-center justify-center">ожидает</Badge>
        ) : report?.approved_at ? (
          <Badge tone="success" className="text-[9px] h-7 flex items-center justify-center">утверждена</Badge>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function OperatorLine({ shift, canEdit, onEdit }) {
  const original = shift.operatorOriginal ?? '—';
  const final = shift.operatorFinal ?? original;
  const corrected = shift.operatorOverride && shift.operatorOverride.trim();
  return (
    <button
      type="button"
      onClick={canEdit ? onEdit : undefined}
      disabled={!canEdit}
      className={
        'mt-1 inline-flex items-center gap-1.5 text-xs truncate text-left ' +
        (canEdit ? 'text-ink-muted hover:text-ink' : 'text-ink-muted')
      }
    >
      <span className="truncate">{final}</span>
      {corrected && <Badge tone="info">правка</Badge>}
      {canEdit && <Pencil className="w-3 h-3 flex-shrink-0" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
function PendingCard({ report, reviewing, onApprove, onReject, onOpen }) {
  const diff = Number(report.total_difference ?? 0);
  return (
    <Card className="!p-3 border-warning/40">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink tabular-nums truncate">
            Смена #{report.external_shift_key}
          </div>
          <div className="text-[10px] text-ink-muted truncate">
            {formatDateTime(report.submitted_at)}
          </div>
        </div>
        <Badge tone={
          report.result_status === 'ok' ? 'success' :
          report.result_status === 'shortage' ? 'danger' :
          report.result_status === 'overage' ? 'warning' : 'info'
        }>
          {report.result_status === 'ok' ? 'сошлось' :
           report.result_status === 'shortage' ? 'недостача' :
           report.result_status === 'overage' ? 'излишек' :
           report.result_status === 'rejected' ? 'отклонен' : 'на проверке'}
        </Badge>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px] border-t border-line/30 pt-2">
        <MetricCell label="Факт" value={formatMoney(report.actual_total)} />
        <MetricCell label="Ожидалось" value={formatMoney(report.expected_total)} />
        <MetricCell
          label={diff >= 0 ? 'Излишек' : 'Недостача'}
          value={formatMoney(Math.abs(diff))}
          tone={diff >= 0 ? 'success' : 'danger'}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={onOpen}>
          Открыть
        </Button>
        <Button size="sm" variant="secondary" className="h-8 text-[11px]" loading={reviewing} onClick={onReject}>
          <XCircle className="w-3.5 h-3.5" /> Отклонить
        </Button>
        <Button size="sm" className="h-8 text-[11px]" loading={reviewing} onClick={onApprove}>
          <Check className="w-3.5 h-3.5" /> Утвердить
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function CloseoutSheet({ shift, organizationId, stationId, onClose, onDone }) {
  const [form, setForm] = useState({
    actual_cash: '', actual_card: '', actual_qr: '', actual_coupons: '',
    collection_total: '', cash_remaining: '', comment: '',
  });
  // Построчные доходы/расходы за смену
  const [lines, setLines] = useState([]); // {tmpId, kind, category, amount, payment_type, note}
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (shift) {
      setForm({
        actual_cash: '', actual_card: '', actual_qr: '', actual_coupons: '',
        collection_total: '', cash_remaining: '', comment: '',
      });
      setLines([]);
      setErr('');
    }
  }, [shift]);

  const total = ['actual_cash', 'actual_card', 'actual_qr', 'actual_coupons']
    .reduce((s, k) => s + (Number(form[k]) || 0), 0);

  const expenseLines = lines.filter((l) => l.kind === 'expense');
  const incomeLines  = lines.filter((l) => l.kind === 'income');
  const expensesTotal = expenseLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const incomeTotal   = incomeLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  function addLine(kind) {
    setLines((prev) => [
      ...prev,
      { tmpId: `tmp-${Date.now()}-${Math.random()}`, kind, category: '', amount: '', payment_type: 'cash', note: '' },
    ]);
  }
  function patchLine(id, patch) {
    setLines((prev) => prev.map((l) => (l.tmpId === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id) {
    setLines((prev) => prev.filter((l) => l.tmpId !== id));
  }

  async function submit() {
    if (!shift) return;
    if (total <= 0) { setErr('Введите хотя бы одну фактическую сумму выручки'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        actual_cash:      Number(form.actual_cash)      || 0,
        actual_card:      Number(form.actual_card)      || 0,
        actual_qr:        Number(form.actual_qr)        || 0,
        actual_coupons:   Number(form.actual_coupons)   || 0,
        actual_total:     total,
        expenses_total:   expensesTotal,
        income_total:     incomeTotal,
        collection_total: Number(form.collection_total) || 0,
        cash_remaining:   Number(form.cash_remaining)   || 0,
        comment:          form.comment || null,
      };
      const reportId = await closeoutByShiftKey(shift.shiftKey, payload);
      // Сохраняем построчные доходы/расходы.
      if (reportId && lines.length > 0) {
        const toSave = lines
          .filter((l) => Number(l.amount) > 0)
          .map((l) => ({
            tmpId: l.tmpId,
            kind: l.kind,
            category: l.category,
            amount: l.amount,
            payment_type: l.payment_type,
            note: l.note,
          }));
        if (toSave.length > 0) {
          await saveShiftReportLines(reportId, organizationId, stationId, toSave);
        }
      }
      onDone?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  if (!shift) return <FormSheet open={false} onClose={onClose} title="" />;

  const netCash = (Number(form.actual_cash) || 0) - expensesTotal + incomeTotal - (Number(form.collection_total) || 0);

  return (
    <FormSheet
      open={!!shift}
      onClose={onClose}
      title={`Отчёт смены #${shift.shiftKey}`}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Сдать отчёт"
    >
      {/* Большая сводка сверху */}
      <div className="rounded-3xl bg-gradient-to-br from-brand-500/10 via-bg-card to-success/5 border border-brand-500/20 p-4 shadow-sm">
        <div className="text-[10px] uppercase tracking-[0.22em] text-ink-soft font-bold">Итого выручка</div>
        <div className="mt-1 text-3xl font-extrabold text-ink tabular-nums tracking-tight">
          {formatMoney(total)}
        </div>
        <div className="mt-1 text-[11px] text-ink-soft">
          Расходы {formatMoney(expensesTotal)} · Приходы {formatMoney(incomeTotal)} · Инкассация {formatMoney(Number(form.collection_total) || 0)}
        </div>
      </div>

      <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-warning/90 leading-relaxed">
          <span className="font-bold">Слепой ввод.</span>{' '}
          Введите фактические суммы. Система сама посчитает расхождение с данными АСУ.
        </div>
      </div>

      {/* 1. Выручка по типам оплат */}
      <SectionCard num="1" icon={Coins} title="Выручка по типам оплат">
        <div className="grid grid-cols-2 gap-2.5">
          <MoneyField label="Наличные"  value={form.actual_cash}    onChange={(v) => setForm({ ...form, actual_cash:    v })} accent="success" />
          <MoneyField label="Карта"     value={form.actual_card}    onChange={(v) => setForm({ ...form, actual_card:    v })} accent="info" />
          <MoneyField label="QR"        value={form.actual_qr}      onChange={(v) => setForm({ ...form, actual_qr:      v })} accent="brand" />
          <MoneyField label="Талоны"    value={form.actual_coupons} onChange={(v) => setForm({ ...form, actual_coupons: v })} accent="warning" />
        </div>
        <TotalRow label="Всего по оплатам" value={total} tone="success" />
      </SectionCard>

      {/* 2. Расходы по смене */}
      <ShiftLinesEditor
        num="2"
        kind="expense"
        title="Расходы по смене"
        emptyHint="Любая выдача из кассы — отдельная строка. Бывают: топливо за нал, мелкий ремонт, з/п, командировочные."
        suggestions={['Топливо', 'Ремонт', 'Запчасти', 'З/п', 'Услуги', 'Хозтовары', 'Прочее']}
        lines={expenseLines}
        total={expensesTotal}
        onAdd={() => addLine('expense')}
        onPatch={patchLine}
        onRemove={removeLine}
      />

      {/* 3. Прочие приходы */}
      <ShiftLinesEditor
        num="3"
        kind="income"
        title="Прочие приходы"
        optional
        emptyHint="Возвраты от поставщиков, найденные деньги, прочие поступления — не относящиеся к продажам топлива."
        suggestions={['Возврат', 'Доплата', 'Прочее']}
        lines={incomeLines}
        total={incomeTotal}
        onAdd={() => addLine('income')}
        onPatch={patchLine}
        onRemove={removeLine}
      />

      {/* 4. Касса */}
      <SectionCard num="4" icon={Banknote} title="Касса">
        <div className="grid grid-cols-2 gap-2.5">
          <MoneyField
            label="Инкассация"
            value={form.collection_total}
            onChange={(v) => setForm({ ...form, collection_total: v })}
            accent="info"
            hint="Сдали инкассаторам / руководству"
          />
          <MoneyField
            label="Остаток в кассе"
            value={form.cash_remaining}
            onChange={(v) => setForm({ ...form, cash_remaining: v })}
            accent="default"
            hint="На начало следующей смены"
          />
        </div>

        {/* Авто-расчёт ожидаемого остатка */}
        <div className={
          'rounded-xl border p-3 flex items-center justify-between text-xs ' +
          (Math.abs(netCash - (Number(form.cash_remaining) || 0)) < 1
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-bg-elevated/60 border-line/40 text-ink-muted')
        }>
          <span>Чистый нал = касса − расход + приход − инкассация</span>
          <span className="font-bold tabular-nums">{formatMoney(netCash)}</span>
        </div>

        <div>
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink mb-1.5">Комментарий к смене</span>
            <textarea
              rows={3}
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="Что-то особенное, объяснения расхождений..."
              className="block w-full px-4 py-2.5 rounded-2xl bg-bg-elevated/70 border border-line/50 text-[14px] text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-all resize-none"
            />
          </label>
        </div>
      </SectionCard>
    </FormSheet>
  );
}

// --- Reusable building blocks ---

function SectionCard({ num, icon: Icon, title, children, accentTone = 'brand' }) {
  const dot =
    accentTone === 'danger'  ? 'bg-danger/15 text-danger border-danger/25' :
    accentTone === 'success' ? 'bg-success/15 text-success border-success/25' :
                                'bg-brand-500/15 text-brand-400 border-brand-500/25';
  return (
    <div className="rounded-3xl border border-line/50 bg-bg-card/70 backdrop-blur-md p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        {num && (
          <span className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-extrabold ${dot}`}>
            {num}
          </span>
        )}
        {Icon && <Icon className="w-4 h-4 text-ink-soft" />}
        <span className="text-sm font-bold text-ink">{title}</span>
      </div>
      {children}
    </div>
  );
}

function MoneyField({ label, value, onChange, accent = 'default', hint }) {
  const ring =
    accent === 'success' ? 'focus-within:border-success focus-within:ring-success/15' :
    accent === 'info'    ? 'focus-within:border-info focus-within:ring-info/15' :
    accent === 'brand'   ? 'focus-within:border-brand-500 focus-within:ring-brand-500/15' :
    accent === 'warning' ? 'focus-within:border-warning focus-within:ring-warning/15' :
                           'focus-within:border-brand-500 focus-within:ring-brand-500/15';
  const dot =
    accent === 'success' ? 'bg-success' :
    accent === 'info'    ? 'bg-info' :
    accent === 'brand'   ? 'bg-brand-500' :
    accent === 'warning' ? 'bg-warning' :
                           'bg-ink-soft';
  return (
    <label className={`block rounded-2xl border border-line/40 bg-bg-elevated/50 p-2.5 focus-within:ring-4 transition-all ${ring}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-[10px] uppercase tracking-wider text-ink-soft font-bold">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-lg font-bold text-ink tabular-nums focus:outline-none placeholder:text-ink-soft/40"
        />
        <span className="text-[10px] text-ink-soft font-semibold">сом</span>
      </div>
      {hint && <div className="text-[9px] text-ink-soft mt-0.5">{hint}</div>}
    </label>
  );
}

function TotalRow({ label, value, tone = 'default' }) {
  const color =
    tone === 'success' ? 'text-success' :
    tone === 'danger'  ? 'text-danger'  :
    tone === 'brand'   ? 'text-brand-400' : 'text-ink';
  return (
    <div className="rounded-xl bg-bg-card border border-brand-500/20 px-3 py-2.5 flex items-center justify-between shadow-inner">
      <span className="text-[11px] uppercase tracking-wider text-ink-muted font-bold">{label}</span>
      <span className={`text-base font-extrabold tabular-nums ${color}`}>{formatMoney(value)}</span>
    </div>
  );
}

const PAYMENT_TYPES = [
  { id: 'cash', label: 'Нал' },
  { id: 'card', label: 'Карта' },
  { id: 'qr',   label: 'QR' },
  { id: 'bank', label: 'Банк' },
];

function ShiftLinesEditor({ num, kind, title, emptyHint, suggestions = [], lines, total, optional = false, onAdd, onPatch, onRemove }) {
  const isExp = kind === 'expense';
  const accentTone = isExp ? 'danger' : 'success';
  const accentText = isExp ? 'text-danger' : 'text-success';
  return (
    <div className="rounded-3xl border border-line/50 bg-bg-card/70 backdrop-blur-md p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {num && (
            <span className={
              'w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-extrabold ' +
              (isExp
                ? 'bg-danger/15 text-danger border-danger/25'
                : 'bg-success/15 text-success border-success/25')
            }>
              {num}
            </span>
          )}
          <div>
            <div className="text-sm font-bold text-ink">{title}</div>
            {optional && <div className="text-[10px] text-ink-soft uppercase tracking-wider">опционально</div>}
          </div>
        </div>
        <Button type="button" size="sm" variant={isExp ? 'danger' : 'success'} className="h-8 text-[11px] !px-3" onClick={onAdd}>
          + Добавить
        </Button>
      </div>

      {lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line/40 bg-bg-elevated/30 p-3 text-[11px] text-ink-soft text-center leading-relaxed">
          {emptyHint}
        </div>
      ) : (
        <div className="space-y-2.5">
          {lines.map((l, idx) => (
            <div key={l.tmpId} className="rounded-2xl border border-line/40 bg-bg-elevated/40 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-ink-soft font-bold">Строка #{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => onRemove(l.tmpId)}
                  className="w-7 h-7 rounded-lg border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 transition-colors flex items-center justify-center"
                  aria-label="Удалить строку"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider text-ink-soft font-bold mb-1">Категория</span>
                  <input
                    type="text"
                    value={l.category}
                    onChange={(e) => onPatch(l.tmpId, { category: e.target.value })}
                    placeholder={isExp ? 'Что/кому' : 'Источник прихода'}
                    className="block w-full h-10 px-3 rounded-xl bg-bg-card border border-line/40 text-sm text-ink placeholder:text-ink-soft/50 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider text-ink-soft font-bold mb-1">Сумма</span>
                  <div className="flex items-baseline gap-1 h-10 px-3 rounded-xl bg-bg-card border border-line/40 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 min-w-[110px]">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01" min="0"
                      placeholder="0"
                      value={l.amount}
                      onChange={(e) => onPatch(l.tmpId, { amount: e.target.value })}
                      className={`flex-1 min-w-0 bg-transparent text-base font-bold tabular-nums focus:outline-none placeholder:text-ink-soft/40 ${accentText}`}
                    />
                    <span className="text-[10px] text-ink-soft font-semibold">сом</span>
                  </div>
                </label>
              </div>

              {suggestions.length > 0 && !l.category && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onPatch(l.tmpId, { category: s })}
                      className="h-6 px-2 rounded-full text-[10px] font-semibold border border-line/40 bg-bg-card text-ink-muted hover:text-ink hover:border-brand-500/40 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-1.5">
                {PAYMENT_TYPES.map((pt) => {
                  const active = (l.payment_type || 'cash') === pt.id;
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => onPatch(l.tmpId, { payment_type: pt.id })}
                      className={
                        'flex-1 h-8 rounded-lg text-[10px] font-bold border transition-colors ' +
                        (active
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-bg-card text-ink-muted border-line/40 hover:border-brand-500/30')
                      }
                    >
                      {pt.label}
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={l.note}
                onChange={(e) => onPatch(l.tmpId, { note: e.target.value })}
                placeholder="Комментарий"
                className="block w-full h-9 px-3 rounded-xl bg-bg-card border border-line/40 text-xs text-ink placeholder:text-ink-soft/50 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
              />
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <TotalRow label={`Итого ${isExp ? 'расходы' : 'приходы'}`} value={total} tone={accentTone === 'danger' ? 'danger' : 'success'} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ReportSheet({ report, onClose }) {
  if (!report) return <FormSheet open={false} onClose={onClose} title="" />;
  const totalDiff = Number(report.total_difference ?? 0);
  const cashDiff  = Number(report.cash_difference ?? 0);
  const cardDiff  = Number(report.actual_card ?? 0) - Number(report.expected_card ?? 0);
  const qrDiff    = Number(report.actual_qr ?? 0) - Number(report.expected_qr ?? 0);

  return (
    <FormSheet
      open={!!report}
      onClose={onClose}
      title={`Сменный отчет ${report.external_shift_key != null ? `#${report.external_shift_key}` : ''}`}
      onSubmit={onClose}
      submitLabel="Готово"
    >
      {/* 1. Glowing Discrepancy Medallion */}
      <div className="rounded-2xl border border-brand-500/20 bg-bg-card p-4 relative overflow-hidden flex items-center justify-between shadow-sm">
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
        <div className="relative">
          <span className="text-[10px] uppercase tracking-wider text-brand-400 font-bold block">Сводный баланс смены</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-xl font-black ${totalDiff >= 0 ? 'text-success' : 'text-danger'}`}>
              {totalDiff > 0 ? '+' : ''}{formatMoney(totalDiff)}
            </span>
          </div>
          <span className="text-[9px] text-ink-soft block mt-0.5">Общее расхождение по смене</span>
        </div>

        <div className="text-right relative">
          <span className="text-[9px] text-ink-soft uppercase tracking-wider block">Объем пролива</span>
          <span className="text-sm font-extrabold text-ink mt-0.5 block">{Number(report.expected_liters ?? 0).toLocaleString('ru-RU')} л</span>
          <span className="text-[9px] text-ink-soft block mt-0.5">Данные из АСУ счетчиков</span>
        </div>
      </div>

      {/* 2. Reconciled Revenue Comparison Table */}
      <div className="rounded-2xl border border-line/45 bg-bg-elevated/45 p-3.5 space-y-3">
        <div className="text-[10px] uppercase tracking-wider text-ink-soft font-bold border-b border-line/30 pb-2">
          Сравнение выручки АСУ и Факт
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-line/30 text-ink-soft font-medium">
                <th className="pb-2">Метод</th>
                <th className="pb-2 text-right">Факт</th>
                <th className="pb-2 text-right">АСУ</th>
                <th className="pb-2 text-right">Разница</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/20">
              <ReconciledRow label="💵 Наличные" actual={report.actual_cash} expected={report.expected_cash} diff={cashDiff} />
              <ReconciledRow label="💳 Карты" actual={report.actual_card} expected={report.expected_card} diff={cardDiff} />
              <ReconciledRow label="📱 QR-оплаты" actual={report.actual_qr} expected={report.expected_qr} diff={qrDiff} />
              <ReconciledRow label="🎟️ Талоны" actual={report.actual_coupons} expected={0} diff={report.actual_coupons} />
              <tr className="font-extrabold text-ink bg-bg-card/40">
                <td className="py-2.5 pl-1.5 rounded-l-xl">Итого</td>
                <td className="py-2.5 text-right">{formatMoney(report.actual_total)}</td>
                <td className="py-2.5 text-right">{formatMoney(report.expected_total)}</td>
                <td className={`py-2.5 text-right pr-1.5 rounded-r-xl ${totalDiff >= 0 ? 'text-success' : 'text-danger'}`}>
                  {totalDiff > 0 ? '+' : ''}{formatMoney(totalDiff)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Cash Flow Metrics Cards */}
      <div className="grid grid-cols-3 gap-2">
        <MiniMetricCard label="Расходы" value={formatMoney(report.expenses_total ?? 0)} icon={Coins} />
        <MiniMetricCard label="Инкассация" value={formatMoney(report.collection_total ?? 0)} icon={Banknote} />
        <MiniMetricCard label="Остаток кассы" value={formatMoney(report.cash_remaining ?? 0)} icon={Wallet} />
      </div>

      {/* 4. Metadata Comments Block */}
      {report.comment && (
        <div className="rounded-2xl bg-bg-elevated border border-line p-3 text-xs text-ink-muted italic border-l-4 border-l-brand-500/60 pl-4 bg-brand-500/[0.02] leading-relaxed">
          &ldquo;{report.comment}&rdquo;
        </div>
      )}

      {/* 5. Status & Footer Block */}
      <div className="flex items-center justify-between text-xs border-t border-line/35 pt-3">
        <div className="text-ink-soft">
          Статус: <Badge tone={report.result_status === 'approved' ? 'success' : report.result_status === 'rejected' ? 'danger' : 'brand'}>
            {report.result_status === 'approved' ? 'Утвержден' : report.result_status === 'rejected' ? 'Отклонен' : 'На проверке'}
          </Badge>
        </div>
        {report.approved_at && (
          <span className="text-[10px] text-ink-soft">
            Утвержден: {formatDateTime(report.approved_at)}
          </span>
        )}
      </div>
    </FormSheet>
  );
}

function ReconciledRow({ label, actual, expected, diff }) {
  return (
    <tr className="text-ink">
      <td className="py-2 font-medium">{label}</td>
      <td className="py-2 text-right tabular-nums">{formatMoney(actual)}</td>
      <td className="py-2 text-right tabular-nums">{formatMoney(expected)}</td>
      <td className={`py-2 text-right font-semibold tabular-nums ${
        diff > 0 ? 'text-success' : diff < 0 ? 'text-danger' : 'text-ink-soft'
      }`}>
        {diff > 0 ? '+' : ''}{formatMoney(diff)}
      </td>
    </tr>
  );
}

function MiniMetricCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-line/35 bg-bg-elevated/40 p-2.5 text-center flex flex-col items-center justify-center">
      <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center mb-1">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="text-[9px] text-ink-soft block uppercase font-bold tracking-wider">{label}</span>
      <span className="text-xs font-extrabold text-ink mt-0.5">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OPERATOR OVERRIDE SHEET
// ---------------------------------------------------------------------------
function OperatorSheet({ shift, organizationId, stationId, onClose, onDone }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (shift) {
      setName(shift.operatorOverride ?? '');
      setNote('');
      setErr('');
    }
  }, [shift]);

  if (!shift) return <FormSheet open={false} onClose={onClose} title="" />;

  async function save() {
    setSaving(true); setErr('');
    try {
      await setOperatorOverride({
        organizationId,
        stationId,
        shopKey: shift.shopKey,
        shiftKey: shift.shiftKey,
        correctedName: name,
        note,
      });
      onDone?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true); setErr('');
    try {
      await deleteOperatorOverride({
        organizationId,
        shopKey: shift.shopKey,
        shiftKey: shift.shiftKey,
      });
      onDone?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сбросить');
    } finally {
      setSaving(false);
    }
  }

  const hasOverride = !!shift.operatorOverride;

  return (
    <FormSheet
      open={!!shift}
      onClose={onClose}
      title="Имя оператора"
      onSubmit={save}
      saving={saving}
      error={err}
      submitLabel="Сохранить"
    >
      <div className="rounded-2xl bg-bg-elevated border border-line p-3 text-xs text-ink-muted">
        Оригинальное имя из АСУ: <span className="text-ink font-medium">{shift.operatorOriginal ?? '—'}</span>
      </div>
      <Input
        label="Скорректированное имя"
        placeholder={shift.operatorOriginal ?? 'ФИО оператора'}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        label="Комментарий (опц.)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="text-[11px] text-ink-soft">
        Будет применено к смене #{shift.shiftKey}. В отчётах: corrected || original.
      </div>
      {hasOverride && (
        <Button type="button" variant="ghost" size="sm" onClick={reset} loading={saving}>
          <Trash2 className="w-3.5 h-3.5" /> Убрать правку
        </Button>
      )}
    </FormSheet>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function Stat({ label, value, tone }) {
  const colour =
    tone === 'success' ? 'text-success' :
    tone === 'danger'  ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-xl bg-bg-elevated/50 border border-line/30 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-ink-soft">{label}</div>
      <div className={`text-xs font-semibold ${colour} tabular-nums truncate`}>{value}</div>
    </div>
  );
}

function MetricCell({ label, value, tone, bold }) {
  const colour =
    tone === 'success' ? 'text-success' :
    tone === 'danger'  ? 'text-danger' : 'text-ink';
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-ink-soft">{label}</div>
      <div className={`${bold ? 'text-sm font-bold' : 'text-xs font-semibold'} ${colour} tabular-nums truncate`}>
        {value}
      </div>
    </div>
  );
}

function ReportRow({ label, value, tone, bold }) {
  const colour =
    tone === 'success' ? 'text-success' :
    tone === 'danger'  ? 'text-danger' : 'text-ink';
  return (
    <div className="flex items-center justify-between rounded-2xl bg-bg-elevated border border-line px-4 py-2.5">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className={`${bold ? 'text-base font-bold' : 'text-sm font-semibold'} ${colour} tabular-nums`}>
        {value}
      </div>
    </div>
  );
}

function durationBetween(a, b) {
  if (!a || !b) return '—';
  const diff = new Date(b).getTime() - new Date(a).getTime();
  if (diff < 0) return '—';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

// ---------------------------------------------------------------------------
// NEW: EDIT REPORT SHEET FOR OWNER/MANAGER OVERRIDES
// ---------------------------------------------------------------------------
export function EditReportSheet({ report, organizationId, stationId, cashiers, onClose, onDone }) {
  const [form, setForm] = useState({
    actual_cash: 0, actual_card: 0, actual_qr: 0, actual_coupons: 0,
    expected_cash: 0, expected_card: 0, expected_qr: 0, expected_total: 0,
    expected_liters: 0, collection_total: 0, cash_remaining: 0,
    operator_user_id: '', comment: '',
  });
  const [lines, setLines] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (report && organizationId) {
      listShiftReportLines(report.id).then(setLines).catch(() => setLines([]));
      import('@/services/cashflowService').then(({ listWallets }) =>
        listWallets({ organizationId, active: true }).then(setWallets).catch(() => {})
      );
    }
  }, [report, organizationId]);

  useEffect(() => {
    if (report) {
      setForm({
        actual_cash: report.actual_cash ?? 0,
        actual_card: report.actual_card ?? 0,
        actual_qr: report.actual_qr ?? 0,
        actual_coupons: report.actual_coupons ?? 0,
        expected_cash: report.expected_cash ?? 0,
        expected_card: report.expected_card ?? 0,
        expected_qr: report.expected_qr ?? 0,
        expected_total: report.expected_total ?? 0,
        expected_liters: report.expected_liters ?? 0,
        collection_total: report.collection_total ?? 0,
        cash_remaining: report.cash_remaining ?? 0,
        operator_user_id: report.operator_user_id ?? '',
        comment: report.comment ?? '',
      });
      setErr('');
    }
  }, [report]);

  const activeLines = lines.filter((l) => !l._deleted);
  
  const actualTotal = Number(form.actual_cash) + Number(form.actual_card) + Number(form.actual_qr) + Number(form.actual_coupons);
  const cashDifference = Number(form.expected_cash) - Number(form.actual_cash);
  const totalDifference = Number(form.expected_total) - actualTotal;

  function addLine() {
    setLines([
      ...lines,
      {
        id: 'temp-' + Date.now(),
        kind: 'expense',
        category: 'Топливо',
        amount: '',
        wallet_id: wallets[0]?.id || '',
        counterparty_id: '',
        payment_type: 'cash',
        note: '',
      },
    ]);
  }

  function deleteLine(id) {
    setLines(lines.map((l) => (l.id === id ? { ...l, _deleted: true } : l)));
  }

  function updateLine(id, key, val) {
    setLines(lines.map((l) => (l.id === id ? { ...l, [key]: val } : l)));
  }

  async function submit(e) {
    e?.preventDefault?.();
    if (!report) return;
    setSaving(true); setErr('');
    try {
      await saveShiftReportLines(report.id, organizationId, stationId, lines);

      const patch = {
        actual_cash: Number(form.actual_cash) || 0,
        actual_card: Number(form.actual_card) || 0,
        actual_qr: Number(form.actual_qr) || 0,
        actual_coupons: Number(form.actual_coupons) || 0,
        actual_total: actualTotal,
        expected_cash: Number(form.expected_cash) || 0,
        expected_card: Number(form.expected_card) || 0,
        expected_qr: Number(form.expected_qr) || 0,
        expected_total: Number(form.expected_total) || 0,
        expected_liters: Number(form.expected_liters) || 0,
        cash_difference: cashDifference,
        total_difference: totalDifference,
        collection_total: Number(form.collection_total) || 0,
        cash_remaining: Number(form.cash_remaining) || 0,
        operator_user_id: form.operator_user_id || null,
        comment: form.comment || null,
      };

      await updateShiftReport(report.id, patch);
      onDone?.();
    } catch (e2) {
      setErr(e2?.message ?? 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (!report) return <FormSheet open={false} onClose={onClose} title="" />;

  return (
    <FormSheet
      open={!!report}
      onClose={onClose}
      title={`Корректировка смены #${report.external_shift_key}`}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Сохранить изменения"
    >
      <div className="space-y-4">
        <Select
          label="Ответственный кассир"
          value={form.operator_user_id}
          onChange={(e) => setForm({ ...form, operator_user_id: e.target.value })}
          required
        >
          <option value="">— Выберите кассира —</option>
          {cashiers.map((c) => (
            <option key={c.id} value={c.user_id}>
              {c.full_name || c.email}
            </option>
          ))}
        </Select>

        <div className="rounded-2xl border border-line/50 bg-bg-elevated/40 p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-bold">Ожидалось (из АСУ)</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ожидалось касса" type="number" step="0.01" value={form.expected_cash} onChange={(e) => setForm({ ...form, expected_cash: e.target.value })} />
            <Input label="Ожидалось картой" type="number" step="0.01" value={form.expected_card} onChange={(e) => setForm({ ...form, expected_card: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ожидалось QR" type="number" step="0.01" value={form.expected_qr} onChange={(e) => setForm({ ...form, expected_qr: e.target.value })} />
            <Input label="Ожидалось литров" type="number" step="0.1" value={form.expected_liters} onChange={(e) => setForm({ ...form, expected_liters: e.target.value })} />
          </div>
          <Input label="Ожидалось всего (выручка)" type="number" step="0.01" value={form.expected_total} onChange={(e) => setForm({ ...form, expected_total: e.target.value })} />
        </div>

        <div className="rounded-2xl border border-line/50 bg-bg-elevated/40 p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-bold">Фактические показатели смены</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Факт наличные" type="number" step="0.01" value={form.actual_cash} onChange={(e) => setForm({ ...form, actual_cash: e.target.value })} />
            <Input label="Факт картой" type="number" step="0.01" value={form.actual_card} onChange={(e) => setForm({ ...form, actual_card: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Факт QR" type="number" step="0.01" value={form.actual_qr} onChange={(e) => setForm({ ...form, actual_qr: e.target.value })} />
            <Input label="Факт купоны/талоны" type="number" step="0.01" value={form.actual_coupons} onChange={(e) => setForm({ ...form, actual_coupons: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Инкассировано" type="number" step="0.01" value={form.collection_total} onChange={(e) => setForm({ ...form, collection_total: e.target.value })} />
            <Input label="Сейф (остаток)" type="number" step="0.01" value={form.cash_remaining} onChange={(e) => setForm({ ...form, cash_remaining: e.target.value })} />
          </div>
        </div>

        <div className="rounded-2xl border border-line/50 bg-bg-elevated/80 p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted">Фактическая выручка:</span>
            <span className="font-bold text-ink tabular-nums">{formatMoney(actualTotal)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted">Разница по кассе:</span>
            <span className={cashDifference > 0 ? 'text-danger font-semibold tabular-nums' : cashDifference < 0 ? 'text-success font-semibold tabular-nums' : 'text-ink font-semibold tabular-nums'}>
              {cashDifference > 0 ? `Недостача −${formatMoney(cashDifference)}` : cashDifference < 0 ? `Излишек +${formatMoney(Math.abs(cashDifference))}` : 'В ноль'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted">Общая погрешность смены:</span>
            <span className={totalDifference > 0 ? 'text-danger font-semibold tabular-nums' : totalDifference < 0 ? 'text-success font-semibold tabular-nums' : 'text-ink font-semibold tabular-nums'}>
              {totalDifference > 0 ? `Недостача −${formatMoney(totalDifference)}` : totalDifference < 0 ? `Излишек +${formatMoney(Math.abs(totalDifference))}` : 'В ноль'}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-line/50 bg-bg-elevated/40 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-ink-soft font-bold">Движение денег по кассе (доп.)</div>
            <Button type="button" size="sm" variant="secondary" className="h-6 text-[10px] py-0 px-2" onClick={addLine}>
              + Добавить
            </Button>
          </div>

          <div className="space-y-2">
            {activeLines.map((line) => (
              <div key={line.id} className="p-3.5 rounded-xl border border-line/40 bg-bg-card space-y-2.5 relative">
                <button
                  type="button"
                  onClick={() => deleteLine(line.id)}
                  className="absolute top-2 right-2 w-5 h-5 rounded-lg flex items-center justify-center text-ink-soft hover:text-danger active:bg-danger/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] text-ink-soft block mb-1">Тип операции</span>
                    <div className="grid grid-cols-2 gap-1 bg-bg-elevated p-0.5 rounded-lg border border-line/40">
                      <button
                        type="button"
                        onClick={() => updateLine(line.id, 'kind', 'expense')}
                        className={`py-1 text-[10px] font-bold rounded-md transition-colors ${line.kind === 'expense' ? 'bg-danger/15 text-danger' : 'text-ink-muted'}`}
                      >
                        Расход
                      </button>
                      <button
                        type="button"
                        onClick={() => updateLine(line.id, 'kind', 'income')}
                        className={`py-1 text-[10px] font-bold rounded-md transition-colors ${line.kind === 'income' ? 'bg-success/15 text-success' : 'text-ink-muted'}`}
                      >
                        Приход
                      </button>
                    </div>
                  </div>

                  <Input
                    label="Сумма"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={line.amount}
                    onChange={(e) => updateLine(line.id, 'amount', e.target.value)}
                    className="h-8 text-xs rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Select
                    label="Статья"
                    value={line.category || ''}
                    onChange={(e) => updateLine(line.id, 'category', e.target.value)}
                    className="h-8 text-xs rounded-lg"
                  >
                    <option value="Топливо">Топливо</option>
                    <option value="Комиссия">Комиссия</option>
                    <option value="Премия">Премия</option>
                    <option value="Закупка">Закупка</option>
                    <option value="Хоз. нужды">Хоз. нужды</option>
                    <option value="Инкассация">Инкассация</option>
                    <option value="Разное">Разное</option>
                  </Select>

                  <Select
                    label="Кошелёк"
                    value={line.wallet_id || ''}
                    onChange={(e) => updateLine(line.id, 'wallet_id', e.target.value)}
                    className="h-8 text-xs rounded-lg"
                  >
                    <option value="">— Касса —</option>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <Input
                  label="Комментарий"
                  placeholder="Назначение платежа"
                  value={line.note || ''}
                  onChange={(e) => updateLine(line.id, 'note', e.target.value)}
                  className="h-8 text-xs rounded-lg"
                />
              </div>
            ))}

            {activeLines.length === 0 && (
              <div className="text-center py-4 text-xs text-ink-soft bg-bg-elevated/20 rounded-xl border border-dashed border-line/45">
                Нет дополнительных расходов или приходов.
              </div>
            )}
          </div>
        </div>

        <Input
          label="Комментарий менеджера"
          value={form.comment}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
        />
      </div>
    </FormSheet>
  );
}
