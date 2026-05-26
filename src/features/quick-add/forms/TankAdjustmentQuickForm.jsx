// [CREATED BY ANTIGRAVITY CLI - 2026-05-26]
// Project: Fingas
// Purpose: Quick form to adjust a fuel reservoir's physical balance (saved to tank_adjustments).

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createAdjustment } from '@/services/tankService';
import { useAuth } from '@/hooks/useAuth';

export function TankAdjustmentQuickForm({ onDone, onCancel, defaultTankId, defaultFuelType }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    date: today,
    liters: '',
    reason: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    const liters = Number(form.liters);
    if (!liters) {
      setErr('Введите литры (можно отрицательные)');
      return;
    }
    if (!form.reason.trim()) {
      setErr('Укажите причину');
      return;
    }
    setSaving(true);
    try {
      await createAdjustment({
        organization_id: orgId,
        station_id: user?.profile?.station_id || null,
        tank_id: defaultTankId,
        fuel_code: defaultFuelType || null,
        date: form.date,
        liters,
        reason: form.reason.trim(),
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
      <Input
        label="Дата"
        type="date"
        value={form.date}
        onChange={(e) => setForm({ ...form, date: e.target.value })}
        required
      />
      <Input
        label="Литры (+ или −)"
        type="number"
        step="0.001"
        value={form.liters}
        onChange={(e) => setForm({ ...form, liters: e.target.value })}
        hint="Положительное значение добавит объем (например, излишек), отрицательное — спишет."
        required
      />
      <Input
        label="Причина"
        placeholder="Полив дождём / недолив / расхождение"
        value={form.reason}
        onChange={(e) => setForm({ ...form, reason: e.target.value })}
        required
      />
      <Input
        label="Комментарий"
        placeholder="Необязательное примечание..."
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
      />

      {err && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5">
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Назад
        </Button>
        <Button type="submit" variant="success" loading={saving}>
          <Check className="w-4 h-4" /> Сохранить
        </Button>
      </div>
    </form>
  );
}
