// [CREATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY CODEX - 2026-05-25]
// Project: Fingas
// Purpose: Fuel supply list + create flow for inbound supplier deliveries.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Fuel, Gauge, Pencil, Plus, ReceiptText, Thermometer, Trash2 } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { createFuelSupply, deleteFuelSupply, listFuelSupply, updateFuelSupply } from '@/services/fuelService';
import { listCounterparties } from '@/services/counterpartyService';
import { listStations } from '@/services/stationService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatDate, formatLiters, formatMoney } from '@/lib/formatters';
import { isNonEmpty, isNonNegativeNumber, isPositiveNumber } from '@/lib/validators';

const FUEL_TYPES = ['АИ-92', 'АИ-95', 'ДТ', 'Газ'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function makeEmptyForm() {
  return {
    date: todayISO(),
    station_id: '',
    supplier_id: '',
    fuel_type: FUEL_TYPES[0],
    doc_number: '',
    liters_doc: '',
    liters_actual: '',
    price_per_liter: '',
    density: '',
    temperature: '',
    driver: '',
    vehicle: '',
    note: '',
  };
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

export default function FuelSupplyScreen() {
  const { user } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState(() => makeEmptyForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const organizationId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;

  const loadData = useCallback(async () => {
    if (!organizationId) {
      setRows([]);
      setSuppliers([]);
      setLoading(false);
      return;
    }

    setErr('');
    setLoading(true);
    try {
      const [fuelSupplyRows, supplierRows, stationRows] = await Promise.all([
        listFuelSupply({ stationId }),
        listCounterparties({ organizationId, type: 'supplier', active: true }),
        listStations(organizationId).catch(() => []),
      ]);
      setRows(fuelSupplyRows);
      setSuppliers(supplierRows);
      setStations(stationRows);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить поступления топлива.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, stationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const actual = toNumber(row.liters_actual);
        const doc = toNumber(row.liters_doc);
        const amount = row.total_amount == null
          ? actual * toNumber(row.price_per_liter)
          : toNumber(row.total_amount);
        acc.liters += actual;
        acc.variance += actual - doc;
        acc.amount += amount;
        return acc;
      },
      { liters: 0, variance: 0, amount: 0 },
    );
  }, [rows]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function openCreateSheet() {
    setEditingRow(null);
    setForm({ ...makeEmptyForm(), station_id: stationId ?? '' });
    setFormError('');
    setSheetOpen(true);
  }

  function openEditSheet(row) {
    setEditingRow(row);
    setForm({
      date: row.date ?? todayISO(),
      station_id: row.station_id ?? stationId ?? '',
      supplier_id: row.supplier_id ?? '',
      fuel_type: row.fuel_type ?? FUEL_TYPES[0],
      doc_number: row.doc_number ?? '',
      liters_doc: row.liters_doc ?? '',
      liters_actual: row.liters_actual ?? '',
      price_per_liter: row.price_per_liter ?? '',
      density: row.density ?? '',
      temperature: row.temperature ?? '',
      driver: row.driver ?? '',
      vehicle: row.vehicle ?? '',
      note: row.note ?? '',
    });
    setFormError('');
    setSheetOpen(true);
  }

  function validateForm() {
    const chosenStationId = form.station_id || stationId;
    if (!chosenStationId) return 'Выберите АЗС.';
    if (!isNonEmpty(form.date)) return 'Укажите дату поступления.';
    if (!isNonEmpty(form.fuel_type)) return 'Выберите вид топлива.';
    if (!isNonNegativeNumber(form.liters_doc)) return 'Укажите объем по документу.';
    if (!isPositiveNumber(form.liters_actual)) return 'Фактический объем должен быть больше нуля.';
    if (!isNonNegativeNumber(form.price_per_liter)) return 'Укажите корректную цену за литр.';
    return '';
  }

  async function submitFuelSupply() {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const chosenStationId = form.station_id || stationId;
      const payload = {
        organization_id: organizationId,
        station_id: chosenStationId,
        supplier_id: form.supplier_id || null,
        date: form.date,
        fuel_type: form.fuel_type,
        doc_number: cleanText(form.doc_number),
        liters_doc: toNumber(form.liters_doc),
        liters_actual: toNumber(form.liters_actual),
        price_per_liter: toNumber(form.price_per_liter),
        density: toNullableNumber(form.density),
        temperature: toNullableNumber(form.temperature),
        driver: cleanText(form.driver),
        vehicle: cleanText(form.vehicle),
        note: cleanText(form.note),
        created_by: user?.id,
      };
      if (editingRow) {
        await updateFuelSupply(editingRow.id, payload);
      } else {
        await createFuelSupply(payload);
      }
      setSheetOpen(false);
      setForm(makeEmptyForm());
      setEditingRow(null);
      await loadData();
    } catch (e) {
      setFormError(e?.message ?? 'Не удалось сохранить поступление.');
    } finally {
      setSaving(false);
    }
  }

  async function removeFuelSupply() {
    if (!editingRow) return;
    if (!confirm('Удалить поступление топлива?')) return;
    setDeleting(true);
    setFormError('');
    try {
      await deleteFuelSupply(editingRow.id);
      setSheetOpen(false);
      setEditingRow(null);
      setForm(makeEmptyForm());
      await loadData();
    } catch (e) {
      setFormError(e?.message ?? 'Не удалось удалить поступление.');
    } finally {
      setDeleting(false);
    }
  }

  async function removeFuelSupplyQuick(row) {
    if (!confirm('Удалить поступление топлива?')) return;
    setDeleting(true);
    setFormError('');
    try {
      await deleteFuelSupply(row.id);
      await loadData();
    } catch (e) {
      setFormError(e?.message ?? 'Не удалось удалить поступление.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <ScreenHeader
        title="Поступления топлива"
        subtitle="Плотность, объем, документ и приемка"
        right={canCreate(MODULES.FUEL_SUPPLY) ? (
          <Button size="sm" onClick={openCreateSheet}>
            <Plus className="w-4 h-4" />
            Добавить
          </Button>
        ) : null}
      />

      {err && <Card className="text-sm text-danger mb-3">{err}</Card>}
      {!loading && rows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">
              <Fuel className="w-3 h-3 text-brand-500" />
              Журнал приемки топлива
            </div>
            <div className="mt-1 text-xl font-bold text-ink">{formatMoney(totals.amount)}</div>
            <div className="mt-0.5 text-xs text-ink-muted">Сумма всех зафиксированных поставок</div>
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              <SummaryCard label="Факт" value={formatLiters(totals.liters)} />
              <SummaryCard label="Сумма" value={formatMoney(totals.amount)} />
              <SummaryCard label="Разница" value={formatLiters(totals.variance)} />
            </div>
          </div>
        </motion.div>
      )}

      {loading && <SkeletonList />}
      {!loading && rows.length === 0 && (
        <EmptyState
          icon={Fuel}
          title="Нет поступлений"
          description="Добавьте первое поступление топлива."
        />
      )}

      <div className="space-y-3">
        {rows.map((row, index) => (
          <motion.div
            key={row.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
          >
            <FuelSupplyCard
              row={row}
              canEdit={canEdit(MODULES.FUEL_SUPPLY)}
              canDelete={canDelete(MODULES.FUEL_SUPPLY)}
              onEdit={() => openEditSheet(row)}
              onDelete={() => removeFuelSupplyQuick(row)}
            />
          </motion.div>
        ))}
      </div>

      <FormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingRow ? 'Редактировать поступление' : 'Новое поступление'}
        onSubmit={submitFuelSupply}
        saving={saving}
        error={formError}
        onDelete={editingRow ? removeFuelSupply : null}
        deleting={deleting}
      >
        <Select
          label="АЗС"
          value={form.station_id || stationId || ''}
          onChange={(e) => patchForm({ station_id: e.target.value })}
        >
          <option value="">— Выберите АЗС —</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>

        <Input
          label="Дата"
          type="date"
          value={form.date}
          onChange={(e) => patchForm({ date: e.target.value })}
        />

        <Select
          label="Поставщик"
          value={form.supplier_id}
          onChange={(e) => patchForm({ supplier_id: e.target.value })}
        >
          <option value="">Без поставщика</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Топливо"
            value={form.fuel_type}
            onChange={(e) => patchForm({ fuel_type: e.target.value })}
          >
            {FUEL_TYPES.map((fuelType) => (
              <option key={fuelType} value={fuelType}>
                {fuelType}
              </option>
            ))}
          </Select>
          <Input
            label="Накладная"
            value={form.doc_number}
            onChange={(e) => patchForm({ doc_number: e.target.value })}
            placeholder="№"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="По документу, л"
            type="number"
            min="0"
            step="0.001"
            value={form.liters_doc}
            onChange={(e) => patchForm({ liters_doc: e.target.value })}
          />
          <Input
            label="Факт, л"
            type="number"
            min="0"
            step="0.001"
            value={form.liters_actual}
            onChange={(e) => patchForm({ liters_actual: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Цена за литр"
            type="number"
            min="0"
            step="0.0001"
            value={form.price_per_liter}
            onChange={(e) => patchForm({ price_per_liter: e.target.value })}
          />
          <Input
            label="Плотность"
            type="number"
            min="0"
            step="0.0001"
            value={form.density}
            onChange={(e) => patchForm({ density: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Температура"
            type="number"
            step="0.01"
            value={form.temperature}
            onChange={(e) => patchForm({ temperature: e.target.value })}
          />
          <Input
            label="Водитель"
            value={form.driver}
            onChange={(e) => patchForm({ driver: e.target.value })}
          />
        </div>

        <Input
          label="Авто"
          value={form.vehicle}
          onChange={(e) => patchForm({ vehicle: e.target.value })}
          placeholder="Госномер или модель"
        />

        <Input
          label="Комментарий"
          value={form.note}
          onChange={(e) => patchForm({ note: e.target.value })}
        />
      </FormSheet>
    </div>
  );
}

function FuelSupplyCard({ row, canEdit, canDelete, onEdit, onDelete }) {
  const variance = row.variance == null
    ? toNumber(row.liters_actual) - toNumber(row.liters_doc)
    : toNumber(row.variance);
  const amount = row.total_amount == null
    ? toNumber(row.liters_actual) * toNumber(row.price_per_liter)
    : toNumber(row.total_amount);
  const varianceTone = Math.abs(variance) < 0.001
    ? 'success'
    : variance < 0
      ? 'danger'
      : 'warning';

  return (
    <Card hoverable className="!p-3.5 rounded-xl border border-line/30 bg-bg-card shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
          <Fuel className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="text-xs font-bold text-ink truncate">
                  {row.fuel_type}
                </div>
                <Badge tone={varianceTone}>
                  {variance === 0 ? 'Сошлось' : variance > 0 ? 'Излишек' : 'Недостача'}
                </Badge>
              </div>
              <div className="text-[10px] text-ink-soft mt-0.5">
                {formatDate(row.date)} · {row.supplier?.name ?? 'Поставщик не указан'}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-bold text-ink leading-tight">{formatMoney(amount)}</div>
              <div className="text-[10px] text-ink-muted">{formatLiters(row.liters_actual)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2.5">
            <DetailPill icon={Gauge} label={`Факт ${formatLiters(row.liters_actual)}`} />
            <DetailPill icon={Gauge} label={`Документ ${formatLiters(row.liters_doc)}`} />
            <DetailPill icon={ReceiptText} label={row.doc_number ? `Накладная ${row.doc_number}` : 'Номер документа не указан'} />
            <DetailPill icon={Thermometer} label={row.temperature != null ? `${row.temperature}°C` : 'Температура не указана'} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <Badge tone={varianceTone}>Разница {formatLiters(variance)}</Badge>
            {row.density != null && <Badge tone="default">Плотность {row.density}</Badge>}
            {row.driver && <Badge tone="default">{row.driver}</Badge>}
            {row.vehicle && <Badge tone="default">{row.vehicle}</Badge>}
          </div>

          {(canEdit || canDelete) && (
            <div className="mt-2.5 flex items-center gap-2">
              {canEdit && (
                <Button size="sm" variant="secondary" className="h-8 px-2.5" onClick={onEdit}>
                  <Pencil className="w-3.5 h-3.5" /> Изменить
                </Button>
              )}
              {canDelete && (
                <Button size="sm" variant="danger" className="h-8 px-2.5" onClick={onDelete}>
                  <Trash2 className="w-3.5 h-3.5" /> Удалить
                </Button>
              )}
            </div>
          )}

          {(row.driver || row.vehicle || row.note) && (
            <div className="mt-2.5 rounded-lg bg-bg-soft/40 border border-line/20 px-2.5 py-1.5 text-[11px] text-ink-muted leading-relaxed">
              {[row.driver && `Водитель: ${row.driver}`, row.vehicle && `Транспорт: ${row.vehicle}`, row.note].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl bg-bg-card/70 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className="text-xs font-bold text-ink mt-0.5 truncate">{value}</div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-40 rounded-[2rem] bg-bg-card border border-line/60 animate-pulse" />
      ))}
    </div>
  );
}

function DetailPill({ icon: Icon, label }) {
  return (
    <div className="rounded-2xl bg-bg-soft/55 border border-line/35 px-3 py-2 text-xs text-ink-muted flex items-center gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
