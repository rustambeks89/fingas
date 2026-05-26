// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Per-employee permission editor — the central toggle matrix.
// Owner sees every module × every action as switches. Top-level toggles
// (can_login, can_view_all_stations, status) and role template loader are
// stacked above the matrix.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Save } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabaseClient';
import {
  ACTION_LABELS,
  MODULE_LABELS,
  MODULE_LIST,
  PERMISSION_ACTIONS,
  ROLES,
  ROLE_LABELS,
} from '@/lib/constants';
import {
  bulkSetPermissions,
  fetchPermissionsMap,
} from '@/services/permissionService';
import { setCanLogin } from '@/services/profileService';
import { useAuth } from '@/hooks/useAuth';

export default function EmployeePermissionsScreen() {
  const { user: me } = useAuth();
  const { userId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      const perms = await fetchPermissionsMap(userId);
      setProfile(p);
      setMatrix(perms);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const toggleAction = useCallback((module, action, value) => {
    setMatrix((m) => ({
      ...m,
      [module]: { ...(m[module] || {}), [action]: value },
    }));
  }, []);

  async function saveAll() {
    setSaving(true);
    try {
      const rows = MODULE_LIST.map((module) => ({
        module,
        actions: PERMISSION_ACTIONS.reduce((acc, a) => {
          acc[a] = !!(matrix[module]?.[a]);
          return acc;
        }, {}),
      }));
      await bulkSetPermissions({
        userId,
        organizationId: me?.profile?.organization_id,
        rows,
      });
      navigate('/employees');
    } finally {
      setSaving(false);
    }
  }

  async function applyTemplate(role) {
    await supabase.rpc('fingas_apply_role_template', {
      p_user: userId,
      p_role: role,
    });
    await load();
  }

  async function setRole(role) {
    await supabase.from('profiles').update({ role }).eq('user_id', userId);
    setProfile((p) => p ? { ...p, role } : p);
  }

  async function setLogin(v) {
    if (!profile) return;
    await setCanLogin(profile.id, v);
    setProfile((p) => ({ ...p, can_login: v }));
  }

  async function setViewAll(v) {
    if (!profile) return;
    await supabase.from('profiles').update({ can_view_all_stations: v }).eq('id', profile.id);
    setProfile((p) => ({ ...p, can_view_all_stations: v }));
  }

  const groupedModules = useMemo(() => MODULE_LIST, []);

  if (loading || !profile) {
    return <div className="text-center text-ink-soft py-12">Загрузка…</div>;
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-ink-muted text-sm mb-2">
        <ChevronLeft className="w-4 h-4" /> Назад
      </button>

      <ScreenHeader
        title={profile.full_name || profile.email}
        subtitle={profile.email}
        right={<Badge tone="info">{ROLE_LABELS[profile.role] ?? profile.role}</Badge>}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Доступы</div>
          <div className="mt-1 text-xl font-bold text-ink truncate">{profile.full_name || profile.email}</div>
          <div className="mt-0.5 text-xs text-ink-muted">Роль: {ROLE_LABELS[profile.role] ?? profile.role}</div>
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <MiniCard label="Модули" value={MODULE_LIST.length} />
            <MiniCard label="Состояние" value={profile.can_login ? 'Вход on' : 'Вход off'} />
            <MiniCard label="АЗС" value={profile.can_view_all_stations ? 'Все' : 'Своя'} />
          </div>
        </div>
      </motion.div>

      <Card className="rounded-xl bg-bg-card/75 border-line/30 backdrop-blur-xl p-3.5">
        <div className="text-xs font-bold text-ink mb-2.5">Аккаунт</div>
        <div className="space-y-3">
          <Toggle
            label="Разрешить вход в приложение"
            hint="Управляет полем can_login"
            checked={profile.can_login}
            onChange={setLogin}
          />
          <Toggle
            label="Видит все АЗС организации"
            hint="иначе только свою станцию"
            checked={profile.can_view_all_stations}
            onChange={setViewAll}
          />
        </div>
      </Card>

      <Card className="mt-4 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
        <div className="font-semibold text-ink mb-3">Роль</div>
        <Select
          value={profile.role}
          onChange={(e) => setRole(e.target.value)}
        >
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </Select>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Object.values(ROLES).filter((r) => r !== ROLES.OWNER).map((r) => (
            <Button
              key={r}
              size="sm"
              variant="secondary"
              onClick={() => applyTemplate(r)}
            >
              Шаблон: {ROLE_LABELS[r]}
            </Button>
          ))}
        </div>
        <div className="text-xs text-ink-soft mt-2">
          Шаблон затирает текущие toggles. После него вручную включай/выключай нужные.
        </div>
      </Card>

      <Card className="mt-4 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
        <div className="font-semibold text-ink mb-3">Доступ к модулям и действия</div>
        <div className="space-y-5">
          {groupedModules.map((m) => (
            <div key={m}>
              <div className="text-sm font-semibold text-ink mb-2">{MODULE_LABELS[m]}</div>
              <div className="space-y-2">
                {PERMISSION_ACTIONS.map((a) => (
                  <Toggle
                    key={a}
                    label={ACTION_LABELS[a]}
                    checked={!!matrix[m]?.[a]}
                    onChange={(v) => toggleAction(m, a, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6">
        <Button size="block" loading={saving} onClick={saveAll}>
          <Save className="w-5 h-5" /> Сохранить права
        </Button>
      </div>
    </div>
  );
}

function MiniCard({ label, value }) {
  return (
    <div className="rounded-xl bg-bg-card/75 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className="mt-0.5 text-xs font-bold text-ink truncate">{value}</div>
    </div>
  );
}
