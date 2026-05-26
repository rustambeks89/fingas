// Purpose: Quick add form for supplier counterparties.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createCounterparty } from '@/services/counterpartyService';
import { useAuth } from '@/hooks/useAuth';

export function CounterpartyQuickForm({ onDone, onCancel }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;

  const [form, setForm] = useState({
    name: '',
    phone: '',
    inn: '',
    address: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    if (!orgId) {
      setErr('Организация не выбрана');
      return;
    }
    if (!form.name.trim()) {
      setErr('Введите название поставщика');
      return;
    }
    setSaving(true);
    try {
      await createCounterparty({
        organization_id: orgId,
        type: 'supplier',
        active: true,
        name: form.name.trim(),
        phone: form.phone || null,
        inn: form.inn || null,
        address: form.address || null,
        note: form.note || null,
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
      <Input label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ОсОО НК Этна" required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input label="ИНН" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
      </div>
      <Input label="Адрес" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

      {err && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5">{err}</div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Назад</Button>
        <Button type="submit" variant="success" loading={saving}>
          <Check className="w-4 h-4" /> Сохранить
        </Button>
      </div>
    </form>
  );
}
