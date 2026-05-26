// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: RegisterScreen - clean minimalist premium self-registration.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { signUp, completeRegistration } from '@/services/authService';
import {
  listRegistrationOrganizations,
  listRegistrationStations,
} from '@/services/stationService';
import { ROLES, ROLE_LABELS } from '@/lib/constants';
import { Wordmark } from '@/components/ui/Logo';

function getRegisterErrorMessage(err) {
  const raw = err?.message ?? '';
  if (raw === 'EMAIL_CONFIRMATIONS_ENABLED') {
    return 'Уведомление: на ваш почтовый ящик отправлено письмо для подтверждения аккаунта.';
  }
  return raw || 'Ошибка регистрации.';
}

export default function RegisterScreen() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    organization_id: '',
    station_id: '',
    role: '',
  });

  const [organizations, setOrganizations] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const set = (key) => (e) => setForm((c) => ({ ...c, [key]: e.target.value }));

  useEffect(() => {
    listRegistrationOrganizations()
      .then((rows) => {
        setOrganizations(rows);
        if (rows.length === 1) {
          setForm((c) => ({ ...c, organization_id: rows[0].id }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.organization_id) {
      setStations([]);
      return;
    }
    listRegistrationStations({ organizationId: form.organization_id })
      .then(setStations)
      .catch(() => {});
  }, [form.organization_id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      const emailLower = form.email.trim().toLowerCase();
      const res = await signUp({
        email: emailLower,
        password: form.password,
      });
      const userId = res?.user?.id ?? res?.session?.user?.id;
      if (!userId) throw new Error('Не удалось создать auth-пользователя');

      await completeRegistration({
        userId,
        email: emailLower,
        fullName: form.full_name,
        phone: form.phone,
        organizationId: form.organization_id || null,
        stationId: form.station_id || null,
        requestedRole: form.role || 'operator',
      });
      navigate('/');
    } catch (e) {
      setErr(getRegisterErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-12 overflow-hidden bg-bg">
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-brand-500/10 dark:bg-brand-500/5 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[400px] z-10"
      >
        <div className="text-center mb-6 flex flex-col items-center justify-center">
          <Wordmark className="text-2xl font-black mx-auto mb-1.5" />
          <p className="text-xs text-ink-soft mt-1 font-semibold uppercase tracking-wider">Создание учетной записи сотрудника</p>
        </div>

        <div className="bg-bg-card border border-line/40 rounded-3xl p-6 shadow-xl backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="ФИО сотрудника" placeholder="Иванов Иван" value={form.full_name} onChange={set('full_name')} required />
            <Input label="Телефон" type="tel" placeholder="+7" value={form.phone} onChange={set('phone')} />
            <Input label="Email" type="email" placeholder="name@company.com" value={form.email} onChange={set('email')} required />
            <Input label="Пароль" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
            
            <Select
              label="Организация"
              value={form.organization_id}
              onChange={set('organization_id')}
              hint={organizations.length === 0 ? 'Нет доступных организаций.' : undefined}
              required
            >
              <option value="">Выбрать…</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>

            {form.organization_id && (
              stations.length === 0 ? (
                <div className="rounded-2xl border border-line bg-bg-elevated px-4 py-3">
                  <div className="text-[11px] font-bold text-ink uppercase tracking-wider">Станции не назначены</div>
                  <div className="mt-1 text-[10px] text-ink-soft leading-relaxed">
                    У выбранной организации пока нет активных АЗС. Сотрудник будет зарегистрирован без привязки к станции.
                  </div>
                </div>
              ) : (
                <Select
                  label="АЗС"
                  value={form.station_id}
                  onChange={set('station_id')}
                  hint="Можно оставить пустым, если сотрудник работает на всех АЗС."
                >
                  <option value="">— Все станции —</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              )
            )}

            <Select label="Желаемая роль" value={form.role} onChange={set('role')}>
              {Object.values(ROLES).filter((r) => r !== ROLES.OWNER).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>

            {err && (
              <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-3 leading-relaxed">
                {err}
              </div>
            )}
            
            <Button type="submit" size="block" loading={loading} className="mt-2">
              Отправить заявку
            </Button>
          </form>

          <p className="text-center text-xs text-ink-muted mt-5">
            Уже зарегистрированы?{' '}
            <Link className="text-brand-500 font-bold hover:underline" to="/login">Войти в личный кабинет</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
