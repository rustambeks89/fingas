// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: In-place TRK calibration form.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createCalibration } from '@/services/fuelService';
import { useAuth } from '@/hooks/useAuth';

const FUEL_TYPES = ['АИ-92', 'АИ-95', 'АИ-98', 'ДТ', 'Газ'];

export function CalibrationQuickForm({ onDone, onCancel }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const now = new Date();

  const [form, setForm] = useState({
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    fuel: 'АИ-92',
    volume: '',
    trk_number: '',
    operator: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    const volume = Number(form.volume);
    if (!volume || volume <= 0) { setErr('Введите объём поверки'); return; }
    if (!stationId) { setErr('У вас не назначена АЗС'); return; }
    setSaving(true);
    try {
      await createCalibration({
        organization_id: orgId,
        station_id: stationId,
        date: form.date,
        time: form.time,
        fuel: form.fuel,
        volume,
        trk_number: form.trk_number || null,
        operator: form.operator || null,
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
      <div className="grid grid-cols-2 gap-3">
        <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <Input label="Время" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
      </div>

      <Select label="Топливо" value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })}>
        {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </Select>

      <Input label="Объём поверки, л" type="number" step="0.001" min="0" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} required />
      <Input label="№ ТРК" value={form.trk_number} onChange={(e) => setForm({ ...form, trk_number: e.target.value })} />
      <Input label="Кто проводил" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} />
      <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

      <div className="text-xs text-ink-soft">
        Поверка не учитывается в реальной выручке — для этого добавьте соответствующую строку в sales_exclusions (отдельный экран).
      </div>

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
