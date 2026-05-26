// [UPDATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY CODEX - 2026-05-25]
// Project: Fingas
// Purpose: Tax payments — list grouped by tax type with totals, plus create form.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, Download, Plus, Receipt, ShieldCheck } from 'lucide-react';
import { downloadCSV, todayStamp } from '@/lib/exporters';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { createTaxPayment, listTaxes } from '@/services/taxService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES, TAX_TYPES } from '@/lib/constants';
import { formatMoney } from '@/lib/formatters';

const MONTHS = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
];

export default function TaxesScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { canCreate, canExport } = usePermissions();
  const stationId = user?.profile?.station_id;
  const organizationId = user?.profile?.organization_id;

  function exportCSV(data) {
    downloadCSV(`taxes-${todayStamp()}`, data, [
      { key: 'tax_type', label: 'Тип' },
      { key: 'period_month', label: 'Месяц' },
      { key: 'period_year', label: 'Год' },
      { key: 'amount', label: 'Сумма' },
      { key: 'payment_date', label: 'Дата платежа' },
      { key: 'note', label: 'Комментарий' },
    ]);
  }
  const currentYear = new Date().getFullYear();

  const [rows, setRows] = useState([]);
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await listTaxes({ year });
      setRows(data);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { reload(); }, [reload]);

  // group by type
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const k = r.tax_type ?? 'Прочие';
      if (!map.has(k)) map.set(k, { type: k, total: 0, items: [] });
      const g = map.get(k);
      g.total += Number(r.amount ?? 0);
      g.items.push(r);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const grandTotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <div>
      <ScreenHeader
        title="Налоги"
        subtitle={`Платежи за ${year}`}
        right={(
          <div className="flex items-center gap-2">
            {canExport(MODULES.TAXES) && rows.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => exportCSV(rows)}>
                <Download className="w-4 h-4" />
              </Button>
            )}
            {canCreate(MODULES.TAXES) && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4" /> Платёж
              </Button>
            )}
          </div>
        )}
      />

      {!loading && rows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">
              <ShieldCheck className="w-3 h-3 text-brand-500" />
              Налоговый календарь
            </div>
            <div className="mt-1 text-xl font-bold text-ink">{formatMoney(grandTotal)}</div>
            <div className="mt-0.5 text-xs text-ink-muted">Общий объем платежей за {year} год</div>
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <SummaryCard label="Платежей" value={rows.length} icon={Receipt} />
              <SummaryCard label="Типов налогов" value={groups.length} icon={CalendarRange} />
            </div>
          </div>
        </motion.div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="!h-9 text-xs">
          {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        <div className="ml-auto text-right">
          <div className="text-[9px] uppercase tracking-[0.16em] text-ink-soft">Всего за год</div>
          <div className="font-bold text-ink text-xs">{formatMoney(grandTotal)}</div>
        </div>
      </div>

      {err && <Card className="text-sm text-danger mb-3">{err}</Card>}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-bg-card border border-line/30 animate-pulse" />)}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="Платежей пока нет"
          description="Тут отображаются налоговые отчисления организации."
        />
      )}

      {/* Group listing */}
      {!loading && groups.map((g, i) => (
        <motion.div key={g.taxType} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="mb-2">
          <Card className="!p-3 rounded-xl border border-line/30 bg-bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-line/20 pb-2 mb-2">
              <div>
                <div className="text-xs font-bold text-ink">{g.taxType}</div>
                <div className="text-[10px] text-ink-muted">{g.items.length} транз.</div>
              </div>
              <div className="text-sm font-bold text-ink">{formatMoney(g.total)}</div>
            </div>
            <div className="space-y-1.5">
              {g.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs py-0.5">
                  <div className="min-w-0">
                    <div className="text-[10px] text-ink-soft">
                      Период: {MONTHS[item.period_month - 1]} {item.period_year}
                    </div>
                    {item.note && <div className="text-[10px] text-ink-muted truncate mt-0.5">{item.note}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-ink">{formatMoney(item.amount)}</div>
                    <div className="text-[9px] text-ink-muted">{new Date(item.payment_date).toLocaleDateString('ru-RU')}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      ))}

      <TaxSheet
        open={open}
        onClose={() => setOpen(false)}
        onSaved={async () => {
          setOpen(false);
          await reload();
        }}
        userId={userId}
        organizationId={organizationId}
        stationId={stationId}
      />
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl bg-bg-card/70 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">
        <Icon className="w-3 h-3 text-brand-500 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-xs font-bold text-ink mt-0.5">{value}</div>
    </div>
  );
}

function TaxSheet({ open, onClose, onSaved, organizationId, stationId, userId }) {
  const now = new Date();
  const [form, setForm] = useState({
    tax_type: TAX_TYPES[0],
    period_month: now.getMonth() + 1,
    period_year: now.getFullYear(),
    amount: '',
    payment_date: now.toISOString().slice(0, 10),
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setForm({
        tax_type: TAX_TYPES[0],
        period_month: now.getMonth() + 1,
        period_year: now.getFullYear(),
        amount: '',
        payment_date: now.toISOString().slice(0, 10),
        note: '',
      });
      setErr('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    setSaving(true);
    setErr('');
    try {
      if (!form.amount || Number(form.amount) <= 0) throw new Error('Сумма должна быть > 0');
      await createTaxPayment({
        organization_id: organizationId,
        station_id: stationId,
        tax_type: form.tax_type,
        period_month: form.period_month,
        period_year: form.period_year,
        amount: Number(form.amount),
        payment_date: form.payment_date,
        note: form.note || null,
        created_by: userId,
      });
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet open={open} onClose={onClose} title="Новый налоговый платёж" onSubmit={submit} saving={saving} error={err}>
      <Select label="Тип налога" value={form.tax_type} onChange={(e) => setForm({ ...form, tax_type: e.target.value })}>
        {TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </Select>

      <div className="grid grid-cols-2 gap-3">
        <Select label="Период (месяц)" value={form.period_month} onChange={(e) => setForm({ ...form, period_month: Number(e.target.value) })}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </Select>
        <Input label="Период (год)" type="number" value={form.period_year} onChange={(e) => setForm({ ...form, period_year: Number(e.target.value) })} />
      </div>

      <Input label="Сумма" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
      <Input label="Дата платежа" type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required />
      <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
    </FormSheet>
  );
}
