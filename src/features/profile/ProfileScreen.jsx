// [UPDATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Full profile screen — avatar upload, identity card, station/org
// names, role-specific blocks (operator salary), edit phone, change password,
// sign out, theme switcher.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Building2,
  Camera,
  Check,
  LogOut,
  MapPin,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchMyProfileExpanded,
  updateMyProfile,
  uploadAvatar,
} from '@/services/profileService';
import { supabase } from '@/lib/supabaseClient';
import { ROLES, ROLE_LABELS, PROFILE_STATUS, PROFILE_STATUS_LABELS } from '@/lib/constants';
import { formatMoney } from '@/lib/formatters';

export default function ProfileScreen() {
  const { user, signOut, refresh } = useAuth();
  const [expanded, setExpanded] = useState(null);
  const [phone, setPhone] = useState(user?.profile?.phone ?? '');
  const [fullName, setFullName] = useState(user?.profile?.full_name ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState('info');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    fetchMyProfileExpanded(user.id).then(setExpanded).catch(() => setExpanded(null));
  }, [user?.id]);

  function flash(text, tone = 'info') {
    setMsg(text);
    setMsgTone(tone);
    setTimeout(() => setMsg(''), 2500);
  }

  async function saveProfile(e) {
    e?.preventDefault?.();

    if ((password || passwordConfirm) && !password) {
      flash('Введите новый пароль', 'danger');
      return;
    }

    if ((password || passwordConfirm) && !passwordConfirm) {
      flash('Подтвердите новый пароль', 'danger');
      return;
    }

    if (password && password.length < 8) {
      flash('Пароль минимум 8 символов', 'danger');
      return;
    }

    if (password && password !== passwordConfirm) {
      flash('Пароли не совпадают', 'danger');
      return;
    }

    setSaving(true);
    try {
      await updateMyProfile(user.id, { phone, full_name: fullName });

      if (password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      }

      await refresh();
      setPassword('');
      setPasswordConfirm('');
      flash(password ? 'Профиль и пароль сохранены' : 'Профиль сохранён', 'success');
    } catch (e) {
      flash(e?.message ?? 'Ошибка сохранения', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAvatar(user.id, file);
      await refresh();
      flash('Аватар обновлён', 'success');
    } catch (err) {
      flash(err?.message ?? 'Не удалось загрузить', 'danger');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const p = user?.profile;
  const role = p?.role;
  const isOperator = role === ROLES.OPERATOR;
  const station = expanded?.station;
  const organization = expanded?.organization;

  const statusTone =
    p?.status === PROFILE_STATUS.ACTIVE ? 'success' :
    p?.status === PROFILE_STATUS.BLOCKED ? 'danger' :
    p?.status === PROFILE_STATUS.REJECTED ? 'warning' : 'info';

  return (
    <div>
      <ScreenHeader title="Профиль" subtitle="Личные данные и доступ" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Карта профиля</div>
          <div className="mt-1 text-xl font-bold text-ink truncate">{p?.full_name ?? user?.email}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{organization?.name ?? 'Организация не выбрана'} · {station?.name ?? 'АЗС не выбрана'}</div>
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <SummaryCard label="Роль" value={role ? (ROLE_LABELS[role] ?? role) : '—'} />
            <SummaryCard label="Статус" value={p?.status ? (PROFILE_STATUS_LABELS[p.status] ?? p.status) : '—'} />
          </div>
        </div>
      </motion.div>

      {/* IDENTITY */}
      <Card className="rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar size="lg" name={p?.full_name ?? user?.email} src={p?.avatar_url} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-500 text-white border-2 border-bg-card flex items-center justify-center hover:bg-brand-600 disabled:opacity-50"
              aria-label="Загрузить аватар"
            >
              {uploading ? (
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={pickAvatar}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink">
              {p?.full_name ?? user?.email}
            </div>
            <div className="text-xs text-ink-muted">{user?.email}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {role && <Badge tone="brand">{ROLE_LABELS[role] ?? role}</Badge>}
              {p?.status && <Badge tone={statusTone}>{PROFILE_STATUS_LABELS[p.status] ?? p.status}</Badge>}
              {p?.can_login === false && <Badge tone="danger">вход отключен</Badge>}
            </div>
          </div>
        </div>
      </Card>

      {/* CONTEXT */}
      <Card className="mt-3 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
        <div className="grid grid-cols-1 gap-3 text-sm">
          <InfoRow icon={Building2} label="Организация" value={organization?.name ?? '—'} />
          <InfoRow icon={MapPin} label="АЗС" value={station ? `${station.name}${station.city ? ` · ${station.city}` : ''}` : '—'} />
          <InfoRow icon={Briefcase} label="Тип оплаты" value={
            p?.salary_type === 'fixed' ? 'Фикс за смену' :
            p?.salary_type === 'piecework' ? 'Сдельная' : '—'
          } />
        </div>
      </Card>

      {/* OPERATOR SALARY */}
      {isOperator && (
        <Card className="mt-3">
          <div className="font-semibold mb-2">Моя зарплата</div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Ставка/смена" value={p?.fixed_shift_rate != null ? formatMoney(p.fixed_shift_rate) : '—'} />
            <Stat label="Цена за литр" value={p?.liter_rate != null ? formatMoney(p.liter_rate, 'сом/л') : '—'} />
          </div>
          <div className="text-xs text-ink-soft mt-3">
            Ставку задаёт владелец. Начисления появятся после первой закрытой смены.
          </div>
        </Card>
      )}

      {/* PERSONAL + PASSWORD */}
      <Card className="mt-3 space-y-3 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
        <div className="font-semibold">Личные данные</div>
        <Input label="ФИО" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Телефон" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />

        <div className="pt-2">
          <div className="font-semibold">Новый пароль</div>
          <div className="text-xs text-ink-soft mt-1">Заполняй только если нужно сменить пароль.</div>
        </div>
        <Input
          type="password"
          label="Новый пароль"
          placeholder="минимум 8 символов"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          type="password"
          label="Подтверждение пароля"
          placeholder="повтори новый пароль"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
        />

        <Button variant="success" onClick={saveProfile} loading={saving}>
          Сохранить
        </Button>
      </Card>

      {msg && (
        <div className={
          'text-sm mt-3 px-4 py-2.5 rounded-2xl text-center border ' +
          (msgTone === 'success' ? 'bg-success/10 border-success/30 text-success' :
           msgTone === 'danger'  ? 'bg-danger/10 border-danger/30 text-danger' :
                                   'bg-bg-elevated border-line text-ink-muted')
        }>
          {msgTone === 'success' && <Check className="inline w-4 h-4 mr-1" />}
          {msg}
        </div>
      )}

      <Button variant="danger" size="block" className="mt-6" onClick={signOut}>
        <LogOut className="w-5 h-5" /> Выйти
      </Button>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl bg-bg-card/75 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className="mt-0.5 text-xs font-bold text-ink truncate">{value}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-bg-elevated border border-line/35 flex items-center justify-center text-ink-muted flex-shrink-0">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] uppercase tracking-wide text-ink-soft">{label}</div>
        <div className="text-xs text-ink truncate">{value}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-bg-elevated border border-line/35 p-2.5">
      <div className="text-[9px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="text-xs font-semibold text-ink mt-0.5">{value}</div>
    </div>
  );
}
