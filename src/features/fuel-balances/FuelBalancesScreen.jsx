// [UPDATED BY ANTIGRAVITY CLI - 2026-05-26]
// Project: Fingas
// Purpose: Остатки топлива — неординарный, ультра-премиальный SCADA-визуализатор запасов АЗС
// с интерактивными стеклянными цилиндрами резервуаров, бесконечным 3D-колебанием
// жидкостей и темонезависимыми градиентами под каждый тип топлива.

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Droplets, Gauge } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { listLatestBalances } from '@/services/balanceService';
import { formatLiters, formatDateTime } from '@/lib/formatters';

// Вспомогательная функция сопоставления марок топлива с уникальной палитрой и объемом
function getFuelStyle(name) {
  const n = String(name ?? '').toLowerCase();
  if (n.includes('95')) {
    return {
      title: 'АИ-95',
      gradient: 'from-amber-500 to-yellow-300',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.3)]',
      color: '#F59E0B',
      capacity: 25000,
    };
  }
  if (n.includes('92')) {
    return {
      title: 'АИ-92',
      gradient: 'from-emerald-500 to-teal-300',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]',
      color: '#10B981',
      capacity: 25000,
    };
  }
  if (n.includes('98') || n.includes('100')) {
    return {
      title: name,
      gradient: 'from-violet-600 to-fuchsia-400',
      glow: 'shadow-[0_0_15px_rgba(139,92,246,0.3)]',
      color: '#8B5CF6',
      capacity: 15000,
    };
  }
  if (n.includes('дт') || n.includes('дизель') || n.includes('diesel')) {
    return {
      title: 'ДТ',
      gradient: 'from-sky-600 to-cyan-400',
      glow: 'shadow-[0_0_15px_rgba(14,165,233,0.3)]',
      color: '#0EA5E9',
      capacity: 50000,
    };
  }
  return {
    title: name ?? 'Топливо',
    gradient: 'from-brand-600 to-rose-400',
    glow: 'shadow-[0_0_15px_rgba(244,63,94,0.3)]',
    color: '#F43F5E',
    capacity: 30000,
  };
}

export default function FuelBalancesScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const totalLiters = useMemo(() => rows.reduce((sum, row) => sum + Number(row.liters ?? 0), 0), [rows]);

  const combinedCapacity = useMemo(() => {
    return rows.reduce((sum, row) => {
      const style = getFuelStyle(row.fuel_name);
      return sum + style.capacity;
    }, 0);
  }, [rows]);

  const stationPercent = useMemo(() => {
    if (!combinedCapacity) return 0;
    return Math.min(100, Math.round((totalLiters / combinedCapacity) * 100));
  }, [totalLiters, combinedCapacity]);

  useEffect(() => {
    listLatestBalances()
      .then(setRows)
      .catch((e) => setErr(e?.message ?? 'Ошибка'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="pb-4">
      <ScreenHeader title="Запасы топлива" subtitle="Источник: АСУ (только чтение)" />

      {!loading && rows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-4 mb-3 border border-brand-500/20 bg-bg-card shadow-lg"
        >
          {/* Neon decorative glow */}
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />
          
          <div className="relative">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase tracking-[0.22em] text-brand-400 font-extrabold">Системные запасы</span>
                <h2 className="mt-1 text-2xl font-black text-ink leading-none">{formatLiters(totalLiters)}</h2>
              </div>
              <div className="px-2.5 py-1 rounded-xl bg-bg-elevated/70 border border-line/30 text-[10px] text-ink-muted font-bold select-none">
                {rows.length} резервуаров
              </div>
            </div>
            
            {/* Horizontal Combined Station Gauge */}
            <div className="mt-4 select-none">
              <div className="flex justify-between text-[9px] text-ink-soft font-extrabold mb-1.5 uppercase tracking-wider">
                <span>Общая заполненность АЗС</span>
                <span>{stationPercent}%</span>
              </div>
              <div className="h-4 rounded-xl bg-bg-elevated border border-line/45 p-0.5 overflow-hidden relative">
                {/* Sloshing Wave in Horizontal Container */}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stationPercent}%` }}
                  transition={{ type: 'spring', stiffness: 85, damping: 18 }}
                  className="h-full rounded-lg bg-gradient-to-r from-brand-600 via-brand-500 to-rose-400 relative overflow-hidden shadow-[0_0_8px_rgba(244,63,94,0.35)]"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                </motion.div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <MetricCard label="Марки топлива" value={`${rows.length} видов`} icon={Gauge} />
              <MetricCard label="Всего на складе" value={formatLiters(totalLiters)} icon={Droplets} />
            </div>
          </div>
        </motion.div>
      )}

      {err && (
        <div className="mb-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      )}

      {loading && (
        <div className="space-y-2 mt-4">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-28 rounded-2xl bg-bg-card border border-line/40 animate-pulse" />
          ))}
        </div>
      )}
      
      {!loading && rows.length === 0 && (
        <EmptyState
          icon={Droplets}
          title="Нет данных"
          description="Данные резервуаров ещё не синхронизированы с АСУ."
        />
      )}

      <div className="space-y-2">
        {rows.map((b, i) => {
          const style = getFuelStyle(b.fuel_name);
          const maxVol = style.capacity;
          const fillPercent = Math.min(100, Math.max(5, Math.round((Number(b.liters ?? 0) / maxVol) * 100)));
          
          let statusLabel = 'В норме';
          let statusTone = 'default';
          if (fillPercent > 80) {
            statusLabel = 'Полный';
            statusTone = 'success';
          } else if (fillPercent < 25) {
            statusLabel = 'Низкий уровень';
            statusTone = 'danger';
          }

          return (
            <Card key={b.id ?? i} className="!p-3 rounded-2xl border border-line/35 bg-bg-card/85 shadow-sm overflow-hidden relative">
              <div className="flex items-center gap-3.5 w-full">
                
                {/* Vertical Glass Tube SCADA Visualizer */}
                <div className="w-11 h-20 bg-bg-elevated/70 border border-line/40 rounded-xl relative overflow-hidden flex-shrink-0 flex items-end justify-center select-none shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)]">
                  {/* Measurement lines */}
                  <div className="absolute inset-y-2 left-1.5 w-1 flex flex-col justify-between text-[6px] text-ink-soft/45 font-mono z-15 pointer-events-none">
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                  </div>
                  
                  {/* Liquid Column */}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${fillPercent}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                    className={`w-full rounded-b-lg bg-gradient-to-t ${style.gradient} relative overflow-hidden ${style.glow}`}
                  >
                    {/* Infinite horizontal sloshing wave */}
                    <motion.svg
                      viewBox="0 0 120 28"
                      className="absolute top-0 left-0 w-[200%] h-4 -translate-y-[80%] text-current fill-current opacity-85"
                      animate={{
                        x: [-120, 0],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 3,
                        ease: 'linear',
                      }}
                      style={{ color: style.color }}
                    >
                      <path d="M0 15 C 30 15, 30 0, 60 0 C 90 0, 90 15, 120 15 C 150 15, 150 0, 180 0 C 210 0, 210 15, 240 15 L 240 28 L 0 28 Z" />
                    </motion.svg>
                    
                    {/* Glass sheen on liquid */}
                    <span className="absolute inset-y-0 right-1 w-1 bg-white/10 blur-[0.5px]" />
                  </motion.div>
                  
                  {/* Glass tube metallic top border */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-b from-white/20 to-transparent border-b border-white/10" />
                  
                  {/* Glass reflection gloss overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/15 rounded-xl pointer-events-none z-10" />
                </div>

                {/* Data Column */}
                <div className="flex-1 min-w-0 flex flex-col justify-between h-20 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-black text-ink leading-none">{style.title}</h3>
                      <p className="text-[9px] text-ink-muted mt-1 font-bold">
                        Резервуар {b.tank_id ?? '—'} · {formatDateTime(b.measured_at ?? b.synced_at)}
                      </p>
                    </div>
                    <Badge tone={statusTone} className="font-extrabold uppercase text-[7px] tracking-wider shrink-0 px-2 py-0.5">
                      {statusLabel}
                    </Badge>
                  </div>
                  
                  {/* Dashed divider metric row */}
                  <div className="flex items-end justify-between border-t border-dashed border-line/25 dark:border-white/[0.04] pt-1.5 mt-1 select-none">
                    <div>
                      <span className="text-[7.5px] uppercase tracking-wider text-ink-soft font-bold">Запас топлива</span>
                      <div className="text-xs font-black text-ink leading-none mt-0.5">{formatLiters(b.liters)}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[7.5px] uppercase tracking-wider text-ink-soft font-bold">Уровень / Заполнение</span>
                      <div className="text-[9px] text-ink font-extrabold leading-none mt-0.5">
                        {b.level_cm != null ? `${b.level_cm} см` : '—'} · <span className="text-brand-400">{fillPercent}%</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl bg-bg-elevated/70 border border-line/30 p-2.5 backdrop-blur-xl">
      <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.18em] text-ink-soft font-bold">
        <Icon className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-xs font-bold text-ink mt-0.5 truncate">{value}</div>
    </div>
  );
}
