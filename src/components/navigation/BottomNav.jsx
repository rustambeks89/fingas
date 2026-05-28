// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Bottom navigation — floating translucent capsule under the royal Amethyst & Crimson style guidelines.

import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home,
  Menu,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { cn } from '@/lib/cn';

import { QuickAddSheet } from '@/components/bottom-sheets/QuickAddSheet';

export function BottomNav() {
  const [showActions, setShowActions] = useState(false);

  return (
    <>
      <nav className="fixed left-0 right-0 bottom-3.5 z-30 px-4">
        <div className="max-w-screen-sm mx-auto">
          <div
            className="rounded-2xl px-2 py-1.5 relative border border-transparent shadow-lg bg-bg-card/95 backdrop-blur-xl"
          >
            <ul className="grid grid-cols-5 gap-0 relative z-10 items-end">
              {/* 1. Главная */}
              <li><TabItem to="/" label="Главная" icon={Home} exact /></li>

              {/* 2. Продажи */}
              <li><TabItem to="/sales" label="Продажи" icon={TrendingUp} /></li>

              {/* 3. Center FAB */}
              <li className="flex justify-center">
                <div className="relative -mt-5">
                  {/* Luxury Pulsing Outer Aura */}
                  <motion.div
                    animate={{
                      scale: [1, 1.15, 1],
                      opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="absolute inset-0 rounded-full bg-brand-500/70 blur-md pointer-events-none"
                  />
                  
                  {/* Main Action Button */}
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.9, rotate: 90 }}
                    onClick={() => setShowActions(true)}
                    className="relative w-11 h-11 rounded-full bg-gradient-to-tr from-brand-600 via-brand-500 to-rose-400 text-white shadow-[0_4px_20px_rgba(244,63,94,0.55)] border border-white/20 flex items-center justify-center overflow-hidden group cursor-pointer"
                    aria-label="Быстрое действие"
                  >
                    {/* Radial sheen highlight */}
                    <span className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/15 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out" />
                    
                    {/* Plus icon — static SVG, no re-animation each render */}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      className="w-5 h-5 relative z-10 text-white drop-shadow-[0_2px_8px_rgba(255,255,255,0.65)] transition-transform duration-500 group-hover:rotate-45"
                    >
                      <path d="M12 5V19" strokeWidth={3} strokeLinecap="round" />
                      <path d="M5 12H19" strokeWidth={3} strokeLinecap="round" />
                    </svg>
                  </motion.button>
                </div>
              </li>

              {/* 4. Кэшфлоу */}
              <li><TabItem to="/cashflow" label="Кэшфлоу" icon={Wallet} /></li>

              {/* 5. Меню */}
              <li><TabItem to="/more" label="Меню" icon={Menu} exact /></li>
            </ul>
          </div>
        </div>
      </nav>

      <QuickAddSheet open={showActions} onClose={() => setShowActions(false)} />
    </>
  );
}

function ActivePill() {
  return (
    <motion.span
      layoutId="navPill"
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-500/10 via-violet-500/10 to-brand-500/10 border border-brand-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    />
  );
}

function TabItem({ to, label, icon: Icon, exact, badge }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          'relative flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[9px] uppercase tracking-wider font-bold transition-all duration-200',
          isActive ? 'text-brand-500' : 'text-ink-muted hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <ActivePill />}
          <div className="relative">
            <Icon className={cn('relative w-4.5 h-4.5 transition-colors', isActive ? 'text-brand-500' : 'text-ink-muted')} />
            {badge && (
              <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-500" />
              </span>
            )}
          </div>
          <span className="relative leading-none">{label}</span>
        </>
      )}
    </NavLink>
  );
}
