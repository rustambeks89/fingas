// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: In-place fuel supply (поступление топлива) form. Замеры — по
// высоте уровня в см, пересчёт в литры через градуировочную таблицу резервуара.

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createFuelSupply } from '@/services/fuelService';
import { listCounterparties } from '@/services/counterpartyService';
import { listStations } from '@/services/stationService';
import { tankLitersAtCm, listTankCalibrationGrid } from '@/services/tankService';
import { useAuth } from '@/hooks/useAuth';

const FUEL_TYPES = ['АИ-92', 'АИ-95', 'АИ-98', 'ДТ', 'Газ'];

export function FuelSupplyQuickForm({ onDone, onCancel, defaultTankId = null, defaultFuelType = null }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const today = new Date().toISOString().slice(0, 10);

  const [suppliers, setSuppliers] = useState([]);
  const [stations, setStations] = useState([]);
  const [gridSize, setGridSize] = useState(0); // points count in tank's grid
  const [litersBefore, setLitersBefore] = useState(null);
  const [litersAfter, setLitersAfter] = useState(null);
  const [form, setForm] = useState({
    date: today,
    station_id: '',
    supplier_id: '',
    fuel_type: defaultFuelType ?? 'АИ-92',
    doc_number: '',
    liters_doc: '',
    liters_actual: '',
    price_per_liter: '',
    level_before_cm: '',
    level_after_cm: '',
    logistics_cost: '',
    driver: '',
    vehicle: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      listCounterparties({ organizationId: orgId, type: 'supplier', active: true }),
      listStations(orgId).catch(() => []),
    ]).then(([supplierRows, stationRows]) => {
      setSuppliers(supplierRows);
      setStations(stationRows);
    }).catch(() => {
      setSuppliers([]);
      setStations([]);
    });
  }, [orgId]);

  // Load grid size for the selected tank to know if conversion is available.
  useEffect(() => {
    if (!defaultTankId) { setGridSize(0); return; }
    let cancelled = false;
    listTankCalibrationGrid({ tankId: defaultTankId })
      .then((rows) => { if (!cancelled) setGridSize(rows.length); })
      .catch(() => { if (!cancelled) setGridSize(0); });
    return () => { cancelled = true; };
  }, [defaultTankId]);

  // Recompute liters-before whenever level_before_cm changes.
  useEffect(() => {
    let cancelled = false;
    const cm = Number(form.level_before_cm);
    if (!defaultTankId || form.level_before_cm === '' || !Number.isFinite(cm)) {
      setLitersBefore(null); return;
    }
    tankLitersAtCm({ tankId: defaultTankId, heightCm: cm })
      .then((l) => { if (!cancelled) setLitersBefore(l); })
      .catch(() => { if (!cancelled) setLitersBefore(null); });
    return () => { cancelled = true; };
  }, [defaultTankId, form.level_before_cm]);

  useEffect(() => {
    let cancelled = false;
    const cm = Number(form.level_after_cm);
    if (!defaultTankId || form.level_after_cm === '' || !Number.isFinite(cm)) {
      setLitersAfter(null); return;
    }
    tankLitersAtCm({ tankId: defaultTankId, heightCm: cm })
      .then((l) => { if (!cancelled) setLitersAfter(l); })
      .catch(() => { if (!cancelled) setLitersAfter(null); });
    return () => { cancelled = true; };
  }, [defaultTankId, form.level_after_cm]);

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    const liters_doc = Number(form.liters_doc) || 0;
    const liters_actual = Number(form.liters_actual) || liters_doc;
    const price_per_liter = Number(form.price_per_liter);
    if (!liters_actual || liters_actual <= 0) { setErr('Введите фактический объём'); return; }
    if (!price_per_liter || price_per_liter <= 0) { setErr('Введите цену за литр'); return; }
    const chosenStationId = form.station_id || stationId;
    if (!chosenStationId) { setErr('Выберите АЗС'); return; }
    setSaving(true);
    try {
      await createFuelSupply({
        organization_id: orgId,
        station_id: chosenStationId,
        supplier_id: form.supplier_id || null,
        date: form.date,
        fuel_type: form.fuel_type,
        tank_id: defaultTankId || null,
        doc_number: form.doc_number || null,
        liters_doc,
        liters_actual,
        price_per_liter,
        level_before_cm: form.level_before_cm !== '' ? Number(form.level_before_cm) : null,
        level_after_cm: form.level_after_cm !== '' ? Number(form.level_after_cm) : null,
        measurement_before_liters: litersBefore,
        measurement_after_liters: litersAfter,
        logistics_cost: form.logistics_cost !== '' ? Number(form.logistics_cost) : 0,
        driver: form.driver || null,
        vehicle: form.vehicle || null,
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

  const litersDoc = Number(form.liters_doc) || 0;
  const litersActual = Number(form.liters_actual) || 0;
  const pricePerLiter = Number(form.price_per_liter) || 0;
  const logistics = Number(form.logistics_cost) || 0;
  const docVariance = litersActual - litersDoc;
  const supplierTotal = litersActual * pricePerLiter;
  const costPerLiterTotal = litersActual > 0 ? (supplierTotal + logistics) / litersActual : 0;

  const measuredDelta = (litersBefore != null && litersAfter != null) ? litersAfter - litersBefore : null;
  const measureVsDoc = (measuredDelta != null && litersDoc > 0) ? measuredDelta - litersDoc : null;

  const lockFuel = !!defaultFuelType;
  const gridReady = !!defaultTankId && gridSize >= 2;

  return (
    <form onSubmit={submit} className="space-y-4">
      <Select label="АЗС" value={form.station_id || stationId || ''} onChange={(e) => setForm({ ...form, station_id: e.target.value })}>
        <option value="">— Выберите АЗС —</option>
        {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>

      <div className={'grid gap-3 ' + (lockFuel ? 'grid-cols-1' : 'grid-cols-2')}>
        <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        {!lockFuel && (
          <Select label="Топливо" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}>
            {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}
      </div>

      <Select label="Поставщик" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
        <option value="">— Не выбран —</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>

      <Input label="№ накладной" value={form.doc_number} onChange={(e) => setForm({ ...form, doc_number: e.target.value })} />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Литры (док)" type="number" step="0.001" min="0" value={form.liters_doc} onChange={(e) => setForm({ ...form, liters_doc: e.target.value })} />
        <Input label="Литры (факт)" type="number" step="0.001" min="0" value={form.liters_actual} onChange={(e) => setForm({ ...form, liters_actual: e.target.value })} required />
      </div>

      {form.liters_doc && form.liters_actual && (
        <div className={
          'text-xs rounded-xl px-3 py-2 border ' +
          (docVariance === 0 ? 'bg-success/10 border-success/30 text-success' :
           docVariance < 0 ? 'bg-danger/10 border-danger/30 text-danger' :
                             'bg-warning/10 border-warning/30 text-warning')
        }>
          Расхождение док ↔ факт: {docVariance.toFixed(3)} л
        </div>
      )}

      <div className="rounded-2xl border border-line/50 bg-bg-elevated/60 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft font-bold">Замеры резервуара</div>
          {defaultTankId && (
            <span className={'text-[10px] ' + (gridReady ? 'text-success' : 'text-warning')}>
              {gridReady ? `Градуировка: ${gridSize} точек` : 'Нет градуировки'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Замер до, см"
            type="number" step="0.1" min="0"
            value={form.level_before_cm}
            onChange={(e) => setForm({ ...form, level_before_cm: e.target.value })}
          />
          <Input
            label="Замер после, см"
            type="number" step="0.1" min="0"
            value={form.level_after_cm}
            onChange={(e) => setForm({ ...form, level_after_cm: e.target.value })}
          />
        </div>
        {!defaultTankId && (
          <div className="text-[11px] text-ink-soft">
            Открой форму из конкретного резервуара, чтобы пересчёт см → литры
            считался по его градуировочной таблице.
          </div>
        )}
        {defaultTankId && !gridReady && (
          <div className="text-[11px] text-warning">
            Заполни «Градуировочная таблица» (Меню → Справочники), чтобы расхождение по замерам считалось автоматически.
          </div>
        )}
        {(litersBefore != null || litersAfter != null) && (
          <div className="text-xs text-ink-muted space-y-0.5">
            {litersBefore != null && <div>До: <span className="font-semibold text-ink">{litersBefore.toFixed(3)} л</span></div>}
            {litersAfter != null && <div>После: <span className="font-semibold text-ink">{litersAfter.toFixed(3)} л</span></div>}
            {measuredDelta != null && (
              <div className="pt-1 border-t border-line/40">
                По замерам залито: <span className="font-semibold text-ink">{measuredDelta.toFixed(3)} л</span>
                {measureVsDoc != null && (
                  <span className={'ml-2 ' + (Math.abs(measureVsDoc) < 0.5 ? 'text-success' : measureVsDoc < 0 ? 'text-danger' : 'text-warning')}>
                    · vs накладная {measureVsDoc >= 0 ? '+' : ''}{measureVsDoc.toFixed(3)} л
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Input label="Цена за литр, сом" type="number" step="0.01" min="0" value={form.price_per_liter} onChange={(e) => setForm({ ...form, price_per_liter: e.target.value })} required />

      <Input
        label="Логистика (доставка), сом"
        type="number" step="0.01" min="0"
        value={form.logistics_cost}
        onChange={(e) => setForm({ ...form, logistics_cost: e.target.value })}
        hint="В долг поставщику НЕ идёт. Идёт в себестоимость литра и оплачивается перевозчику отдельно."
      />

      {supplierTotal > 0 && (
        <div className="rounded-2xl bg-bg-elevated border border-line p-3 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">К оплате поставщику</span>
            <span className="font-semibold text-ink">{supplierTotal.toLocaleString('ru-RU')} сом</span>
          </div>
          {logistics > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-soft">+ логистика (отдельно перевозчику)</span>
              <span className="text-ink-muted">{logistics.toLocaleString('ru-RU')} сом</span>
            </div>
          )}
          <div className="border-t border-line/50 pt-1.5 flex items-center justify-between text-sm">
            <span className="text-ink-muted">Себестоимость литра</span>
            <span className="font-semibold text-brand-400">
              {costPerLiterTotal.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} сом/л
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input label="Водитель" value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value })} />
        <Input label="Машина" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} />
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
