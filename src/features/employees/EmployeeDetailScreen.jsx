// [CREATED BY CLAUDE CLI - 2026-05-27]
// Project: Fingas
// Purpose: Карточка сотрудника по аналогии с карточкой резервуара.
// Шапка: имя/роль/АЗС, баланс «К выплате», прогресс-бар «оплачено/начислено»,
// 4 метрики (Смены / Литры / Начислено / Выплачено). Табы:
//   • Смены      — сданные shift_reports оператора
//   • Начисления — записи в payroll
//   • Выплаты    — payroll-записи со значением paid > 0
//   • Ставка     — текущая ставка + редактор

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Banknote,
  ClipboardList,
  Fuel,
  Pencil,
  Plus,
  Receipt,
  UserCircle2,
  Wallet,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { CollapsibleFilters } from '@/components/ui/CollapsibleFilters';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES, ROLE_LABELS } from '@/lib/constants';
import { formatDate, formatDateTime, formatLiters, formatMoney } from '@/lib/formatters';
import {
  accruePayrollForReport,
  getEmployeePayRate,
  listPayroll,
  saveEmployeePayRate,
} from '@/services/payrollService';
import { EditReportSheet } from '@/features/shifts/ShiftsScreen';

const TABS = [
  { id: 'shifts',    label: 'Смены',      icon: ClipboardList, tone: 'info'    },
  { id: 'accruals',  label: 'Начисления', icon: Receipt,       tone: 'success' },
  { id: 'payouts',   label: 'Выплаты',    icon: Wallet,        tone: 'brand'   },
  { id: 'rate',      label: 'Ставка',     icon: Banknote,      tone: 'warning' },
];

const FUELS = ['АИ-92', 'АИ-95', 'АИ-98', 'ДТ', 'Газ'];

export default function EmployeeDetailScreen({ forcedUserId = null } = {}) {
  const { user } = useAuth();
  const { canEdit, canCreate } = usePermissions();
  const navigate = useNavigate();
  const params = useParams();
  // forcedUserId (передаётся когда экран рендерит «свою» карточку оператор) →
  // URL-параметр (когда владелец/админ открывает чужую) → fallback на текущего.
  const userId = forcedUserId ?? params.userId ?? user?.id ?? null;
  const orgId = user?.profile?.organization_id;

  const canManageRate = canCreate(MODULES.SETTINGS) || canEdit(MODULES.SETTINGS)
                       || canCreate(MODULES.PAYROLL) || canEdit(MODULES.PAYROLL);

  // Фильтр по датам — по умолчанию текущий месяц.
  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate]     = useState(todayISO);

  const [profile, setProfile] = useState(null);
  const [stationName, setStationName] = useState(null);
  const [rate, setRate] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [activeTab, setActiveTab] = useState('shifts');
  const [editingRate, setEditingRate] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [accrualOpen, setAccrualOpen] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [cashiers, setCashiers] = useState([]);
  const [accruing, setAccruing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Список активных сотрудников — нужен EditReportSheet чтобы менять
  // operator_user_id, если отчёт сдал не тот человек.
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from('profiles')
      .select('id, user_id, full_name, email')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .then(({ data }) => setCashiers(data ?? []));
  }, [orgId]);

  const reload = useCallback(async () => {
    if (!userId || !orgId) return;
    setLoading(true); setErr('');
    try {
      // 1. profile
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .select('*, station:stations(id,name,city)')
        .eq('user_id', userId)
        .maybeSingle();
      if (pErr) throw pErr;
      setProfile(prof);
      setStationName(prof?.station ? `${prof.station.name}${prof.station.city ? ' · ' + prof.station.city : ''}` : null);

      // 2. parallel: rate + shifts + payroll (фильтр по датам).
      const fromISO = fromDate ? `${fromDate}T00:00:00.000Z` : null;
      const toISO   = toDate   ? `${toDate}T23:59:59.999Z` : null;

      let shiftQ = supabase
        .from('shift_reports')
        .select('*')
        .or(`operator_user_id.eq.${userId},submitted_by.eq.${userId}`)
        .order('submitted_at', { ascending: false })
        .limit(500);
      if (fromISO) shiftQ = shiftQ.gte('submitted_at', fromISO);
      if (toISO)   shiftQ = shiftQ.lte('submitted_at', toISO);

      const [rateRow, shiftRows, payRows] = await Promise.all([
        getEmployeePayRate(userId).catch(() => null),
        shiftQ.then(({ data }) => data ?? []),
        listPayroll({ userId, from: fromDate || null, to: toDate || null, limit: 500 }).catch(() => []),
      ]);
      setRate(rateRow);
      setShifts(shiftRows);
      setPayroll(payRows);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [userId, orgId, fromDate, toDate]);

  useEffect(() => { reload(); }, [reload]);

  // Прогнать все утверждённые сменные отчёты этого сотрудника через RPC
  // начисления. Полезно когда смены утвердили ДО назначения ставки, или
  // если автотриггер из 0028 не сработал.
  async function recomputeAccruals() {
    const approved = shifts.filter((s) => s.approved_at && s.result_status !== 'rejected');
    if (approved.length === 0) { setErr('Нет утверждённых смен для начисления.'); return; }
    setAccruing(true); setErr('');
    try {
      for (const r of approved) {
        try { await accruePayrollForReport(r.id); } catch (e) { console.warn('[employee] accrue failed', r.id, e); }
      }
      await reload();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось пересчитать начисления');
    } finally {
      setAccruing(false);
    }
  }

  const totals = useMemo(() => {
    const accrued = payroll.reduce((s, r) => s + Number(r.accrued ?? 0), 0);
    const paid    = payroll.reduce((s, r) => s + Number(r.paid    ?? 0), 0);
    const approvedShifts = shifts.filter((s) => s.approved_at && s.result_status !== 'rejected');
    const shiftsCount = approvedShifts.length;
    const liters = approvedShifts.reduce((s, r) => s + Number(r.expected_liters ?? 0), 0);
    return { accrued, paid, remaining: accrued - paid, shiftsCount, liters };
  }, [payroll, shifts]);

  const paidPct = totals.accrued > 0
    ? Math.max(0, Math.min(100, (totals.paid / totals.accrued) * 100))
    : 0;

  if (!profile && !loading) {
    return (
      <div className="space-y-3 pb-3">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>
        <Card className="!p-6 text-center text-ink-muted text-sm">Сотрудник не найден.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-3">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink font-semibold"
      >
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      {err && (
        <Card className="!p-3 text-sm text-danger border-danger/30 bg-danger/10">{err}</Card>
      )}

      {/* HEADER */}
      <Card className="!p-4 border border-brand-500/20 bg-gradient-to-br from-bg-card via-bg-card to-brand-500/5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-soft font-bold">Сотрудник</div>
            <div className="mt-0.5 text-lg font-extrabold text-ink truncate">
              {profile?.full_name || profile?.email || '—'}
            </div>
            <div className="mt-1 text-xs text-ink-muted flex items-center gap-1.5 flex-wrap">
              <UserCircle2 className="w-3.5 h-3.5" />
              <span>{ROLE_LABELS[profile?.role] ?? profile?.role ?? '—'}</span>
              {stationName && <span>· {stationName}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone={totals.remaining > 0 ? 'warning' : 'success'}>
              {formatMoney(totals.remaining)}
            </Badge>
            <button
              type="button"
              onClick={reload}
              disabled={loading}
              className="text-[10px] text-ink-soft hover:text-ink underline disabled:opacity-50"
            >
              {loading ? 'Обновляется…' : 'Пересчитать'}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-ink-soft">
            <span>{Math.round(paidPct)}% выплачено</span>
            <span>{formatMoney(totals.paid)} из {formatMoney(totals.accrued)}</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-line/30 grid grid-cols-4 gap-2 text-[10px]">
          <MetricCell label="Смен" value={totals.shiftsCount} />
          <MetricCell label="Литры" value={formatLiters(totals.liters)} />
          <MetricCell label="Начислено" value={formatMoney(totals.accrued)} tone="success" />
          <MetricCell label="Выплачено" value={formatMoney(totals.paid)} tone="info" />
        </div>
      </Card>

      {/* DATE RANGE FILTER (свёрнут в кнопку) */}
      <CollapsibleFilters
        label={fromDate || toDate ? `${fromDate || '—'} → ${toDate || '—'}` : 'Период'}
        activeCount={(fromDate ? 1 : 0) + (toDate ? 1 : 0)}
        onReset={() => { setFromDate(''); setToDate(''); }}
      >
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onPreset={(f, t) => { setFromDate(f); setToDate(t); }}
        />
      </CollapsibleFilters>

      {/* TABS */}
      <div className="flex gap-1 p-1 rounded-2xl bg-bg-card border border-line/30">
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={
                'relative flex-1 h-9 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1 transition-colors ' +
                (active ? 'text-white' : 'text-ink-muted hover:text-ink')
              }
            >
              {active && (
                <motion.span
                  layoutId="activeEmployeeTab"
                  className="absolute inset-0 rounded-xl bg-brand-500 shadow-glow -z-10"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <t.icon className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* OPS LIST + ADD */}
      <Card className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft font-bold">
            {TABS.find((t) => t.id === activeTab)?.label}
          </div>
          {activeTab === 'rate' && canManageRate ? (
            <Button size="sm" onClick={() => setEditingRate(true)}>
              <Pencil className="w-4 h-4" /> Изменить
            </Button>
          ) : activeTab === 'payouts' && canManageRate ? (
            <Button size="sm" onClick={() => setPayoutOpen(true)}>
              <Plus className="w-4 h-4" /> Выплата
            </Button>
          ) : activeTab === 'accruals' && canManageRate ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={recomputeAccruals} loading={accruing}>
                Пересчитать
              </Button>
              <Button size="sm" onClick={() => setAccrualOpen(true)}>
                <Plus className="w-4 h-4" /> Начислить
              </Button>
            </div>
          ) : null}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            {loading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-bg-elevated/60 animate-pulse" />
              ))
            ) : activeTab === 'shifts' ? (
              <ShiftsList shifts={shifts} canEdit={canManageRate} onShiftClick={setEditingReport} />
            ) : activeTab === 'accruals' ? (
              <AccrualsList payroll={payroll} />
            ) : activeTab === 'payouts' ? (
              <PayoutsList payroll={payroll} />
            ) : (
              <RateSummary rate={rate} canEdit={canManageRate} />
            )}
          </motion.div>
        </AnimatePresence>
      </Card>

      <RateSheet
        open={editingRate}
        userId={userId}
        organizationId={orgId}
        rate={rate}
        onClose={() => setEditingRate(false)}
        onSaved={async () => { setEditingRate(false); await reload(); }}
      />

      <PayoutSheet
        open={payoutOpen}
        userId={userId}
        organizationId={orgId}
        stationId={profile?.station_id}
        currentBalance={totals.remaining}
        employeeName={profile?.full_name || profile?.email || 'сотруднику'}
        onClose={() => setPayoutOpen(false)}
        onSaved={async () => { setPayoutOpen(false); await reload(); }}
      />

      <AccrualSheet
        open={accrualOpen}
        userId={userId}
        organizationId={orgId}
        stationId={profile?.station_id}
        onClose={() => setAccrualOpen(false)}
        onSaved={async () => { setAccrualOpen(false); await reload(); }}
      />

      <EditReportSheet
        report={editingReport}
        organizationId={orgId}
        stationId={profile?.station_id}
        cashiers={cashiers}
        onClose={() => setEditingReport(null)}
        onDone={async () => { setEditingReport(null); await reload(); }}
      />
    </div>
  );
}

// ---------- Sub-views ----------

function ShiftsList({ shifts, canEdit, onShiftClick }) {
  if (shifts.length === 0) {
    return <EmptyState icon={ClipboardList} title="Смен ещё нет" description="Здесь появятся сданные сменные отчёты этого сотрудника." />;
  }
  return shifts.map((r) => {
    const diff = Number(r.total_difference ?? 0);
    const tone =
      !r.approved_at ? 'warning' :
      r.result_status === 'ok' ? 'success' :
      r.result_status === 'overage' ? 'warning' :
      r.result_status === 'shortage' ? 'danger' : 'info';
    const sub = r.external_shift_key != null
      ? `Смена #${r.external_shift_key}${diff !== 0 ? ' · ' + (diff >= 0 ? '+' : '−') + formatMoney(Math.abs(diff)) : ''}`
      : (diff !== 0 ? (diff >= 0 ? '+' : '−') + formatMoney(Math.abs(diff)) : '—');
    return (
      <Row
        key={r.id}
        date={r.submitted_at}
        title={formatMoney(r.actual_total)}
        sub={sub}
        right={<Badge tone={tone}>{r.approved_at ? (r.result_status ?? 'ok') : 'ждёт'}</Badge>}
        onClick={canEdit ? () => onShiftClick?.(r) : undefined}
      />
    );
  });
}

function AccrualsList({ payroll }) {
  if (payroll.length === 0) {
    return <EmptyState icon={Receipt} title="Начислений нет" description="Начисления появляются автоматически при утверждении сменных отчётов." />;
  }
  return payroll.map((r) => (
    <Row
      key={r.id}
      date={r.period}
      title={formatMoney(r.accrued)}
      sub={r.salary_type === 'piecework' && r.liters
        ? `Сдельная: ${Number(r.liters).toFixed(3)} л × ${r.rate}`
        : (r.salary_type === 'fixed' ? `Фикс: ${formatMoney(r.rate)} / смена` : '—')}
      right={<Badge tone={Number(r.paid) >= Number(r.accrued) ? 'success' : 'warning'}>
        {Number(r.paid) >= Number(r.accrued) ? 'выплачено' : 'к выплате'}
      </Badge>}
    />
  ));
}

function PayoutsList({ payroll }) {
  const paidRows = payroll.filter((r) => Number(r.paid ?? 0) > 0);
  if (paidRows.length === 0) {
    return <EmptyState icon={Wallet} title="Выплат нет" description="Добавьте выплату, когда передаёте деньги сотруднику." />;
  }
  return paidRows.map((r) => (
    <Row
      key={r.id}
      date={r.paid_at ?? r.period}
      title={formatMoney(r.paid)}
      sub={r.note ?? '—'}
      right={<Badge tone="success">выплачено</Badge>}
    />
  ));
}

function RateSummary({ rate, canEdit }) {
  if (!rate) {
    return (
      <EmptyState
        icon={Banknote}
        title="Ставка не задана"
        description={canEdit ? 'Нажмите «Изменить», чтобы задать фиксированную ставку за смену или сдельную по литрам.' : 'Свяжитесь с владельцем для назначения ставки.'}
      />
    );
  }
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-bg-elevated/60 border border-line/40 p-3 flex items-center justify-between">
        <span className="text-xs text-ink-muted">Тип ставки</span>
        <Badge tone={rate.kind === 'fixed' ? 'info' : 'success'}>
          {rate.kind === 'fixed' ? 'Фикс' : 'Сдельная'}
        </Badge>
      </div>
      {rate.kind === 'fixed' ? (
        <div className="rounded-xl bg-bg-elevated/60 border border-line/40 p-3 flex items-center justify-between">
          <span className="text-xs text-ink-muted">Сумма за смену</span>
          <span className="text-sm font-bold text-ink tabular-nums">{formatMoney(rate.base_amount)}</span>
        </div>
      ) : rate.rates_json ? (
        <div className="rounded-xl bg-bg-elevated/60 border border-line/40 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-bold">Ставки по маркам</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {Object.entries(rate.rates_json).map(([fuel, value]) => (
              <div key={fuel} className="flex items-center justify-between text-xs">
                <span className="text-ink-muted flex items-center gap-1"><Fuel className="w-3 h-3" />{fuel}</span>
                <span className="font-semibold tabular-nums text-ink">{value} сом/л</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="text-[10px] text-ink-soft px-1">
        Действует с {formatDate(rate.effective_from)}. Начисление = по сменам, где этот сотрудник — оператор.
      </div>
    </div>
  );
}

function Row({ date, title, sub, right, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={
        'w-full text-left rounded-xl bg-bg-elevated/60 border border-line/40 px-3 py-2.5 flex items-center gap-3 ' +
        (onClick ? 'hover:border-brand-500/40 hover:bg-bg-elevated transition-colors' : '')
      }
    >
      <div className="text-[10px] text-ink-soft font-bold flex-shrink-0 w-14">
        {formatDate(date, 'd MMM')}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink truncate">{title}</div>
        <div className="text-[11px] text-ink-muted truncate">{sub}</div>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </Tag>
  );
}

function DateRangeFilter({ fromDate, toDate, onFromChange, onToChange, onPreset }) {
  function preset(kind) {
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    if (kind === 'today') return onPreset(todayStr, todayStr);
    if (kind === 'week') {
      const offsetToMonday = (today.getDay() + 6) % 7;
      const wkStart = new Date(today.getTime() - offsetToMonday * 86400000);
      return onPreset(wkStart.toISOString().slice(0, 10), todayStr);
    }
    if (kind === 'month') {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      return onPreset(m.toISOString().slice(0, 10), todayStr);
    }
    if (kind === 'year') {
      const y = new Date(today.getFullYear(), 0, 1);
      return onPreset(y.toISOString().slice(0, 10), todayStr);
    }
    if (kind === 'all') return onPreset('', '');
  }
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Период</div>
        <div className="flex gap-1">
          {[
            { id: 'today', label: 'Сег' },
            { id: 'week',  label: 'Нед' },
            { id: 'month', label: 'Мес' },
            { id: 'year',  label: 'Год' },
            { id: 'all',   label: 'Все' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => preset(p.id)}
              className="h-7 px-2.5 rounded-lg text-[10px] font-bold border border-line bg-bg-elevated text-ink-muted hover:text-ink hover:border-brand-500/50 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input label="С" type="date" className="h-9 text-xs" value={fromDate} onChange={(e) => onFromChange(e.target.value)} />
        <Input label="По" type="date" className="h-9 text-xs" value={toDate} onChange={(e) => onToChange(e.target.value)} />
      </div>
    </div>
  );
}

function MetricCell({ label, value, tone }) {
  const color =
    tone === 'success' ? 'text-success' :
    tone === 'info'    ? 'text-info' :
    tone === 'danger'  ? 'text-danger' :
    tone === 'warning' ? 'text-warning' : 'text-ink';
  return (
    <div className="rounded-lg bg-bg-elevated/60 border border-line/30 px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-[0.14em] text-ink-soft font-bold">{label}</div>
      <div className={'text-[11px] font-bold mt-0.5 ' + color}>{value}</div>
    </div>
  );
}

// ---------- Rate edit sheet ----------

function RateSheet({ open, userId, organizationId, rate, onClose, onSaved }) {
  const [kind, setKind] = useState('fixed');
  const [baseAmount, setBaseAmount] = useState('0');
  const [ratesJson, setRatesJson] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    if (rate) {
      setKind(rate.kind || 'fixed');
      setBaseAmount(String(rate.base_amount ?? 0));
      const r = rate.rates_json ?? {};
      setRatesJson(Object.fromEntries(FUELS.map((f) => [f, String(r[f] ?? 0)])));
    } else {
      setKind('fixed');
      setBaseAmount('0');
      setRatesJson(Object.fromEntries(FUELS.map((f) => [f, '0'])));
    }
  }, [open, rate]);

  async function submit() {
    if (!userId) { setErr('Нет userId'); return; }
    setSaving(true); setErr('');
    try {
      const parsed = {};
      for (const [f, v] of Object.entries(ratesJson)) parsed[f] = Number(v) || 0;
      await saveEmployeePayRate(userId, organizationId, {
        kind,
        base_amount: Number(baseAmount) || 0,
        rates_json: kind === 'piecework' ? parsed : null,
      });
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Ставка сотрудника"
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Сохранить"
    >
      <Select label="Тип ставки" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="fixed">Фикс — фиксированная сумма за смену</option>
        <option value="piecework">Сдельная — литры × ставка по марке</option>
      </Select>

      {kind === 'fixed' ? (
        <Input
          label="Сумма за смену, сом"
          type="number" step="0.01" min="0"
          value={baseAmount}
          onChange={(e) => setBaseAmount(e.target.value)}
        />
      ) : (
        <div className="rounded-2xl border border-line/40 bg-bg-elevated/40 p-3 space-y-2">
          <div className="text-[11px] text-ink-soft">Ставка за литр по каждой марке.</div>
          <div className="grid grid-cols-2 gap-2">
            {FUELS.map((f) => (
              <Input
                key={f}
                label={`${f}, сом/л`}
                type="number" step="0.01" min="0"
                value={ratesJson[f] ?? '0'}
                onChange={(e) => setRatesJson({ ...ratesJson, [f]: e.target.value })}
              />
            ))}
          </div>
        </div>
      )}
    </FormSheet>
  );
}

// ---------- Payout sheet ----------

function PayoutSheet({ open, userId, organizationId, stationId, currentBalance, employeeName, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [walletId, setWalletId] = useState('');
  const [wallets, setWallets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setAmount(currentBalance > 0 ? String(currentBalance.toFixed(2)) : '');
      setDate(today);
      setNote('');
      setPaymentType('cash');
      setErr('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentBalance]);

  useEffect(() => {
    if (!open || !organizationId) return;
    import('@/services/cashflowService').then(({ listWallets }) =>
      listWallets({ organizationId, active: true })
        .then((rows) => {
          setWallets(rows ?? []);
          if (rows && rows.length > 0 && !walletId) {
            const cash = rows.find((w) => w.kind === 'cash_register') ?? rows[0];
            setWalletId(cash.id);
          }
        })
        .catch(() => setWallets([])),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId]);

  async function submit() {
    setSaving(true); setErr('');
    try {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error('Сумма должна быть > 0');
      if (!walletId) throw new Error('Выберите кошелёк');

      // 1. Сначала пишем расход в cashflow.
      const { data: cf, error: cfErr } = await supabase
        .from('cashflow')
        .insert({
          organization_id: organizationId,
          station_id: stationId ?? null,
          date,
          operation_type: 'expense',
          payment_type: paymentType,
          cashflow_category: 'Зарплата',
          amount: amt,
          wallet_from: walletId,
          note: `Выплата ${employeeName || 'сотруднику'}${note ? ' · ' + note : ''}`,
          status: 'confirmed',
        })
        .select('id')
        .single();
      if (cfErr) throw cfErr;

      // 2. Затем — запись в payroll с paid=amt и ссылкой на cashflow.
      const { error: prErr } = await supabase
        .from('payroll')
        .insert({
          organization_id: organizationId,
          station_id: stationId ?? null,
          user_id: userId,
          period: date,
          salary_type: 'fixed',
          accrued: 0,
          paid: amt,
          paid_at: new Date(date).toISOString(),
          cashflow_id: cf?.id ?? null,
          note: note || 'Выплата зарплаты',
        });
      if (prErr) throw prErr;

      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Выплата сотруднику"
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Выплатить"
    >
      <Input
        label="Сумма выплаты, сом"
        type="number" step="0.01" min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint={currentBalance > 0 ? `К выплате сейчас: ${formatMoney(currentBalance)} — кнопкой ниже подставится` : null}
        required
      />
      {currentBalance > 0 && (
        <button
          type="button"
          onClick={() => setAmount(String(currentBalance.toFixed(2)))}
          className="w-full rounded-2xl bg-success/10 border border-success/30 px-4 py-2.5 text-sm text-success hover:bg-success/15 transition-colors text-left"
        >
          Выплатить остаток: <span className="font-semibold">{formatMoney(currentBalance)}</span>
        </button>
      )}
      <Select label="Из кошелька" value={walletId} onChange={(e) => setWalletId(e.target.value)} required>
        <option value="">— Выберите кошелёк —</option>
        {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </Select>
      <Select label="Способ оплаты" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
        <option value="cash">Наличные</option>
        <option value="card">Карта</option>
        <option value="bank">Банк</option>
        <option value="qr">QR</option>
      </Select>
      <Input label="Дата" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <Input label="Комментарий" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Аванс / зарплата / премия" />
      <div className="text-[11px] text-ink-soft">
        Создаст расход в кэшфлоу (категория «Зарплата») с выбранного кошелька
        и привяжет к этой выплате запись в payroll.
      </div>
    </FormSheet>
  );
}

function AccrualSheet({ open, userId, organizationId, stationId, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setAmount('');
      setDate(today);
      setNote('');
      setErr('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    setSaving(true); setErr('');
    try {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error('Сумма должна быть > 0');
      const { error } = await supabase
        .from('payroll')
        .insert({
          organization_id: organizationId,
          station_id: stationId ?? null,
          user_id: userId,
          period: date,
          salary_type: 'fixed',
          accrued: amt,
          paid: 0,
          note: note || 'Ручное начисление',
        });
      if (error) throw error;
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Начисление сотруднику"
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Начислить"
    >
      <Input
        label="Сумма начисления, сом"
        type="number" step="0.01" min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint="Премия, доплата, разовое начисление"
        required
      />
      <Input label="Дата" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <Input label="Комментарий" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Премия за месяц / разовая доплата" />
      <div className="text-[11px] text-ink-soft">
        Это ручное начисление в дополнение к автоматическому по ставке.
        Сразу отобразится в общем остатке к выплате.
      </div>
    </FormSheet>
  );
}

// Local utility (date already exported by formatters, but we keep import surface clean)
// eslint-disable-next-line no-unused-vars
function _formatDateTime(v) { return formatDateTime(v); }
