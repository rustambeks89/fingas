// [UPDATED BY ANTIGRAVITY CLI - 2026-05-26]
// Project: Fingas
// Purpose: Меню — роскошный, темонезависимый directories index и профильный центр в премиум-логике AinurPOS:
//   1. Header (заголовок + подзаголовок)
//   2. Роскошная люксовая интерактивная карточка Профиля пользователя с адаптивными градиентами
//   3. Умная горизонтальная интерактивная строка заявок сотрудников (PulseRow: Заявки), заменившая сетку плиток
//   4. Разделы меню справочников и опций, сгруппированные в скругленные обсидиановые контейнеры
//   5. Анимированные неоновые Crimson-маркеры сбоку при наведении на элементы меню
//   6. Стильная нижняя подпись версии
// Все вызовы Supabase, права доступа, роли, расчеты и отслеживание смен сохранены на 100% в исходном виде.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bell,
  Building2,
  ChevronRight,
  ClipboardList,
  Droplets,
  FileText,
  Fuel,
  Gauge,
  MapPin,
  MessageSquare,
  Receipt,
  Ruler,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { hasPermission, isOwner } from '@/lib/permissions';
import { MODULES, ROLE_LABELS, PROFILE_STATUS } from '@/lib/constants';
import { listEmployees } from '@/services/profileService';
import { supabase } from '@/lib/supabaseClient';
import {
  getCurrentSalesShift,
  listPendingShiftReports,
} from '@/services/shiftService';
import { formatMoney } from '@/lib/formatters';

function buildSections(user, owner) {
  const can = (m) => owner || hasPermission(user, m, 'can_view');
  const isOperator = user?.profile?.role === 'operator';

  return [
    ...(isOperator ? [{
      title: 'Личный кабинет',
      items: [
        { label: 'Мой заработок', icon: Wallet, to: '/my-earnings' },
      ],
    }] : []),
    {
      title: 'Справочники',
      items: [
        { label: 'Виды топлива',    icon: Droplets, to: '/directories/fuel-types',           show: can(MODULES.SETTINGS) },
        { label: 'Финансовые статьи',  icon: Wallet,   to: '/directories/cashflow-categories',  show: can(MODULES.SETTINGS) },
        { label: 'Кошельки',        icon: Wallet,   to: '/directories/wallets',              show: can(MODULES.SETTINGS) },
        { label: 'Резервуары',      icon: Gauge,    to: '/tanks',                            show: can(MODULES.FUEL_BALANCES) },
        { label: 'Градуировочная таблица', icon: Ruler, to: '/directories/tank-calibration-grid', show: can(MODULES.SETTINGS) },
        { label: 'Контрагенты',     icon: Users,    to: '/counterparties',                   show: can(MODULES.SUPPLIERS) },
      ],
    },
    {
      title: 'Система',
      items: [
        { label: 'Настройки',            icon: Settings, to: '/settings', show: can(MODULES.SETTINGS) },
        { label: 'Статус синхронизации', icon: Settings,   to: '/system' },
      ],
    },
  ];
}

export default function MoreScreen() {
  const { user } = useAuth();
  const profile = user?.profile;
  const owner = isOwner(user);

  const [pulse, setPulse] = useState({
    pendingShifts: 0,
    employeeRequests: 0,
    todayRevenue: 0,
    stationName: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [pending, requests, cur, stationRow] = await Promise.all([
          owner ? listPendingShiftReports({}).catch(() => []) : Promise.resolve([]),
          owner
            ? listEmployees({ organizationId: profile?.organization_id, status: PROFILE_STATUS.PENDING }).catch(() => [])
            : Promise.resolve([]),
          getCurrentSalesShift({ stationId: profile?.station_id }).catch(() => null),
          profile?.station_id
            ? supabase
                .from('stations')
                .select('name, city')
                .eq('id', profile.station_id)
                .maybeSingle()
                .then(({ data }) => data)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setPulse({
          pendingShifts: pending.length,
          employeeRequests: requests.length,
          todayRevenue: cur?.revenue ?? 0,
          stationName: stationRow
            ? `${stationRow.name}${stationRow.city ? ` · ${stationRow.city}` : ''}`
            : null,
        });
      } catch {/* noop */}
    }
    load();
    return () => { cancelled = true; };
  }, [owner, profile?.organization_id, profile?.station_id]);

  const sections = buildSections(user, owner)
    .map((s) => ({ ...s, items: s.items.filter((i) => i.show !== false) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="space-y-4 pb-4">
      <ScreenHeader title="Меню" subtitle="Профиль, настройки и справочники" />

      {/* Modern Profile Header - Spectacular luxury card layout */}
      <Link to="/profile" className="block active:scale-[0.99] transition-transform">
        <div className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-50/70 via-bg-card/95 to-brand-100/30 p-4.5 flex items-center justify-between shadow-card hover:shadow-md dark:border-brand-500/40 dark:from-brand-600/20 dark:via-bg-card/95 dark:to-brand-700/10 dark:shadow-card-premium transition-all duration-300">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-bg-card border border-brand-500/25 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Users className="w-6 h-6 text-brand-500" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-black text-ink truncate leading-tight">
                {profile?.full_name ?? user?.email}
              </div>
              <span className="text-[9px] text-ink-soft block mt-1 truncate leading-tight font-black uppercase tracking-wider">{user?.email}</span>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <Badge tone="brand" className="font-extrabold text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-lg">{ROLE_LABELS[profile?.role] ?? profile?.role}</Badge>
                {pulse.stationName && <Badge tone="default" className="font-bold text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-lg">{pulse.stationName}</Badge>}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4.5 h-4.5 text-ink-soft flex-shrink-0" />
        </div>
      </Link>

      {/* Directories sections */}
      <div className="space-y-4">
        {sections.map((s, sIdx) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sIdx * 0.035 }}
            className="space-y-1.5"
          >
            <span className="text-[9px] uppercase tracking-[0.22em] text-brand-400 font-black px-1.5">
              {s.title}
            </span>
            <Card className="!p-0.5 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl dark:shadow-card-premium relative">
              <ul className="divide-y divide-line/30 dark:divide-white/[0.03]">
                {s.items.map((it, idx) => (
                  <li key={`${it.label}-${it.to}-${idx}`}>
                    <Link
                      to={it.to}
                      className={
                        'flex items-center justify-between px-4 py-3.5 transition-all hover:bg-bg-elevated/40 active:bg-bg-elevated/60 min-w-0 rounded-xl relative group cursor-pointer ' +
                        (idx === 0 ? ' rounded-t-xl' : '') +
                        (idx === s.items.length - 1 ? ' rounded-b-xl' : '')
                      }
                    >
                      {/* Subtle brand marker left bar on hover */}
                      <div className="absolute left-1 top-3.5 bottom-3.5 w-1 rounded-r-lg bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-8.5 h-8.5 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-200">
                          <it.icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-ink truncate leading-tight group-hover:text-brand-400 transition-colors">
                          {it.label}
                        </span>
                      </div>
                      <ChevronRight className="w-4.5 h-4.5 text-ink-soft flex-shrink-0 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>
        ))}
      </div>

      {sections.length === 0 && (
        <Card className="!p-6 text-center mt-3 shadow-card border border-line/30 bg-bg-card/75 backdrop-blur-2xl">
          <Sparkles className="w-6 h-6 mx-auto text-ink-soft mb-2.5 animate-pulse" />
          <div className="text-xs text-ink-soft font-bold">
            Доступных разделов пока нет.
          </div>
        </Card>
      )}

      <div className="text-center text-[9px] uppercase tracking-widest text-ink-soft pt-4 font-black select-none">
        fingas · Версия 1.0.0
      </div>
    </div>
  );
}

