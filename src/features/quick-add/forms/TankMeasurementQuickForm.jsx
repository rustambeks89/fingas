// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: In-place tank measurement form. level_cm AND liters are stored
// separately — operator picks which unit they're entering.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createTankMeasurement } from '@/services/fuelService';
import { useAuth } from '@/hooks/useAuth';

const FUEL_TYPES = ['АИ-92', 'АИ-95', 'АИ-98', 'ДТ', 'Газ'];

export function TankMeasurementQuickForm({ onDone, onCancel }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const now = new Date();

  const [form, setForm] = useState({
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    fuel_type: 'АИ-92',
    unit: 'liters',          // liters | cm
    value: '',
    temperature: '',
    water_level: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    const value = Number(form.value);
    if (!value || value <= 0) { setErr('Введите значение замера'); return; }
    if (!stationId) { setErr('У вас не назначена АЗС'); return; }
    setSaving(true);
    try {
      await createTankMeasurement({
        organization_id: orgId,
        station_id: stationId,
        date: form.date,
        time: form.time,
        fuel_type: form.fuel_type,
        level_cm: form.unit === 'cm' ? value : null,
        liters: form.unit === 'liters' ? value : null,
        temperature: form.temperature ? Number(form.temperature) : null,
        water_level: form.water_level ? Number(form.water_level) : null,
        measured_by: user?.id,
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
      <div className="grid grid-cols-2 gap-3">
        <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <Input label="Время" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
      </div>

      <Select label="Топливо" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}>
        {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </Select>

      <div>
        <div className="text-sm text-ink-muted mb-2">Единица замера</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setForm({ ...form, unit: 'liters' })}
            className={
              'h-11 rounded-2xl border text-sm font-medium transition-colors ' +
              (form.unit === 'liters'
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-bg-elevated text-ink-muted border-line')
            }
          >
            Литры
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, unit: 'cm' })}
            className={
              'h-11 rounded-2xl border text-sm font-medium transition-colors ' +
              (form.unit === 'cm'
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-bg-elevated text-ink-muted border-line')
            }
          >
            Сантиметры
          </button>
        </div>
      </div>

      <Input
        label={form.unit === 'cm' ? 'Уровень, см' : 'Литры'}
        type="number"
        step="0.01"
        min="0"
        value={form.value}
        onChange={(e) => setForm({ ...form, value: e.target.value })}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Температура, °C" type="number" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
        <Input label="Подтоварная вода" type="number" step="0.1" value={form.water_level} onChange={(e) => setForm({ ...form, water_level: e.target.value })} />
      </div>

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
