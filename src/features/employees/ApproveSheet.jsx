// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Bottom sheet that gathers role + station + apply-template choice
// before approving an employee request. Calls approveEmployee which both
// flips status and seeds default permissions via RPC.

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/bottom-sheets/BottomSheet';
import { Select } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { ROLES, ROLE_LABELS } from '@/lib/constants';
import { listStations } from '@/services/stationService';
import { approveEmployee } from '@/services/profileService';

export function ApproveSheet({ open, profile, organizationId, onClose, onDone }) {
  const [role, setRole] = useState(profile?.role ?? ROLES.OPERATOR);
  const [stationId, setStationId] = useState(profile?.station_id ?? '');
  const [applyTemplate, setApplyTemplate] = useState(true);
  const [stations, setStations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open || !organizationId) return;
    listStations(organizationId).then(setStations).catch(() => setStations([]));
    setRole(profile?.role ?? ROLES.OPERATOR);
    setStationId(profile?.station_id ?? '');
    setApplyTemplate(true);
    setErr('');
  }, [open, organizationId, profile]);

  async function submit() {
    if (!profile) return;
    setSaving(true);
    setErr('');
    try {
      await approveEmployee(profile, {
        role,
        stationId: stationId || null,
        applyTemplate,
      });
      onDone?.();
      onClose?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось одобрить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Одобрить сотрудника">
      {profile && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-bg-elevated border border-line px-4 py-3">
            <div className="font-semibold text-ink">{profile.full_name || profile.email}</div>
            <div className="text-xs text-ink-muted">{profile.email}</div>
          </div>

          <Select label="Роль" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.values(ROLES).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>

          <Select
            label="АЗС"
            value={stationId ?? ''}
            onChange={(e) => setStationId(e.target.value)}
            hint={stations.length === 0 ? 'Нет станций. Создайте в Настройках.' : undefined}
          >
            <option value="">— Не назначена —</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>

          <div className="rounded-2xl bg-bg-elevated border border-line px-4 py-3">
            <Toggle
              label="Применить шаблон прав по роли"
              hint="Сразу включит базовые toggles. Точечные правки — в разделе «Доступы»."
              checked={applyTemplate}
              onChange={setApplyTemplate}
            />
          </div>

          {err && (
            <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5">
              {err}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
            <Button onClick={submit} loading={saving}>Одобрить</Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
