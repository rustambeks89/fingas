// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Tanks CRUD — list per station with TankCard preview + edit/delete
// sheet. Owner uses this to define physical resevoirs (capacity, min/critical,
// fuel code, external ShopKey).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Droplets,
  Plus,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { TankCard, TankCardSkeleton } from '@/components/charts/TankCard';
import {
  createTank,
  deleteTank,
  getTankStatusesWithBalance,
  listTanks,
  seedDefaultFuelTypes,
  updateTank,
} from '@/services/tankService';
import { listStations } from '@/services/stationService';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';

const FUEL_PRESETS = ['АИ-92', 'АИ-95', 'АИ-98', 'ДТ', 'Газ'];

export default function TanksScreen() {
  const { user } = useAuth();
  const { canCreate, canEdit } = usePermissions();
  const orgId = user?.profile?.organization_id;
  const defaultStation = user?.profile?.station_id ?? null;

  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState(defaultStation);
  const [tanks, setTanks] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [fuelTypes, setFuelTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [editing, setEditing] = useState(null);

  const canManage = canCreate(MODULES.SETTINGS) || canEdit(MODULES.SETTINGS);

  // Load stations + fuel types once
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    Promise.all([
      listStations(orgId).catch(() => []),
      supabase
        .from('fuel_types')
        .select('*')
        .eq('organization_id', orgId)
        .eq('active', true)
        .order('sort_order')
        .then(({ data }) => data ?? []),
    ]).then(([st, ft]) => {
      if (cancelled) return;
      setStations(st);
      setFuelTypes(ft);
      if (!stationId && st.length > 0) setStationId(st[0].id);
      // seed defaults if empty
      if (ft.length === 0) {
        seedDefaultFuelTypes(orgId)
          .then(() => supabase.from('fuel_types').select('*').eq('organization_id', orgId).order('sort_order'))
          .then(({ data }) => { if (!cancelled) setFuelTypes(data ?? []); });
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const reload = useCallback(async () => {
    if (!orgId || !stationId) {
      setTanks([]); setStatuses([]); setLoading(false);
      return;
    }
    setLoading(true); setErr('');
    try {
      const [list, statusList] = await Promise.all([
        listTanks({ organizationId: orgId, stationId, active: undefined }),
        getTankStatusesWithBalance({ organizationId: orgId, stationId }),
      ]);
      setTanks(list);
      setStatuses(statusList);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [orgId, stationId]);

  useEffect(() => { reload(); }, [reload]);

  const statusById = useMemo(() => {
    const m = new Map();
    for (const s of statuses) m.set(s.id, s);
    return m;
  }, [statuses]);

  return (
    <div className="space-y-3 pb-2">
      <ScreenHeader
        title="Резервуары"
        subtitle="Цистерны и параметры"
        right={canManage && stationId ? (
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus className="w-4 h-4" /> Добавить
          </Button>
        ) : null}
      />

      {err && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      )}

      {/* Station selector */}
      {stations.length > 1 && (
        <Select label="АЗС" value={stationId ?? ''} onChange={(e) => setStationId(e.target.value)}>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      )}

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 gap-2">
          {[0, 1, 2].map((i) => <TankCardSkeleton key={i} />)}
        </div>
      ) : tanks.length === 0 ? (
        <Card className="!p-4">
          <EmptyState
            icon={Droplets}
            title="Резервуары не настроены"
            description={canManage
              ? 'Добавьте первый резервуар через кнопку «Добавить» сверху.'
              : 'Попросите владельца настроить резервуары.'}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {tanks.map((t) => {
            const s = statusById.get(t.id);
            return (
              <div key={t.id} className="space-y-1">
                <TankCard
                  name={t.name}
                  number={t.number}
                  fuel={t.fuel_code ?? t.fuel_type?.code}
                  fuelColor={t.fuel_type?.color || '#FF4D3D'}
                  current={s?.currentLiters ?? 0}
                  capacity={t.capacity_liters}
                  status={s?.currentLiters > 0 ? s.status : 'unknown'}
                  lastSyncedAt={s?.lastSyncedAt}
                />
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="w-full text-left text-[11px] text-ink-soft hover:text-ink px-3 py-1.5 rounded-lg bg-bg-elevated/30 flex items-center justify-between min-w-0"
                  >
                    <span className="truncate">
                      Объём {Math.round(t.capacity_liters)} л · мин {Math.round(t.min_liters)} · крит {Math.round(t.critical_liters)}
                    </span>
                    <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TankSheet
        open={!!editing}
        tank={editing && editing.id ? editing : null}
        organizationId={orgId}
        stationId={stationId}
        fuelTypes={fuelTypes}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await reload(); }}
      />
    </div>
  );
}

function TankSheet({ open, tank, organizationId, stationId, fuelTypes, onClose, onSaved }) {
  const isEdit = !!tank;
  const { canDelete } = usePermissions();
  const [form, setForm] = useState({
    number: '',
    name: '',
    fuel_code: 'АИ-95',
    capacity_liters: '',
    min_liters: '',
    critical_liters: '',
    external_tank_id: '',
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (tank) {
      setForm({
        number: tank.number ?? '',
        name: tank.name ?? '',
        fuel_code: tank.fuel_code ?? tank.fuel_type?.code ?? 'АИ-95',
        capacity_liters: tank.capacity_liters ?? '',
        min_liters: tank.min_liters ?? '',
        critical_liters: tank.critical_liters ?? '',
        external_tank_id: tank.external_tank_id ?? '',
        active: tank.active ?? true,
      });
    } else {
      setForm({
        number: '',
        name: '',
        fuel_code: fuelTypes[0]?.code ?? 'АИ-95',
        capacity_liters: '',
        min_liters: '',
        critical_liters: '',
        external_tank_id: '',
        active: true,
      });
    }
    setErr('');
  }, [open, tank, fuelTypes]);

  const fuelCodeOptions = fuelTypes.length > 0
    ? fuelTypes.map((f) => f.code)
    : FUEL_PRESETS;

  async function submit() {
    if (!stationId) { setErr('Сначала выберите АЗС'); return; }
    if (!form.name) { setErr('Укажите название резервуара'); return; }
    if (!form.capacity_liters || Number(form.capacity_liters) <= 0) {
      setErr('Введите объём (литры)');
      return;
    }
    setSaving(true); setErr('');
    try {
      const fuel = fuelTypes.find((f) => f.code === form.fuel_code) ?? null;
      const payload = {
        name: form.name,
        number: form.number ? Number(form.number) : null,
        fuel_code: form.fuel_code || null,
        fuel_type_id: fuel?.id ?? null,
        capacity_liters: Number(form.capacity_liters),
        min_liters: form.min_liters !== '' ? Number(form.min_liters) : 0,
        critical_liters: form.critical_liters !== '' ? Number(form.critical_liters) : 0,
        external_tank_id: form.external_tank_id !== '' ? Number(form.external_tank_id) : null,
        active: !!form.active,
      };
      if (isEdit) {
        await updateTank(tank.id, payload);
      } else {
        await createTank({ ...payload, organization_id: organizationId, station_id: stationId });
      }
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!isEdit) return;
    if (!confirm(`Удалить резервуар «${tank.name}»? Метаданные пропадут, данные azs_balance не пострадают.`)) return;
    setDeleting(true); setErr('');
    try {
      await deleteTank(tank.id);
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось удалить (есть связанные записи?)');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={isEdit ? `Резервуар ${tank?.name ?? ''}` : 'Новый резервуар'}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={isEdit ? 'Сохранить' : 'Создать'}
      onDelete={isEdit && canDelete(MODULES.SETTINGS) ? remove : null}
      deleting={deleting}
    >
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <Input label="№" type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
        <Input label="Название" placeholder="Резервуар №1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </div>

      <Select label="Топливо" value={form.fuel_code} onChange={(e) => setForm({ ...form, fuel_code: e.target.value })}>
        {fuelCodeOptions.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>

      <Input
        label="Объём (литры)"
        type="number" step="1" min="0"
        placeholder="20000"
        value={form.capacity_liters}
        onChange={(e) => setForm({ ...form, capacity_liters: e.target.value })}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Минимум, л"
          type="number" step="1" min="0"
          placeholder="3000"
          hint="ниже — warning"
          value={form.min_liters}
          onChange={(e) => setForm({ ...form, min_liters: e.target.value })}
        />
        <Input
          label="Критично, л"
          type="number" step="1" min="0"
          placeholder="1000"
          hint="ниже — alert"
          value={form.critical_liters}
          onChange={(e) => setForm({ ...form, critical_liters: e.target.value })}
        />
      </div>

      <Input
        label="External tank ID (опц.)"
        type="number"
        placeholder="например, номер резервуара в POS"
        value={form.external_tank_id}
        onChange={(e) => setForm({ ...form, external_tank_id: e.target.value })}
      />
      {isEdit && (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-bg-elevated border border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium text-ink">Резервуар активен</div>
            <div className="text-xs text-ink-muted">Отключённые не учитываются в отчётах.</div>
          </div>
          <input
            type="checkbox"
            checked={!!form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
            className="w-5 h-5 accent-brand-500"
          />
        </label>
      )}
    </FormSheet>
  );
}
