// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: In-place fuel supply (поступление топлива) form.

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createFuelSupply } from '@/services/fuelService';
import { listCounterparties } from '@/services/counterpartyService';
import { listStations } from '@/services/stationService';
import { useAuth } from '@/hooks/useAuth';

const FUEL_TYPES = ['АИ-92', 'АИ-95', 'АИ-98', 'ДТ', 'Газ'];

export function FuelSupplyQuickForm({ onDone, onCancel }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const today = new Date().toISOString().slice(0, 10);

  const [suppliers, setSuppliers] = useState([]);
  const [stations, setStations] = useState([]);
  const [form, setForm] = useState({
    date: today,
    station_id: '',
    supplier_id: '',
    fuel_type: 'АИ-92',
    doc_number: '',
    liters_doc: '',
    liters_actual: '',
    price_per_liter: '',
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
        doc_number: form.doc_number || null,
        liters_doc,
        liters_actual,
        price_per_liter,
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

  const variance = (Number(form.liters_actual) || 0) - (Number(form.liters_doc) || 0);
  const total = (Number(form.liters_actual) || 0) * (Number(form.price_per_liter) || 0);

  return (
    <form onSubmit={submit} className="space-y-4">
      <Select label="АЗС" value={form.station_id || stationId || ''} onChange={(e) => setForm({ ...form, station_id: e.target.value })}>
        <option value="">— Выберите АЗС —</option>
        {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <Select label="Топливо" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}>
          {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
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
          (variance === 0 ? 'bg-success/10 border-success/30 text-success' :
           variance < 0 ? 'bg-danger/10 border-danger/30 text-danger' :
                          'bg-warning/10 border-warning/30 text-warning')
        }>
          Расхождение: {variance.toFixed(3)} л
        </div>
      )}

      <Input label="Цена за литр" type="number" step="0.01" min="0" value={form.price_per_liter} onChange={(e) => setForm({ ...form, price_per_liter: e.target.value })} required />

      {total > 0 && (
        <div className="rounded-2xl bg-bg-elevated border border-line p-3 flex items-center justify-between">
          <div className="text-sm text-ink-muted">К оплате</div>
          <div className="text-lg font-semibold text-ink">{total.toLocaleString('ru-RU')} сом</div>
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
