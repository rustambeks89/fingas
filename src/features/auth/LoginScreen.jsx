// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Sign-in screen — modern minimal premium SaaS look (Stripe/Linear style).

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Wordmark } from '@/components/ui/Logo';
import { signIn } from '@/services/authService';
import { Fuel, ShieldCheck, TrendingUp } from 'lucide-react';

export default function LoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      await signIn({
        email: email.trim().toLowerCase(),
        password,
      });
      navigate('/');
    } catch (e) {
      setErr(e?.message ?? 'Неверный email или пароль');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden bg-bg">
      {/* SaaS Premium Backlight Glows */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-brand-500/10 dark:bg-brand-500/5 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -left-20 w-[400px] h-[400px] rounded-full bg-info/10 dark:bg-info/5 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[390px] z-10"
      >
        <div className="text-center mb-8 flex flex-col items-center justify-center">
          <Wordmark className="text-3xl font-black mx-auto mb-1.5" />
          <p className="text-xs text-ink-soft uppercase tracking-widest font-semibold">
            Система учета АЗС
          </p>
        </div>

        <div className="bg-bg-card border border-line/40 rounded-3xl p-6 shadow-xl backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              label="Email"
              placeholder="name@company.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              label="Пароль"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {err && (
              <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-3 leading-relaxed">
                {err}
              </div>
            )}
            <Button type="submit" size="block" loading={loading} className="mt-2">
              Войти в кабинет
            </Button>
          </form>

          <div className="text-center text-xs text-ink-muted mt-5">
            Новый сотрудник?{' '}
            <Link className="text-brand-500 font-bold hover:underline" to="/register">
              Создать аккаунт
            </Link>
          </div>
        </div>

        {/* Feature badges */}
        <div className="grid grid-cols-3 gap-2 mt-8">
          <Feature icon={Fuel} label="Топливо" />
          <Feature icon={TrendingUp} label="Финансы" />
          <Feature icon={ShieldCheck} label="Контроль" />
        </div>
      </motion.div>
    </div>
  );
}

function Feature({ icon: Icon, label }) {
  return (
    <div className="rounded-2xl bg-bg-card/40 border border-line/30 px-3 py-2.5 flex flex-col items-center gap-1.5">
      <div className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500">
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">{label}</span>
    </div>
  );
}
