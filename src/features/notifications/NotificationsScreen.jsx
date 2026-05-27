// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Notification center — auto-marks unread as read on first view,
// mark-all button, link-aware items.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, CheckCheck } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/status/EmptyState';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { formatRelative } from '@/lib/formatters';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [pushSupported, setPushSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setPushSupported('Notification' in window);
    setPermission('Notification' in window ? Notification.permission : 'default');
    setIsStandalone(
      window.navigator.standalone || 
      window.matchMedia('(display-mode: standalone)').matches
    );
  }, []);

  async function requestPushPermission() {
    if (!pushSupported) return;
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
    } catch (e) {
      console.warn('Failed to request push permission:', e);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setRows(data ?? []);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications_${userId}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);



  async function markAllRead() {
    const ids = rows.map((n) => n.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('notifications')
      .delete()
      .in('id', ids);
    if (!error) {
      setRows([]);
    }
  }

  async function markAsRead(id) {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);
    if (!error) {
      setRows((prev) => prev.filter((n) => n.id !== id));
    }
  }

  // Свайп вверх по карточке = убрать из списка (пометить прочитанным).
  function handleSwipeUp(id, _, info) {
    if (info.offset.y < -80 || info.velocity.y < -500) {
      markAsRead(id);
    }
  }

  const visibleRows = rows;
  const unread = rows.length;

  return (
    <div>
      <ScreenHeader
        title="Уведомления"
        subtitle={unread > 0 ? `${unread} новых` : 'Уведомлений нет'}
        right={unread > 0 ? (
          <Button size="sm" variant="secondary" onClick={markAllRead}>
            Очистить
          </Button>
        ) : null}
      />

      {/* PWA & Push Notifications Card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-line/40 bg-bg-card p-3 shadow-sm mb-3 relative overflow-hidden"
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold text-ink">Уведомления на телефоне</h3>
            <p className="text-[10px] text-ink-muted mt-0.5">
              {!pushSupported
                ? 'Уведомления не поддерживаются на этом устройстве.'
                : permission === 'granted'
                ? 'Системные уведомления успешно подключены!'
                : permission === 'denied'
                ? 'Доступ заблокирован в системных настройках.'
                : 'Получайте важные события и сообщения прямо на экран телефона.'}
            </p>
          </div>
        </div>

        <div className="mt-3.5 pt-3 border-t border-line/20">
          {!isStandalone && /iPhone|iPad|iPod/i.test(navigator.userAgent) ? (
            <div className="text-[11px] text-brand-400 bg-brand-500/5 rounded-xl p-2.5 border border-brand-500/15 leading-relaxed">
              <span className="font-bold">Чтобы получать уведомления на iPhone:</span>
              <ol className="list-decimal list-inside mt-1 space-y-0.5 text-ink-muted">
                <li>Нажмите кнопку <span className="font-semibold text-ink">«Поделиться»</span> (квадрат со стрелкой внизу)</li>
                <li>Выберите <span className="font-semibold text-ink">«На экран Домой»</span></li>
                <li>Запустите Fingas с экрана Домой и включите уведомления здесь</li>
              </ol>
            </div>
          ) : pushSupported && permission === 'default' ? (
            <Button
              size="sm"
              variant="brand"
              className="w-full h-8 text-[11px] rounded-xl font-bold"
              onClick={requestPushPermission}
            >
              Включить уведомления
            </Button>
          ) : pushSupported && permission === 'granted' ? (
            <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] font-semibold text-success bg-success/5 border border-success/15 rounded-xl">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping" />
              Пуш-уведомления активны
            </div>
          ) : permission === 'denied' ? (
            <div className="text-center py-1 text-[10px] text-ink-muted bg-bg-elevated rounded-xl">
              Разрешите уведомления для Fingas в настройках телефона.
            </div>
          ) : (
            <div className="text-center py-1 text-[10px] text-ink-soft bg-bg-elevated rounded-xl">
              Добавьте Fingas на рабочий стол телефона как приложение.
            </div>
          )}
        </div>
      </motion.div>

      {!loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Центр событий</div>
            <div className="mt-1 text-xl font-bold text-ink">{rows.length}</div>
            <div className="mt-0.5 text-xs text-ink-muted">{unread} активных уведомлений</div>
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <StatCard label="Новые" value={unread} tone="brand" />
              <StatCard label="Всего" value={rows.length} tone="default" />
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
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-[1.4rem] bg-bg-card border border-line/60 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && visibleRows.length === 0 && (
        <EmptyState
          icon={Bell}
          title="Тихо"
          description="Новых уведомлений нет. Сюда будут приходить события: новая заявка, закрытая смена, инкассация на подтверждение."
        />
      )}

      <div className="space-y-2">
        {!loading && visibleRows.map((n, i) => {
          const hasLink = Boolean(n.link);
          const Wrap = hasLink ? Link : 'div';
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -120, transition: { duration: 0.18 } }}
              transition={{ delay: i * 0.02 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.5, bottom: 0 }}
              dragMomentum={false}
              onDragEnd={(e, info) => handleSwipeUp(n.id, e, info)}
              onClick={() => markAsRead(n.id)}
              className="touch-pan-y cursor-grab active:cursor-grabbing"
            >
              {hasLink ? (
                <Wrap to={n.link}>
                  <Card className="!p-3 rounded-xl bg-bg-card border border-brand-500/20 bg-brand-500/5 transition-all duration-300">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 bg-brand-500/10 border-brand-500/20 text-brand-400">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-ink truncate">{n.title}</div>
                        {n.body && (
                          <div className="text-[11px] text-ink-muted truncate mt-0.5">{n.body}</div>
                        )}
                        <div className="text-[10px] text-ink-soft mt-1">
                          {formatRelative(n.created_at)}
                        </div>
                      </div>
                      <Badge tone="brand" className="text-[9px] px-1 py-0.5">new</Badge>
                    </div>
                  </Card>
                </Wrap>
              ) : (
                <Wrap>
                  <Card className="!p-3 rounded-xl bg-bg-card border border-brand-500/20 bg-brand-500/5 transition-all duration-300">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 bg-brand-500/10 border-brand-500/20 text-brand-400">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-ink truncate">{n.title}</div>
                        {n.body && (
                          <div className="text-[11px] text-ink-muted truncate mt-0.5">{n.body}</div>
                        )}
                        <div className="text-[10px] text-ink-soft mt-1">
                          {formatRelative(n.created_at)}
                        </div>
                      </div>
                      <Badge tone="brand" className="text-[9px] px-1 py-0.5">new</Badge>
                    </div>
                  </Card>
                </Wrap>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const cls = tone === 'brand'
    ? 'bg-brand-500/10 border-brand-500/25 text-brand-400'
    : 'bg-bg-card border-line/30 text-ink';
  return (
    <div className={`rounded-xl border p-2.5 backdrop-blur-xl ${cls}`}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className="mt-0.5 text-xs font-bold truncate">{value}</div>
    </div>
  );
}
