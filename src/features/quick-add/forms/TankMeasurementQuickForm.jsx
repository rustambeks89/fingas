// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: In-place tank measurement form. level_cm AND liters are stored
// separately — operator picks which unit they're entering. Если введена высота
// в см и у бака заполнена градуировочная таблица — литры пересчитываются
// автоматически по интерполяционному RPC fingas_tank_liters_at_cm.

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createTankMeasurement } from '@/services/fuelService';
import { listStations } from '@/services/stationService';
import { listTankCalibrationGrid, tankLitersAtCm } from '@/services/tankService';
import { useAuth } from '@/hooks/useAuth';
import { useFormPersistence } from '@/hooks/useFormPersistence';

const FUEL_TYPES = ['АИ-92', 'АИ-95', 'АИ-98', 'ДТ', 'Газ'];

export function TankMeasurementQuickForm({ onDone, onCancel, defaultTankId = null, defaultFuelType = null }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const profileStationId = user?.profile?.station_id ?? null;
  const now = new Date();

  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState(profileStationId ?? '');
  const [gridSize, setGridSize] = useState(0);
  const [computedLiters, setComputedLiters] = useState(null);
  const [form, setForm, clearDraft] = useFormPersistence('tank_measurement_quick', {
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    fuel_type: defaultFuelType ?? 'АИ-92',
    unit: 'cm',              // cm | liters — по умолчанию см, чтобы можно было считать по градуировке
    value: '',
    temperature: '',
    water_level: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    listStations(orgId).then((rows) => {
      if (cancelled) return;
      setStations(rows);
      if (!stationId && rows.length > 0) {
        setStationId(rows[0].id);
      }
    }).catch(() => { if (!cancelled) setStations([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Размер градуировки выбранного бака — чтобы понять, можно ли вообще считать.
  useEffect(() => {
    if (!defaultTankId) { setGridSize(0); return; }
    let cancelled = false;
    listTankCalibrationGrid({ tankId: defaultTankId })
      .then((rows) => { if (!cancelled) setGridSize(rows.length); })
      .catch(() => { if (!cancelled) setGridSize(0); });
    return () => { cancelled = true; };
  }, [defaultTankId]);

  // При вводе см — дёргаем серверный RPC и считаем литры по градуировке.
  useEffect(() => {
    let cancelled = false;
    if (form.unit !== 'cm' || !defaultTankId || form.value === '') {
      setComputedLiters(null); return;
    }
    const cm = Number(form.value);
    if (!Number.isFinite(cm)) { setComputedLiters(null); return; }
    tankLitersAtCm({ tankId: defaultTankId, heightCm: cm })
      .then((l) => { if (!cancelled) setComputedLiters(l); })
      .catch(() => { if (!cancelled) setComputedLiters(null); });
    return () => { cancelled = true; };
  }, [defaultTankId, form.unit, form.value]);

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    const value = Number(form.value);
    if (!value || value <= 0) { setErr('Введите значение замера'); return; }
    const chosenStationId = stationId || profileStationId;
    if (!chosenStationId) { setErr('Выберите АЗС'); return; }
    setSaving(true);
    try {
      // Если оператор ввёл см и градуировка подсказала литры — пишем оба значения.
      const writeLevelCm = form.unit === 'cm' ? value : null;
      const writeLiters  = form.unit === 'liters'
        ? value
        : (computedLiters != null ? computedLiters : null);
      await createTankMeasurement({
        organization_id: orgId,
        station_id: chosenStationId,
        tank_id: defaultTankId || null,
        date: form.date,
        time: form.time,
        fuel_type: form.fuel_type,
        level_cm: writeLevelCm,
        liters: writeLiters,
        temperature: form.temperature ? Number(form.temperature) : null,
        water_level: form.water_level ? Number(form.water_level) : null,
        measured_by: user?.id,
        note: form.note || null,
      });
      clearDraft();
      onDone?.();
    } catch (e2) {
      setErr(e2?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  const showStationPicker = stations.length > 1 || (!profileStationId && stations.length > 0);
  const gridReady = !!defaultTankId && gridSize >= 2;

  return (
    <form onSubmit={submit} className="space-y-4">
      {showStationPicker && (
        <Select label="АЗС" value={stationId} onChange={(e) => setStationId(e.target.value)}>
          <option value="">— Выберите АЗС —</option>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <Input label="Время" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
      </div>

      {!defaultFuelType && (
        <Select label="Топливо" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}>
          {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-ink-muted">Единица замера</div>
          {defaultTankId && (
            <span className={'text-[10px] ' + (gridReady ? 'text-success' : 'text-warning')}>
              {gridReady ? `Градуировка: ${gridSize} точек` : 'Нет градуировки'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
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

      {form.unit === 'cm' && defaultTankId && (
        <div className={
          'rounded-2xl border p-3 text-xs ' +
          (computedLiters != null
            ? 'border-success/30 bg-success/10 text-success'
            : 'border-warning/30 bg-warning/10 text-warning')
        }>
          {computedLiters != null ? (
            <>
              По градуировочной таблице:{' '}
              <span className="font-semibold">
                {computedLiters.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} л
              </span>
              {' — '}запишем как остаток.
            </>
          ) : (
            gridReady
              ? 'Введённая высота вне диапазона градуировки — добавь крайние точки.'
              : 'У бака нет градуировочной таблицы. Заполни её в Меню → Справочники → Градуировочная таблица, тогда литры подсчитаются автоматически.'
          )}
        </div>
      )}

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
