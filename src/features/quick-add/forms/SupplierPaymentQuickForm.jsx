// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: In-place "Оплата поставщику" form. Writes to supplier_payments;
// trigger 0010 shadows it into cashflow + reduces counterparty.balance.

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { listCounterparties, paySupplier } from '@/services/counterpartyService';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney } from '@/lib/formatters';

export function SupplierPaymentQuickForm({ onDone, onCancel }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const today = new Date().toISOString().slice(0, 10);

  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState({
    supplier_id: '',
    amount: '',
    date: today,
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!orgId) return;
    listCounterparties({ organizationId: orgId, type: 'supplier', active: true })
      .then(setSuppliers).catch(() => setSuppliers([]));
  }, [orgId]);

  const chosen = suppliers.find((s) => s.id === form.supplier_id);
  const debt = chosen ? Number(chosen.balance ?? 0) : 0;

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    if (!form.supplier_id) { setErr('Выберите поставщика'); return; }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setErr('Сумма должна быть > 0'); return; }
    setSaving(true);
    try {
      await paySupplier({
        supplierId: form.supplier_id,
        organizationId: orgId,
        stationId,
        amount: amt,
        date: form.date,
        note: form.note,
        userId: user?.id,
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
      <Select label="Поставщик" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} required>
        <option value="">Выберите…</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{Number(s.balance) > 0 ? ` · долг ${Math.round(Number(s.balance))}` : ''}
          </option>
        ))}
      </Select>

      {chosen && debt > 0 && (
        <button
          type="button"
          onClick={() => setForm({ ...form, amount: String(debt) })}
          className="w-full rounded-2xl bg-warning/10 border border-warning/30 px-4 py-2.5 text-sm text-warning hover:bg-warning/15 transition-colors text-left"
        >
          Текущий долг: <span className="font-semibold">{formatMoney(debt)}</span> · нажмите чтобы погасить полностью
        </button>
      )}

      <Input label="Сумма" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
      <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
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
