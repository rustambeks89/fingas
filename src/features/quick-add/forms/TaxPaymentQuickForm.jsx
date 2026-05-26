// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: In-place tax payment form. Trigger 0010 shadows it into cashflow.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createTaxPayment } from '@/services/taxService';
import { useAuth } from '@/hooks/useAuth';
import { TAX_TYPES } from '@/lib/constants';

const MONTHS = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
];

export function TaxPaymentQuickForm({ onDone, onCancel }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
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

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setErr('Сумма должна быть > 0'); return; }
    setSaving(true);
    try {
      await createTaxPayment({
        organization_id: orgId,
        station_id: stationId,
        tax_type: form.tax_type,
        period_month: form.period_month,
        period_year: form.period_year,
        amount: amt,
        payment_date: form.payment_date,
        note: form.note || null,
        created_by: user?.id,
      });
      onDone?.();
    } catch (e2) {
      setErr(e2?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Select label="Тип налога" value={form.tax_type} onChange={(e) => setForm({ ...form, tax_type: e.target.value })}>
        {TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </Select>

      <div className="grid grid-cols-2 gap-3">
        <Select label="Период (месяц)" value={form.period_month} onChange={(e) => setForm({ ...form, period_month: Number(e.target.value) })}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </Select>
        <Input label="Год" type="number" value={form.period_year} onChange={(e) => setForm({ ...form, period_year: Number(e.target.value) })} />
      </div>

      <Input label="Сумма" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
      <Input label="Дата платежа" type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required />
      <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

      {err && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5">{err}</div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Назад</Button>
        <Button type="submit" variant="success" loading={saving}>
          <Check className="w-4 h-4" /> Сохранить
        </Button>
      </div>
    </form>
  );
}
