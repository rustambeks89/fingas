// [UPDATED BY ANTIGRAVITY CLI - 2026-05-26]
// Project: Fingas
// Purpose: Быстрые действия — ультра-премиальный нижний лист с табами,
// разделением секций и высококлассной физикой анимаций:
//   1. Скользящий сегмент-переключатель категорий (Все, Финансы, Топливо, Справочники)
//   2. Вертикальные светящиеся неоновые маркеры секций
//   3. Упругие staggered-анимации появления плиток
//   4. Мягкий переход AnimatePresence в активную форму ввода

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  ArrowDownRight,
  ArrowUpRight,
  Fuel,
  Gauge,
  Repeat,
  Scale,
  Wallet,
  Wrench,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { hasPermission, isOwner } from '@/lib/permissions';
import { MODULES } from '@/lib/constants';
import { CashflowQuickForm } from '@/features/quick-add/forms/CashflowQuickForm';
import { FuelSupplyQuickForm } from '@/features/quick-add/forms/FuelSupplyQuickForm';
import { TankMeasurementQuickForm } from '@/features/quick-add/forms/TankMeasurementQuickForm';
import { CalibrationQuickForm } from '@/features/quick-add/forms/CalibrationQuickForm';
import { CounterpartyQuickForm } from '@/features/quick-add/forms/CounterpartyQuickForm';

const TABS = [
  { id: 'all', label: 'Все' },
  { id: 'finance', label: 'Финансы' },
  { id: 'fuel', label: 'Топливо' },
  { id: 'counterparties', label: 'Справочники' },
];

const TONE_CLS = {
  success: 'bg-gradient-to-br from-success/20 to-success/5 border border-success/35 text-success shadow-[0_0_12px_rgba(16,185,129,0.22)]',
  danger:  'bg-gradient-to-br from-danger/20 to-danger/5 border border-danger/35 text-danger shadow-[0_0_12px_rgba(239,68,68,0.22)]',
  info:    'bg-gradient-to-br from-info/20 to-info/5 border border-info/35 text-info shadow-[0_0_12px_rgba(59,130,246,0.22)]',
  brand:   'bg-gradient-to-br from-brand-500/20 to-brand-500/5 border border-brand-500/35 text-brand-400 shadow-[0_0_12px_rgba(244,63,94,0.22)]',
  default: 'bg-gradient-to-br from-bg-elevated to-bg-soft border border-line/50 text-ink-muted dark:from-white/10 dark:to-white/5 dark:text-white',
};

function canWrite(user, module, action = 'can_create') {
  return isOwner(user) || hasPermission(user, module, action);
}

function buildSections(user) {
  return [
    {
      title: 'Финансы и касса',
      items: [
        { key: 'cash-in', label: 'Приход', icon: ArrowDownRight, tone: 'success', show: canWrite(user, MODULES.CASHFLOW), title: 'Новый приход', description: 'Зачисление средств' },
        { key: 'cash-out', label: 'Расход', icon: ArrowUpRight, tone: 'danger', show: canWrite(user, MODULES.CASHFLOW), title: 'Новый расход', description: 'Списание средств' },
        { key: 'transfer', label: 'Перевод', icon: Repeat, tone: 'info', show: canWrite(user, MODULES.CASHFLOW), title: 'Внутренний перевод', description: 'Между кошельками' },
        { key: 'collection', label: 'Кассовая операция', icon: Wallet, tone: 'brand', show: canWrite(user, MODULES.COLLECTIONS), title: 'Кассовая операция / Инкассация', description: 'Сдать выручку в сейф' },
      ],
    },
    {
      title: 'Топливо и ТРК',
      items: [
        { key: 'fuel-supply', label: 'Поступление', icon: Fuel, tone: 'default', show: canWrite(user, MODULES.FUEL_SUPPLY), title: 'Поступление топлива', description: 'Приход по накладной' },
        { key: 'tank-measurement', label: 'Замер', icon: Gauge, tone: 'default', show: canWrite(user, MODULES.TANK_MEASUREMENTS), title: 'Замер резервуара', description: 'Уровень и объем' },
        { key: 'calibration', label: 'Поверка ТРК', icon: Wrench, tone: 'default', show: canWrite(user, MODULES.CALIBRATIONS), title: 'Поверка ТРК', description: 'Калибровочный пролив' },
        { key: 'adjustment', label: 'Корректировка', icon: Scale, tone: 'brand', show: canWrite(user, MODULES.CASHFLOW), title: 'Корректировка баланса', description: 'Исправить расхождения' },
      ],
    },
    {
      title: 'Контрагенты',
      items: [
        { key: 'supplier', label: 'Поставщик', icon: Building2, tone: 'brand', show: canWrite(user, MODULES.SUPPLIERS), title: 'Новый поставщик', description: 'Добавить в контрагенты' },
      ],
    },
  ];
}

export function QuickAddSheet({ open, onClose }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [activeKey, setActiveKey] = useState(null);

  const sections = useMemo(() => {
    const raw = buildSections(user);
    return raw
      .map((section) => ({ ...section, items: section.items.filter((item) => item.show) }))
      .filter((section) => section.items.length > 0);
  }, [user]);

  const filteredSections = useMemo(() => {
    if (activeTab === 'all') return sections;
    if (activeTab === 'finance') {
      return sections.filter((s) => s.title === 'Финансы и касса');
    }
    if (activeTab === 'fuel') {
      return sections.filter((s) => s.title === 'Топливо и ТРК');
    }
    if (activeTab === 'counterparties') {
      return sections.filter((s) => s.title === 'Контрагенты');
    }
    return sections;
  }, [activeTab, sections]);

  const activeAction = useMemo(() => {
    for (const section of sections) {
      const found = section.items.find((item) => item.key === activeKey);
      if (found) return found;
    }
    return null;
  }, [activeKey, sections]);

  function closeSheet() {
    setActiveKey(null);
    setActiveTab('all');
    onClose?.();
  }

  function handleDone() {
    closeSheet();
  }

  function handleBack() {
    setActiveKey(null);
  }

  return (
    <BottomSheet open={open} onClose={closeSheet} title={activeAction ? activeAction.title : 'Быстрое действие'}>
      <div className="relative overflow-hidden min-h-[360px] pt-1">
        <AnimatePresence mode="wait">
          {activeKey ? (
            <motion.div
              key="quick-form-view"
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="space-y-4"
            >
              {/* Form custom premium header with Back Button */}
              <div className="flex items-center gap-3 border-b border-dashed border-line/30 dark:border-white/[0.06] pb-3.5 select-none">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08, x: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleBack}
                  className="w-8 h-8 rounded-xl bg-bg-elevated/70 border border-line/30 flex items-center justify-center text-ink cursor-pointer hover:bg-bg-elevated"
                >
                  <ChevronLeft className="w-4.5 h-4.5" />
                </motion.button>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] uppercase tracking-[0.22em] text-brand-400 font-extrabold">Быстрый ввод</span>
                  <div className="text-[10px] text-ink-muted mt-0.5 font-bold truncate">
                    {activeAction ? activeAction.description : 'Заполните параметры'}
                  </div>
                </div>
                {activeAction && (
                  <Badge tone={activeAction.tone} className="font-extrabold uppercase text-[8px] tracking-wider px-2.5 py-1">
                    {activeAction.label}
                  </Badge>
                )}
              </div>

              <div className="pt-1">
                {activeAction && renderForm(activeAction.key, handleDone, handleBack)}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="quick-menu-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="space-y-4"
            >
              <div className="text-[10px] text-ink-soft leading-relaxed font-bold select-none">
                Выберите тип быстрой операции для мгновенной фиксации в системе.
              </div>

              {/* Sliding Category Tab Bar */}
              <div className="grid grid-cols-4 gap-0.5 rounded-xl border border-line/30 bg-bg-elevated/60 p-0.5 relative overflow-hidden select-none">
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className="relative h-8 rounded-lg text-[10px] font-extrabold tracking-wider transition-all duration-200 outline-none flex items-center justify-center cursor-pointer"
                    >
                      {isActive && (
                        <motion.span
                          layoutId="activeQuickTab"
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          className="absolute inset-0 rounded-lg bg-brand-500 text-white shadow-sm"
                        />
                      )}
                      <span className={`relative z-10 ${isActive ? 'text-white' : 'text-ink-muted hover:text-ink'}`}>
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {sections.length === 0 ? (
                <div className="text-xs text-ink-soft py-12 text-center font-bold">
                  У вас нет прав на быстрые операции.
                </div>
              ) : (
                <div className="space-y-4 pt-1.5">
                  {filteredSections.map((section, sIdx) => (
                    <div key={section.title} className="space-y-2 select-none">
                      {/* Section Title with Vertical Glowing Indicator Track */}
                      <div className="flex items-center gap-2 select-none relative pb-1">
                        <span className="w-1.5 h-3.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                        <span className="text-[9px] uppercase tracking-[0.22em] text-brand-400 font-extrabold">
                          {section.title}
                        </span>
                      </div>

                      {/* Action Grid */}
                      <div className="grid grid-cols-2 gap-2.5">
                        {section.items.map((item, itemIdx) => (
                          <motion.button
                            key={item.key}
                            type="button"
                            onClick={() => setActiveKey(item.key)}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              type: 'spring',
                              stiffness: 300,
                              damping: 25,
                              delay: sIdx * 0.04 + itemIdx * 0.03,
                            }}
                            whileHover={{ y: -3, scale: 1.01 }}
                            whileTap={{ scale: 0.97 }}
                            className="rounded-2xl bg-bg-card/75 border border-line/35 p-3.5 text-left transition-all flex flex-col justify-between h-24 relative overflow-hidden group cursor-pointer shadow-sm hover:shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
                            style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
                          >
                            {/* Interactive side glowing line that expands on hover */}
                            <div className="absolute left-0 top-3.5 bottom-3.5 w-1 rounded-r-lg bg-brand-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-y-110" />

                            <div className="flex items-center justify-between w-full gap-2 relative">
                              <span className="text-xs font-black text-ink leading-tight group-hover:text-brand-400 transition-colors truncate">
                                {item.label}
                              </span>
                              <div className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200 ${TONE_CLS[item.tone] ?? TONE_CLS.default}`}>
                                <item.icon className="w-4 h-4" />
                              </div>
                            </div>
                            <div className="text-[9px] text-ink-soft font-semibold leading-tight mt-2 line-clamp-2 relative">
                              {item.description}
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </BottomSheet>
  );
}

function renderForm(key, onDone, onCancel) {
  switch (key) {
    case 'cash-in':
      return <CashflowQuickForm mode="income" onDone={onDone} onCancel={onCancel} />;
    case 'cash-out':
      return <CashflowQuickForm mode="expense" onDone={onDone} onCancel={onCancel} />;
    case 'transfer':
      return <CashflowQuickForm mode="transfer" onDone={onDone} onCancel={onCancel} />;
    case 'collection':
      return <CashflowQuickForm mode="collection" onDone={onDone} onCancel={onCancel} />;
    case 'fuel-supply':
      return <FuelSupplyQuickForm onDone={onDone} onCancel={onCancel} />;
    case 'tank-measurement':
      return <TankMeasurementQuickForm onDone={onDone} onCancel={onCancel} />;
    case 'calibration':
      return <CalibrationQuickForm onDone={onDone} onCancel={onCancel} />;
    case 'adjustment':
      return <CashflowQuickForm mode="adjustment" onDone={onDone} onCancel={onCancel} />;
    case 'supplier':
      return <CounterpartyQuickForm onDone={onDone} onCancel={onCancel} />;
    default:
      return null;
  }
}
