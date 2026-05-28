// [CREATED BY CLAUDE CLI - 2026-05-26]
// Project: Fingas
// Purpose: Страница резервуара с табами «Поступление / Замер / Поверка /
// Корректировка». В одном месте — история операций по баку и быстрая запись
// новой. Открывается с главной (тап по карточке резервуара).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Droplets,
  Fuel,
  Gauge,
  Plus,
  Scale,
  Wrench,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { BottomSheet } from '@/components/bottom-sheets/BottomSheet';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import {
  computePhysicalBalance,
  createAdjustment,
  deleteAdjustment,
  getTank,
  listAdjustments,
  updateAdjustment,
} from '@/services/tankService';
import {
  deleteCalibration,
  deleteFuelSupply,
  deleteTankMeasurement,
  listCalibrations,
  listFuelSupply,
  listTankMeasurements,
  updateCalibration,
  updateFuelSupply,
  updateTankMeasurement,
} from '@/services/fuelService';
import { FuelSupplyQuickForm } from '@/features/quick-add/forms/FuelSupplyQuickForm';
import { TankMeasurementQuickForm } from '@/features/quick-add/forms/TankMeasurementQuickForm';
import { CalibrationQuickForm } from '@/features/quick-add/forms/CalibrationQuickForm';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, formatLiters } from '@/lib/formatters';

const TABS = [
  { id: 'supply',      label: 'Поступление',  icon: Fuel,    tone: 'success' },
  { id: 'measurement', label: 'Замер',        icon: Gauge,   tone: 'info'    },
  { id: 'calibration', label: 'Поверка',      icon: Wrench,  tone: 'warning' },
  { id: 'adjustment',  label: 'Корректировка', icon: Scale,  tone: 'brand'   },
];

export default function TankDetailScreen() {
  const { id: tankId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;

  const [tank, setTank] = useState(null);
  const [balance, setBalance] = useState(null);
  const [activeTab, setActiveTab] = useState('supply');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null); // { kind, row }

  const [supplies, setSupplies] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [calibrations, setCalibrations] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fuelCode = useMemo(() => tank?.fuel_type?.code ?? tank?.fuel_code ?? null, [tank]);

  const loadOps = useCallback(async () => {
    if (!tank) return;
    setLoading(true);
    try {
      const [sup, meas, cal, adj, bal] = await Promise.all([
        listFuelSupply({ stationId: tank.station_id, limit: 200 }).catch(() => []),
        listTankMeasurements({ stationId: tank.station_id, limit: 200 }).catch(() => []),
        listCalibrations({ stationId: tank.station_id, limit: 200 }).catch(() => []),
        listAdjustments({ tankId, organizationId: orgId, stationId: tank.station_id }).catch(() => []),
        computePhysicalBalance(tank).catch(() => null),
      ]);
      // фильтр по баку: либо по tank_id, либо по fuel_type если tank_id не записан
      const byTank = (row, fuelField) =>
        row.tank_id === tankId ||
        (!row.tank_id && fuelCode && (row[fuelField] === fuelCode));
      setSupplies(sup.filter((r) => byTank(r, 'fuel_type')));
      setMeasurements(meas.filter((r) => byTank(r, 'fuel_type')));
      setCalibrations(cal.filter((r) => byTank(r, 'fuel')));
      setAdjustments(adj);
      setBalance(bal);
    } finally {
      setLoading(false);
    }
  }, [tank, tankId, orgId, fuelCode]);

  useEffect(() => {
    let cancelled = false;
    getTank(tankId).then((row) => { if (!cancelled) setTank(row); }).catch(() => {});
    return () => { cancelled = true; };
  }, [tankId]);

  useEffect(() => { loadOps(); }, [loadOps]);

  if (!tank) {
    return (
      <div className="space-y-3 pb-3">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>
        <Card className="!p-6 text-center text-ink-muted text-sm">Загрузка…</Card>
      </div>
    );
  }

  const balanceLiters = balance && typeof balance === 'object' ? Number(balance.liters ?? 0) : Number(balance ?? 0);
  const breakdown = balance?.breakdown ?? null;
  const fillPct = tank.capacity_liters && Number.isFinite(balanceLiters)
    ? Math.max(0, Math.min(100, (balanceLiters / Number(tank.capacity_liters)) * 100))
    : 0;

  return (
    <div className="space-y-3 pb-3">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink font-semibold"
      >
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      {/* HEADER */}
      <Card className="!p-4 border border-brand-500/20 bg-gradient-to-br from-bg-card via-bg-card to-brand-500/5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-soft font-bold">Резервуар №{tank.number ?? '—'}</div>
            <div className="mt-0.5 text-lg font-extrabold text-ink truncate">{tank.name}</div>
            <div className="mt-1 text-xs text-ink-muted flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5" style={{ color: tank.fuel_type?.color ?? '#FF4D3D' }} />
              {fuelCode ?? '—'}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone="brand">{formatLiters(balanceLiters)}</Badge>
            <button
              type="button"
              onClick={loadOps}
              disabled={loading}
              className="text-[10px] text-ink-soft hover:text-ink underline disabled:opacity-50"
            >
              {loading ? 'Обновляется…' : 'Пересчитать'}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${fillPct}%`,
                background: tank.fuel_type?.color ?? '#FF4D3D',
              }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-ink-soft">
            <span>{Math.round(fillPct)}% заполнено</span>
            <span>из {formatLiters(tank.capacity_liters ?? 0)}</span>
          </div>
        </div>

        {breakdown && (
          <div className="mt-3 pt-3 border-t border-line/30 grid grid-cols-4 gap-2 text-[10px]">
            <BreakdownCell label="Поступило" value={breakdown.supplies} positive />
            <BreakdownCell label="Продано" value={-Math.abs(breakdown.sales)} />
            <BreakdownCell label="Поверки" value={breakdown.calibrations} positive />
            <BreakdownCell label="Коррект." value={breakdown.adjustments} signed />
          </div>
        )}
      </Card>

      {/* TABS */}
      <div className="flex gap-1 p-1 rounded-2xl bg-bg-card border border-line/30">
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={
                'relative flex-1 h-9 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1 transition-colors ' +
                (active ? 'text-white' : 'text-ink-muted hover:text-ink')
              }
            >
              {active && (
                <motion.span
                  layoutId="activeTankTab"
                  className="absolute inset-0 rounded-xl bg-brand-500 shadow-glow -z-10"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <t.icon className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* OPS LIST + ADD */}
      <Card className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft font-bold">
            {TABS.find((t) => t.id === activeTab)?.label}
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" /> Добавить
          </Button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            {loading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-bg-elevated/60 animate-pulse" />
              ))
            ) : (
              <OpsList
                activeTab={activeTab}
                supplies={supplies}
                measurements={measurements}
                calibrations={calibrations}
                adjustments={adjustments}
                onEdit={(payload) => setEditing(payload)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </Card>

      <AddSheet
        open={addOpen}
        activeTab={activeTab}
        tank={tank}
        fuelCode={fuelCode}
        onClose={() => setAddOpen(false)}
        onDone={async () => {
          setAddOpen(false);
          window.dispatchEvent(new Event('fingas-data-changed'));
          await loadOps();
        }}
      />

      <EditSheet
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={async () => {
          setEditing(null);
          window.dispatchEvent(new Event('fingas-data-changed'));
          await loadOps();
        }}
      />
    </div>
  );
}

function OpsList({ activeTab, supplies, measurements, calibrations, adjustments, onEdit }) {
  if (activeTab === 'supply') {
    if (supplies.length === 0) return <EmptyState icon={Fuel} title="Поступлений нет" description="Запишите приход топлива по накладной." />;
    return supplies.map((r) => (
      <OpsRow
        key={r.id}
        date={r.date}
        title={`${r.fuel_type ?? ''} · ${formatLiters(r.liters_actual)}`}
        sub={r.doc_number ? `Накладная ${r.doc_number}` : (r.driver ? `Водитель: ${r.driver}` : '—')}
        right={`${Number(r.price_per_liter ?? 0)} с/л`}
        onClick={() => onEdit({ kind: 'supply', row: r })}
      />
    ));
  }
  if (activeTab === 'measurement') {
    if (measurements.length === 0) return <EmptyState icon={Gauge} title="Замеров нет" description="Сделайте контрольный замер уровня." />;
    return measurements.map((r) => (
      <OpsRow
        key={r.id}
        date={r.date}
        title={`${r.fuel_type ?? ''} · ${r.liters != null ? formatLiters(r.liters) : (r.level_cm != null ? `${r.level_cm} см` : '—')}`}
        sub={r.time ? `${r.time}${r.temperature != null ? ` · t ${r.temperature}°C` : ''}` : '—'}
        onClick={() => onEdit({ kind: 'measurement', row: r })}
      />
    ));
  }
  if (activeTab === 'calibration') {
    if (calibrations.length === 0) return <EmptyState icon={Wrench} title="Поверок нет" description="Запишите поверку ТРК." />;
    return calibrations.map((r) => (
      <OpsRow
        key={r.id}
        date={r.date}
        title={`${r.fuel ?? ''} · ${formatLiters(r.volume)}`}
        sub={r.trk_number ? `ТРК ${r.trk_number}` : (r.operator ?? '—')}
        onClick={() => onEdit({ kind: 'calibration', row: r })}
      />
    ));
  }
  if (activeTab === 'adjustment') {
    if (adjustments.length === 0) return <EmptyState icon={Scale} title="Корректировок нет" description="Заведите корректировку, если книжный остаток разошёлся с физическим." />;
    return adjustments.map((r) => (
      <OpsRow
        key={r.id}
        date={r.date}
        title={`${r.liters > 0 ? '+' : ''}${Number(r.liters).toFixed(3)} л`}
        sub={r.reason ?? '—'}
        onClick={() => onEdit({ kind: 'adjustment', row: r })}
      />
    ));
  }
  return null;
}

function BreakdownCell({ label, value, positive = false, signed = false }) {
  const n = Number(value ?? 0);
  const tone = positive ? 'text-success' : (n < 0 ? 'text-danger' : (n > 0 && signed ? 'text-success' : 'text-ink-muted'));
  const sign = signed && n > 0 ? '+' : '';
  return (
    <div className="rounded-lg bg-bg-elevated/60 border border-line/30 px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-[0.14em] text-ink-soft font-bold">{label}</div>
      <div className={'text-[11px] font-bold mt-0.5 ' + tone}>
        {sign}{n.toFixed(Math.abs(n) < 10 ? 2 : 0)} л
      </div>
    </div>
  );
}

function OpsRow({ date, title, sub, right, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={
        'w-full text-left rounded-xl bg-bg-elevated/60 border border-line/40 px-3 py-2.5 flex items-center gap-3 ' +
        (onClick ? 'hover:border-brand-500/40 hover:bg-bg-elevated transition-colors' : '')
      }
    >
      <div className="text-[10px] text-ink-soft font-bold flex-shrink-0 w-14">
        {formatDate(date, 'd MMM')}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink truncate">{title}</div>
        <div className="text-[11px] text-ink-muted truncate">{sub}</div>
      </div>
      {right && <div className="text-xs text-ink-muted tabular-nums">{right}</div>}
    </Tag>
  );
}

function AddSheet({ open, activeTab, tank, fuelCode, onClose, onDone }) {
  const tab = TABS.find((t) => t.id === activeTab);
  return (
    <BottomSheet open={open} onClose={onClose} title={tab ? `${tab.label} · ${tank.name}` : ''}>
      {activeTab === 'supply' && (
        <FuelSupplyQuickForm onDone={onDone} onCancel={onClose} defaultTankId={tank.id} defaultFuelType={fuelCode} />
      )}
      {activeTab === 'measurement' && (
        <TankMeasurementQuickForm onDone={onDone} onCancel={onClose} defaultTankId={tank.id} defaultFuelType={fuelCode} />
      )}
      {activeTab === 'calibration' && (
        <CalibrationQuickForm onDone={onDone} onCancel={onClose} defaultFuelType={fuelCode} />
      )}
      {activeTab === 'adjustment' && (
        <AdjustmentForm tank={tank} fuelCode={fuelCode} onDone={onDone} onCancel={onClose} />
      )}
    </BottomSheet>
  );
}

function AdjustmentForm({ tank, fuelCode, onDone, onCancel }) {
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
    if (!liters) { setErr('Введите литры (можно отрицательные)'); return; }
    if (!form.reason.trim()) { setErr('Укажите причину'); return; }
    setSaving(true);
    try {
      await createAdjustment({
        organization_id: orgId,
        station_id: tank.station_id,
        tank_id: tank.id,
        fuel_code: fuelCode || null,
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
      <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
      <Input
        label="Литры (+ или −)"
        type="number" step="0.001"
        value={form.liters}
        onChange={(e) => setForm({ ...form, liters: e.target.value })}
        hint="Положительное — добавить (например излишек), отрицательное — списать."
        required
      />
      <Input label="Причина" placeholder="Полив дождём / недолив / расхождение" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
      <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

      {err && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5">{err}</div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Назад</Button>
        <Button type="submit" variant="success" loading={saving}>Сохранить</Button>
      </div>
    </form>
  );
}

// --- Edit/delete sheet for any tank operation ---

const EDIT_TITLE = {
  supply:      'Изменить поступление',
  measurement: 'Изменить замер',
  calibration: 'Изменить поверку',
  adjustment:  'Изменить корректировку',
};

function EditSheet({ editing, onClose, onDone }) {
  const open = !!editing;
  const kind = editing?.kind;
  const row = editing?.row;
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open || !row) { setForm({}); setErr(''); return; }
    setErr('');
    if (kind === 'supply') {
      setForm({
        date: row.date ?? '',
        doc_number: row.doc_number ?? '',
        liters_doc: row.liters_doc ?? '',
        liters_actual: row.liters_actual ?? '',
        price_per_liter: row.price_per_liter ?? '',
        level_before_cm: row.level_before_cm ?? '',
        level_after_cm: row.level_after_cm ?? '',
        logistics_cost: row.logistics_cost ?? '',
        driver: row.driver ?? '',
        vehicle: row.vehicle ?? '',
        note: row.note ?? '',
      });
    } else if (kind === 'measurement') {
      setForm({
        date: row.date ?? '',
        time: String(row.time ?? '').slice(0, 5),
        level_cm: row.level_cm ?? '',
        liters: row.liters ?? '',
        temperature: row.temperature ?? '',
        water_level: row.water_level ?? '',
        note: row.note ?? '',
      });
    } else if (kind === 'calibration') {
      setForm({
        date: row.date ?? '',
        time: String(row.time ?? '').slice(0, 5),
        volume: row.volume ?? '',
        trk_number: row.trk_number ?? '',
        operator: row.operator ?? '',
        note: row.note ?? '',
      });
    } else if (kind === 'adjustment') {
      setForm({
        date: row.date ?? '',
        liters: row.liters ?? '',
        reason: row.reason ?? '',
        note: row.note ?? '',
      });
    }
  }, [open, kind, row]);

  async function submit() {
    setSaving(true); setErr('');
    try {
      if (kind === 'supply') {
        await updateFuelSupply(row.id, {
          date: form.date,
          doc_number: form.doc_number || null,
          liters_doc: form.liters_doc !== '' ? Number(form.liters_doc) : 0,
          liters_actual: form.liters_actual !== '' ? Number(form.liters_actual) : 0,
          price_per_liter: form.price_per_liter !== '' ? Number(form.price_per_liter) : 0,
          level_before_cm: form.level_before_cm !== '' ? Number(form.level_before_cm) : null,
          level_after_cm: form.level_after_cm !== '' ? Number(form.level_after_cm) : null,
          logistics_cost: form.logistics_cost !== '' ? Number(form.logistics_cost) : 0,
          driver: form.driver || null,
          vehicle: form.vehicle || null,
          note: form.note || null,
        });
      } else if (kind === 'measurement') {
        await updateTankMeasurement(row.id, {
          date: form.date,
          time: form.time || null,
          level_cm: form.level_cm !== '' ? Number(form.level_cm) : null,
          liters: form.liters !== '' ? Number(form.liters) : null,
          temperature: form.temperature !== '' ? Number(form.temperature) : null,
          water_level: form.water_level !== '' ? Number(form.water_level) : null,
          note: form.note || null,
        });
      } else if (kind === 'calibration') {
        await updateCalibration(row.id, {
          date: form.date,
          time: form.time || null,
          volume: form.volume !== '' ? Number(form.volume) : 0,
          trk_number: form.trk_number || null,
          operator: form.operator || null,
          note: form.note || null,
        });
      } else if (kind === 'adjustment') {
        await updateAdjustment(row.id, {
          date: form.date,
          liters: form.liters !== '' ? Number(form.liters) : 0,
          reason: form.reason || null,
          note: form.note || null,
        });
      }
      onDone?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!row) return;
    if (!confirm('Удалить запись?')) return;
    setDeleting(true); setErr('');
    try {
      if (kind === 'supply') await deleteFuelSupply(row.id);
      else if (kind === 'measurement') await deleteTankMeasurement(row.id);
      else if (kind === 'calibration') await deleteCalibration(row.id);
      else if (kind === 'adjustment') await deleteAdjustment(row.id);
      onDone?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось удалить');
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={EDIT_TITLE[kind] ?? 'Изменить'}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Сохранить"
      onDelete={remove}
      deleting={deleting}
    >
      {kind === 'supply' && (
        <>
          <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label="№ накладной" value={form.doc_number} onChange={(e) => setForm({ ...form, doc_number: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Литры (док)" type="number" step="0.001" value={form.liters_doc} onChange={(e) => setForm({ ...form, liters_doc: e.target.value })} />
            <Input label="Литры (факт)" type="number" step="0.001" value={form.liters_actual} onChange={(e) => setForm({ ...form, liters_actual: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Замер до, см" type="number" step="0.1" value={form.level_before_cm} onChange={(e) => setForm({ ...form, level_before_cm: e.target.value })} />
            <Input label="Замер после, см" type="number" step="0.1" value={form.level_after_cm} onChange={(e) => setForm({ ...form, level_after_cm: e.target.value })} />
          </div>
          <Input label="Цена за литр, сом" type="number" step="0.01" value={form.price_per_liter} onChange={(e) => setForm({ ...form, price_per_liter: e.target.value })} required />
          <Input label="Логистика, сом" type="number" step="0.01" value={form.logistics_cost} onChange={(e) => setForm({ ...form, logistics_cost: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Водитель" value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value })} />
            <Input label="Машина" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} />
          </div>
          <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </>
      )}

      {kind === 'measurement' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <Input label="Время" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Уровень, см" type="number" step="0.1" value={form.level_cm} onChange={(e) => setForm({ ...form, level_cm: e.target.value })} />
            <Input label="Литры" type="number" step="0.001" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Температура, °C" type="number" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
            <Input label="Подтоварная вода" type="number" step="0.1" value={form.water_level} onChange={(e) => setForm({ ...form, water_level: e.target.value })} />
          </div>
          <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </>
      )}

      {kind === 'calibration' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <Input label="Время" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </div>
          <Input label="Объём поверки, л" type="number" step="0.001" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} required />
          <Input label="№ ТРК" value={form.trk_number} onChange={(e) => setForm({ ...form, trk_number: e.target.value })} />
          <Input label="Оператор" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} />
          <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </>
      )}

      {kind === 'adjustment' && (
        <>
          <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input
            label="Литры (+ или −)"
            type="number" step="0.001"
            value={form.liters}
            onChange={(e) => setForm({ ...form, liters: e.target.value })}
            required
          />
          <Input label="Причина" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </>
      )}
    </FormSheet>
  );
}
