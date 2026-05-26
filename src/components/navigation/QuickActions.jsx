// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Quick actions bottom sheet — triggered by center FAB (+) in navbar.
// Shows role-aware actions for adding data to reports.

import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList,
  Fuel,
  Wallet,
  Gauge,
  Receipt,
  Banknote,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { hasPermission, isOwner } from '@/lib/permissions';
import { MODULES } from '@/lib/constants';

const ALL_ACTIONS = [
  { id: 'shift', label: 'Открыть смену', icon: ClipboardList, to: '/shifts', module: MODULES.SHIFTS, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { id: 'fuel', label: 'Поступление топлива', icon: Fuel, to: '/fuel-supply', module: MODULES.FUEL_SUPPLY, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  { id: 'measure', label: 'Замер резервуара', icon: Gauge, to: '/tank-measurements', module: MODULES.TANK_MEASUREMENTS, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  { id: 'collection', label: 'Инкассация', icon: Wallet, to: '/collections', module: MODULES.COLLECTIONS, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { id: 'expense', label: 'Расход / Cash Flow', icon: Receipt, to: '/cashflow', module: MODULES.CASHFLOW, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  { id: 'salary', label: 'Зарплата', icon: Banknote, to: '/payroll', module: MODULES.PAYROLL, color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
];

export function QuickActions({ open, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const owner = isOwner(user);

  const actions = ALL_ACTIONS.filter(
    (a) => owner || hasPermission(user, a.module, 'can_create') || hasPermission(user, a.module, 'can_view'),
  );

  function handleAction(action) {
    onClose();
    navigate(action.to);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl border-t border-line/30 safe-bottom"
            style={{
              background: 'rgba(7, 11, 20, 0.96)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-8 h-1 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <div>
                <div className="text-sm font-bold text-white">Быстрое действие</div>
                <div className="text-[10px] text-white/50">Добавить запись в отчёт</div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:text-white active:scale-95 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Actions grid */}
            <div className="px-4 pb-6 grid grid-cols-3 gap-2">
              {actions.map((a, i) => (
                <motion.button
                  key={a.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => handleAction(a)}
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-white/5 border border-white/8 hover:bg-white/10 active:scale-95 transition-all"
                >
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${a.color}`}>
                    <a.icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-[10px] font-medium text-white/80 leading-tight text-center">
                    {a.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
