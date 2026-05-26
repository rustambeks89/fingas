// [UPDATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY CODEX - 2026-05-25]
// Project: Fingas
// Purpose: Owner settings — organization profile, stations CRUD, theme.

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Layers3, MapPin, Monitor, Moon, Plus, Power, Sun, Users, ShieldCheck } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import {
  createOrganization,
  createStation,
  deleteOrganization,
  deleteStation,
  deleteStationHard,
  listOrganizations,
  listStations,
  updateOrganization,
  updateStation,
} from '@/services/stationService';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
export default function SettingsScreen() {
  const { user, refresh } = useAuth();
  const { canDelete } = usePermissions();
  const { theme, themeMode, setTheme } = useTheme();
  const orgId = user?.profile?.organization_id;

  const [org, setOrg] = useState(null);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // form sheets
  const [showOrg, setShowOrg] = useState(false);
  const [showStation, setShowStation] = useState(false);
  const [editingStation, setEditingStation] = useState(null); // null = creating new

  function openNewStation() {
    setEditingStation(null);
    setShowStation(true);
  }
  function openEditStation(s) {
    setEditingStation(s);
    setShowStation(true);
  }
  function closeStation() {
    setShowStation(false);
    setEditingStation(null);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const orgs = await listOrganizations();
      const myOrg = orgs.find((o) => o.id === orgId) ?? orgs[0] ?? null;
      setOrg(myOrg);
      if (myOrg) {
        const [st] = await Promise.all([listStations(myOrg.id)]);
        setStations(st);
      }
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const themeLabel = themeMode === 'dark' ? 'Тёмная' : themeMode === 'light' ? 'Светлая' : 'Системная';

  return (
    <div>
      <ScreenHeader title="Настройки" subtitle="Организация, станции и тема" />

      {err && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5 mb-3">
          {err}
        </div>
      )}

      {!loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[2rem] p-5 mb-4 border border-brand-500/25 bg-gradient-to-br from-brand-500/18 via-brand-500/5 to-bg-soft"
        >
          <div className="absolute -top-10 -right-8 w-36 h-36 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-soft">
              <Layers3 className="w-3.5 h-3.5 text-brand-500" />
              Контур организации
            </div>
            <div className="mt-2 text-3xl font-bold text-ink">
              {org ? org.name : 'Новая организация'}
            </div>
            <div className="mt-1 text-sm text-ink-muted">
              {stations.length} АЗС · {stations.filter((s) => s.active).length} активных
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <SummaryCard label="АЗС" value={stations.length} icon={MapPin} />
              <SummaryCard label="Активные" value={stations.filter((s) => s.active).length} icon={MapPin} />
            </div>
          </div>
        </motion.div>
      )}

      {/* ORG */}
      <Card hoverable className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <Building2 className="w-4 h-4 text-brand-400" /> Организация
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowOrg(true)}>
            {org ? 'Изменить' : 'Создать'}
          </Button>
        </div>
        {loading ? (
          <div className="h-10 rounded-xl bg-bg-elevated animate-pulse" />
        ) : org ? (
          <div className="text-sm text-ink-muted space-y-0.5">
            <div className="text-ink font-medium text-base">{org.name}</div>
            {org.legal_name && <div>{org.legal_name}</div>}
            {org.inn && <div>ИНН: {org.inn}</div>}
            {org.phone && <div>{org.phone}</div>}
            {org.address && <div>{org.address}</div>}
          </div>
        ) : (
          <div className="text-sm text-ink-muted">Организации ещё нет. Создайте её, чтобы вести учёт.</div>
        )}
      </Card>

      {/* STATIONS */}
      <Card hoverable className="mt-3 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <MapPin className="w-4 h-4 text-brand-400" /> Станции ({stations.length})
          </div>
          {org && (
            <Button size="sm" onClick={openNewStation}>
              <Plus className="w-4 h-4" /> Добавить
            </Button>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            {[0,1].map((i) => <div key={i} className="h-14 rounded-xl bg-bg-elevated animate-pulse" />)}
          </div>
        ) : stations.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Нет станций"
            description={org ? 'Добавьте первую АЗС (например, «Pit Stop»).' : 'Создайте сначала организацию.'}
          />
        ) : (
          <div className="space-y-2">
            {stations.map((s) => (
              <motion.div key={s.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}>
                <button
                  type="button"
                  onClick={() => openEditStation(s)}
                  className={
                    'w-full rounded-[1.4rem] bg-bg-card/70 border border-white/40 p-3 flex items-center justify-between backdrop-blur-xl text-left hover:border-brand-500/40 active:scale-[0.99] transition min-w-0 ' +
                    (!s.active ? 'opacity-60' : '')
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink truncate">{s.name}</div>
                    <div className="text-xs text-ink-muted truncate">
                      {s.city || '—'}
                      {s.external_station_id != null ? ` · ShopKey:${s.external_station_id}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge tone={s.active ? 'success' : 'default'}>
                      {s.active ? 'active' : 'off'}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-ink-soft" />
                  </div>
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      {/* EMPLOYEES */}
      <Link to="/employees" className="block mt-3 active:scale-[0.99] transition-transform">
        <Card hoverable className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-line/50 flex items-center justify-center text-brand-500 flex-shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-ink">Сотрудники</div>
                <div className="text-xs text-ink-muted truncate">Управление командой и приглашениями</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-soft flex-shrink-0" />
          </div>
        </Card>
      </Link>

      {/* PERMISSIONS */}
      <Link to="/employees" className="block mt-3 active:scale-[0.99] transition-transform">
        <Card hoverable className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-line/50 flex items-center justify-center text-brand-500 flex-shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-ink">Доступы</div>
                <div className="text-xs text-ink-muted truncate">Роли и детальные права сотрудников</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-soft flex-shrink-0" />
          </div>
        </Card>
      </Link>

      {/* THEME SELECTION */}
      <Card className="mt-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-line/50 flex items-center justify-center text-brand-500 flex-shrink-0">
              {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-ink">Тема оформления</div>
              <div className="text-xs text-ink-muted truncate">{themeLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`h-10 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer select-none ${themeMode === 'light' ? 'bg-bg-elevated border-brand-500/35 text-brand-400 shadow-sm' : 'bg-bg-card border-line/45 text-ink-muted'}`}
            >
              <Sun className="w-3.5 h-3.5" /> Светлая
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`h-10 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer select-none ${themeMode === 'dark' ? 'bg-bg-elevated border-brand-500/35 text-brand-400 shadow-sm' : 'bg-bg-card border-line/45 text-ink-muted'}`}
            >
              <Moon className="w-3.5 h-3.5" /> Тёмная
            </button>
            <button
              type="button"
              onClick={() => setTheme('system')}
              className={`h-10 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer select-none ${themeMode === 'system' ? 'bg-bg-elevated border-brand-500/35 text-brand-400 shadow-sm' : 'bg-bg-card border-line/45 text-ink-muted'}`}
            >
              <Monitor className="w-3.5 h-3.5" /> Система
            </button>
          </div>
        </div>
      </Card>

      <OrgSheet
        open={showOrg}
        org={org}
        onClose={() => setShowOrg(false)}
        onSaved={async () => { setShowOrg(false); await reload(); await refresh(); }}
        userId={user?.id}
        canDelete={canDelete(MODULES.SETTINGS)}
      />
      <StationSheet
        open={showStation}
        organizationId={org?.id}
        station={editingStation}
        onClose={closeStation}
        onSaved={async () => { closeStation(); await reload(); }}
        canDelete={canDelete(MODULES.SETTINGS)}
      />
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-[1.4rem] bg-bg-card/70 border border-white/40 p-3 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        <Icon className="w-3.5 h-3.5 text-brand-500" />
        {label}
      </div>
      <div className="text-base font-bold text-ink mt-1 truncate">{value}</div>
    </div>
  );
}

function OrgSheet({ open, org, onClose, onSaved, userId, canDelete }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setForm(org ?? { name: '', legal_name: '', inn: '', phone: '', email: '', address: '' });
    setErr('');
  }, [open, org]);

  async function submit() {
    setSaving(true);
    setErr('');
    try {
      if (org) {
        await updateOrganization(org.id, {
          name: form.name,
          legal_name: form.legal_name,
          inn: form.inn,
          phone: form.phone,
          email: form.email,
          address: form.address,
        });
      } else {
        await createOrganization({ ...form, owner_user_id: userId });
      }
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  async function removeOrg() {
    if (!org) return;
    if (!confirm(`Удалить организацию «${org.name}»? Это удалит связанные станции и настройки.`)) return;
    setDeleting(true);
    setErr('');
    try {
      await deleteOrganization(org.id);
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось удалить организацию.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={org ? 'Редактировать организацию' : 'Создать организацию'}
      onSubmit={submit}
      saving={saving}
      error={err}
      onDelete={org && canDelete ? removeOrg : null}
      deleting={deleting}
    >
      <Input label="Название" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Input label="Юр. название" value={form.legal_name ?? ''} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
      <Input label="ИНН" value={form.inn ?? ''} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
      <Input label="Телефон" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <Input label="Email" type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Input label="Адрес" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
    </FormSheet>
  );
}

function StationSheet({ open, organizationId, station, onClose, onSaved, canDelete }) {
  const isEdit = !!station;
  const [form, setForm] = useState({ name: '', city: '', address: '', external_station_id: '', active: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (station) {
      setForm({
        name: station.name ?? '',
        city: station.city ?? '',
        address: station.address ?? '',
        external_station_id: station.external_station_id ?? '',
        active: station.active ?? true,
      });
    } else {
      setForm({ name: '', city: '', address: '', external_station_id: '', active: true });
    }
    setErr('');
  }, [open, station]);

  async function submit() {
    setSaving(true);
    setErr('');
    try {
      const patch = {
        name: form.name,
        city: form.city || null,
        address: form.address || null,
        external_station_id: form.external_station_id !== '' ? Number(form.external_station_id) : null,
        active: !!form.active,
      };
      if (isEdit) {
        await updateStation(station.id, patch);
      } else {
        await createStation({ organization_id: organizationId, ...patch });
      }
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  async function softDelete() {
    if (!isEdit) return;
    if (!confirm(`Отключить «${station.name}»? Запись сохранится для истории, новые операции делать будет нельзя.`)) return;
    setDeleting(true);
    setErr('');
    try {
      await deleteStation(station.id);
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось отключить');
    } finally {
      setDeleting(false);
    }
  }

  async function hardDelete() {
    if (!isEdit) return;
    if (!confirm(`УДАЛИТЬ «${station.name}» полностью? Это сломает связи со сменами/поступлениями. Если есть данные — лучше нажмите «Отключить».`)) return;
    setDeleting(true);
    setErr('');
    try {
      await deleteStationHard(station.id);
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
      title={isEdit ? 'Редактировать АЗС' : 'Новая АЗС'}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={isEdit ? 'Сохранить' : 'Создать'}
      footer={isEdit && canDelete ? (
        <div className="space-y-2.5 pt-1.5">
          <Button type="submit" variant="success" size="block" loading={saving}>
            Сохранить
          </Button>
          <Button type="button" variant="secondary" size="block" onClick={softDelete} loading={deleting}>
            <Power className="w-4 h-4" /> {station.active ? 'Отключить АЗС' : 'Включить АЗС'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="danger" size="block" onClick={hardDelete} loading={deleting}>
              Удалить
            </Button>
            <Button type="button" variant="secondary" size="block" onClick={onClose}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    >
      <Input label="Название" placeholder="Pit Stop" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Input label="Город" placeholder="Ош" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
      <Input label="Адрес" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <Input
        label="ShopKey / External station ID"
        type="number"
        placeholder="8"
        hint="ID станции в MySQL (azs_selling.ShopKey, azs_balance.ShopKey). Нужно для привязки данных продаж и остатков к этой АЗС."
        value={form.external_station_id}
        onChange={(e) => setForm({ ...form, external_station_id: e.target.value })}
      />
      {isEdit && (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-bg-elevated border border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium text-ink">Станция активна</div>
            <div className="text-xs text-ink-muted">Отключённые не участвуют в операциях.</div>
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
