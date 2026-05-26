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
  Activity,
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
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import {
  closeoutByShiftKey,
  deleteOperatorOverride,
  getCurrentShiftFromBalance,
  getShiftReportByKey,
  listPendingShiftReports,
  listShiftsFromBalance,
  reviewShiftReport,
  setOperatorOverride,
} from '@/services/shiftService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatDateTime, formatLiters, formatMoney } from '@/lib/formatters';

const PERIODS = [
  { id: 'week',  label: 'Неделя' },
  { id: 'month', label: 'Месяц'  },
  { id: 'year',  label: 'Год'    },
];

function rangeFor(id) {
  const now = new Date();
  const to = new Date(now);
  let from;
  if (id === 'week')       from = new Date(now.getTime() - 6 * 86400000);
  else if (id === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else                     from = new Date(now.getFullYear(), 0, 1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export default function ShiftsScreen() {
  const { user } = useAuth();
  const { canApprove, canCreate, canEdit } = usePermissions();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const canReconcile = canCreate(MODULES.SHIFTS);
  const canReview = canApprove(MODULES.SHIFTS);
  const canRenameOperator = canEdit(MODULES.SHIFTS);

  const [period, setPeriod] = useState('week');
  const [current, setCurrent] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [closeoutShift, setCloseoutShift] = useState(null);
  const [viewReport, setViewReport] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [editingOperator, setEditingOperator] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const { from, to } = rangeFor(period);
      const [cur, list, pend] = await Promise.all([
        getCurrentShiftFromBalance({ stationId }).catch(() => null),
        listShiftsFromBalance({
          stationId,
          from: from.toISOString(),
          to: to.toISOString(),
          limit: 60,
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
  }, [period, stationId, canReview]);

  useEffect(() => { reload(); }, [reload]);

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

  // Attach reconcile report (shift_reports rows) to balance-shifts by ShiftKey.
  const [reportByKey, setReportByKey] = useState(new Map());
  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      const keys = shifts.flatMap((s) => s.mergedKeys ?? [s.shiftKey]);
      if (keys.length === 0) { setReportByKey(new Map()); return; }
      // dedupe
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
    for (const s of shifts) {
      revenue += s.revenue;
      liters += s.liters;
      parts += s.parts;
    }
    return { revenue, liters, parts };
  }, [shifts]);

  return (
    <div className="space-y-3 pb-2">
      <ScreenHeader
        title="Смены"
        subtitle="Из POS · ShiftKey · azs_balance"
      />

      {err && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      )}

      {/* CURRENT SHIFT */}
      {current ? (
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
      ) : !loading ? (
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-bg-elevated border border-line flex items-center justify-center flex-shrink-0">
              <Activity className="w-4 h-4 text-ink-soft" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-ink truncate">Нет активной смены</div>
              <div className="text-xs text-ink-muted">
                Смена откроется автоматически когда оператор активирует её на POS.
              </div>
            </div>
          </div>
        </Card>
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
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">
              История смен
            </div>
            <div className="text-base font-semibold text-ink mt-0.5 truncate">
              {loading ? '…' : `${shifts.length} смен · ${formatMoney(totals.revenue)}`}
            </div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              {formatLiters(totals.liters)} · {totals.parts > shifts.length ? `${totals.parts} частей собрано` : 'без разрывов'}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={
                  'h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors ' +
                  (period === p.id
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-bg-elevated text-ink-muted border-line')
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-bg-elevated/60 animate-pulse" />
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="За период смен нет"
            description="Смены появятся когда POS отправит данные в azs_balance."
          />
        ) : (
          <div className="space-y-1.5">
            {shifts.map((s) => (
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
                onEditOperator={() => setEditingOperator(s)}
              />
            ))}
          </div>
        )}
      </Card>

      <CloseoutSheet
        shift={closeoutShift}
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

      <OperatorSheet
        shift={editingOperator}
        organizationId={orgId}
        stationId={stationId}
        onClose={() => setEditingOperator(null)}
        onDone={async () => { setEditingOperator(null); await reload(); }}
      />
    </div>
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
          Открывается автоматически в POS
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
function ShiftRow({ shift, report, canReconcile, canRenameOperator, onCloseout, onOpenReport, onEditOperator }) {
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

      <div className="mt-2 grid grid-cols-2 gap-2">
        {report ? (
          <Button size="sm" variant="ghost" className="h-7 !px-2 text-[11px]" onClick={onOpenReport}>
            Отчёт <ChevronRight className="w-3 h-3" />
          </Button>
        ) : (
          <span />
        )}
        {!report && canReconcile ? (
          <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={onCloseout}>
            Сверка
          </Button>
        ) : report && report.approved_at == null ? (
          <Badge tone="warning">ждёт утверждения</Badge>
        ) : report?.approved_at ? (
          <Badge tone="success">утверждена</Badge>
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
          {report.result_status ?? 'submitted'}
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
function CloseoutSheet({ shift, onClose, onDone }) {
  const [form, setForm] = useState({
    actual_cash: '', actual_card: '', actual_qr: '', actual_coupons: '',
    expenses_total: '', collection_total: '', cash_remaining: '', comment: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (shift) {
      setForm({
        actual_cash: '', actual_card: '', actual_qr: '', actual_coupons: '',
        expenses_total: '', collection_total: '', cash_remaining: '', comment: '',
      });
      setErr('');
    }
  }, [shift]);

  const total = ['actual_cash', 'actual_card', 'actual_qr', 'actual_coupons']
    .reduce((s, k) => s + (Number(form[k]) || 0), 0);

  async function submit() {
    if (!shift) return;
    if (total <= 0) { setErr('Введите хотя бы одну фактическую сумму'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        actual_cash:      Number(form.actual_cash)      || 0,
        actual_card:      Number(form.actual_card)      || 0,
        actual_qr:        Number(form.actual_qr)        || 0,
        actual_coupons:   Number(form.actual_coupons)   || 0,
        actual_total:     total,
        expenses_total:   Number(form.expenses_total)   || 0,
        income_total:     0,
        collection_total: Number(form.collection_total) || 0,
        cash_remaining:   Number(form.cash_remaining)   || 0,
        comment:          form.comment || null,
      };
      await closeoutByShiftKey(shift.shiftKey, payload);
      onDone?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  if (!shift) return <FormSheet open={false} onClose={onClose} title="" />;

  return (
    <FormSheet
      open={!!shift}
      onClose={onClose}
      title={`Сверка смены #${shift.shiftKey}`}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Сдать отчёт"
    >
      <div className="rounded-2xl bg-warning/10 border border-warning/30 p-3 text-xs text-warning">
        Слепой ввод. Введите фактические суммы по типам оплаты. После сдачи система покажет ожидаемые суммы из POS и расхождения.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Наличные" type="number" step="0.01" min="0" value={form.actual_cash}    onChange={(e) => setForm({ ...form, actual_cash:    e.target.value })} />
        <Input label="Карта"    type="number" step="0.01" min="0" value={form.actual_card}    onChange={(e) => setForm({ ...form, actual_card:    e.target.value })} />
        <Input label="QR"       type="number" step="0.01" min="0" value={form.actual_qr}      onChange={(e) => setForm({ ...form, actual_qr:      e.target.value })} />
        <Input label="Талоны"   type="number" step="0.01" min="0" value={form.actual_coupons} onChange={(e) => setForm({ ...form, actual_coupons: e.target.value })} />
      </div>

      <div className="rounded-2xl bg-bg-elevated border border-line p-3 flex items-center justify-between">
        <div className="text-sm text-ink-muted">Итого фактически</div>
        <div className="text-lg font-bold text-ink tabular-nums">{formatMoney(total)}</div>
      </div>

      <Input label="Расходы за смену"  type="number" step="0.01" min="0" value={form.expenses_total}   onChange={(e) => setForm({ ...form, expenses_total:   e.target.value })} />
      <Input label="Инкассировано"     type="number" step="0.01" min="0" value={form.collection_total} onChange={(e) => setForm({ ...form, collection_total: e.target.value })} />
      <Input label="Остаток в кассе"   type="number" step="0.01" min="0" value={form.cash_remaining}   onChange={(e) => setForm({ ...form, cash_remaining:   e.target.value })} />
      <Input label="Комментарий"       value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
    </FormSheet>
  );
}

// ---------------------------------------------------------------------------
function ReportSheet({ report, onClose }) {
  if (!report) return <FormSheet open={false} onClose={onClose} title="" />;
  const totalDiff = Number(report.total_difference ?? 0);
  const cashDiff  = Number(report.cash_difference ?? 0);
  return (
    <FormSheet
      open={!!report}
      onClose={onClose}
      title={`Отчёт смены ${report.external_shift_key != null ? `#${report.external_shift_key}` : ''}`}
      onSubmit={onClose}
      submitLabel="Готово"
    >
      <ReportRow label="Факт всего" value={formatMoney(report.actual_total)} />
      <ReportRow label="Ожидалось" value={formatMoney(report.expected_total)} />
      <ReportRow
        label={totalDiff >= 0 ? 'Излишек' : 'Недостача'}
        value={formatMoney(Math.abs(totalDiff))}
        tone={totalDiff >= 0 ? 'success' : 'danger'}
        bold
      />
      <ReportRow
        label={cashDiff >= 0 ? 'Излишек по кассе' : 'Недостача по кассе'}
        value={formatMoney(Math.abs(cashDiff))}
        tone={cashDiff >= 0 ? 'success' : 'danger'}
      />
      {report.expected_liters != null && (
        <ReportRow label="Литры по POS" value={`${Number(report.expected_liters).toLocaleString('ru-RU')} л`} />
      )}
      <div className="text-xs text-ink-soft">
        Статус: <span className="text-ink font-medium">{report.result_status ?? '—'}</span>
        {report.approved_at && (
          <span className="ml-2 text-success">· утверждено {formatDateTime(report.approved_at)}</span>
        )}
      </div>
      {report.comment && (
        <div className="rounded-2xl bg-bg-elevated border border-line p-3 text-sm text-ink-muted">
          {report.comment}
        </div>
      )}
    </FormSheet>
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
        Оригинальное имя из POS: <span className="text-ink font-medium">{shift.operatorOriginal ?? '—'}</span>
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
