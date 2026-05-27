// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Operator dashboard — open/close shift actions, shift status, and salary info.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Square, Wallet, ChevronRight } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, formatDateTime } from '@/lib/formatters';
import { getCurrentOpenShift } from '@/services/shiftService';


export default function OperatorDashboard() {
  const { user } = useAuth();
  const liter = user?.profile?.liter_rate;
  const [activeShift, setActiveShift] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const row = await getCurrentOpenShift({ userId: user?.id });
        if (!cancelled) setActiveShift(row);
      } catch (e) {
        console.error('Error loading active shift:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (user?.id) load();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <div className="pb-2 space-y-2.5">
      <ScreenHeader
        title="Моя смена"
        subtitle={loading ? 'Проверка статуса...' : activeShift ? `Смена #${activeShift.id} активна` : 'Открой смену, чтобы начать'}
        right={
          <Badge tone={activeShift ? 'success' : 'default'} className="text-[10px]">
            {activeShift ? 'В смене' : 'Офлайн'}
          </Badge>
        }
      />

      {/* Main Shift Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-line/40 bg-bg-card p-3.5 shadow-sm relative overflow-hidden"
      >
        <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-brand-500/5 blur-2xl" />
        
        <div className="relative space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">
              Текущий статус
            </span>
            <span className={`text-xs font-bold ${activeShift ? 'text-success' : 'text-ink-muted'}`}>
              {activeShift ? 'Открыта' : 'Закрыта'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-line/40 bg-bg-elevated/40 p-2.5">
              <div className="text-[9px] font-medium text-ink-soft uppercase tracking-wider">Ставка за литр</div>
              <div className="mt-0.5 text-sm font-bold text-ink truncate">
                {liter ? formatMoney(liter, 'сом/л') : 'Сдельная'}
              </div>
            </div>
            <div className="rounded-xl border border-line/40 bg-bg-elevated/40 p-2.5">
              <div className="text-[9px] font-medium text-ink-soft uppercase tracking-wider">Время начала</div>
              <div className="mt-0.5 text-[11px] font-bold text-ink truncate">
                {activeShift ? formatDateTime(activeShift.opened_at) : '—'}
              </div>
            </div>
          </div>

          {activeShift ? (
            <Link to="/shifts" className="block">
              <Button size="block" variant="secondary" className="h-9 text-xs">
                <Square className="w-3.5 h-3.5 mr-1 text-danger fill-danger" /> Управление / Закрыть смену
              </Button>
            </Link>
          ) : (
            <Link to="/shifts" className="block">
              <Button size="block" className="h-9 text-xs bg-brand-500 hover:bg-brand-600 text-white border-brand-500">
                <Play className="w-3.5 h-3.5 mr-1 fill-white" /> Открыть смену
              </Button>
            </Link>
          )}
        </div>
      </motion.div>



      {/* My Compensation Info Card → детальная карточка сотрудника (моя) */}
      <Link to="/my-earnings" className="block">
        <Card hoverable className="!p-3 flex items-center justify-between border-line/40 bg-bg-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-success/10 border border-success/20 text-success flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ink">Моя зарплата</div>
              <div className="text-[10px] text-ink-muted mt-0.5">
                {liter ? `${formatMoney(liter, 'сом/л')} с каждого проданного литра` : 'Смены · начисления · выплаты'}
              </div>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />
        </Card>
      </Link>
    </div>
  );
}
