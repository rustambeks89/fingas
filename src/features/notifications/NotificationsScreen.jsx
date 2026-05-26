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

  // auto-mark all unread mine as read on screen open
  useEffect(() => {
    if (!userId || rows.length === 0) return;
    const unreadIds = rows
      .filter((n) => !n.is_read && n.recipient_user_id === userId)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;
    supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds)
      .then(() => {
        setRows((prev) => prev.map((n) =>
          unreadIds.includes(n.id) ? { ...n, is_read: true } : n
        ));
      });
  }, [rows, userId]);

  async function markAllRead() {
    const unreadIds = rows.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);
    if (!error) {
      setRows((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  }

  async function markAsRead(id) {
    const found = rows.find((n) => n.id === id);
    if (!found || found.is_read) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (!error) {
      setRows((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    }
  }

  const visibleRows = useMemo(() => rows.filter((n) => !n.is_read), [rows]);
  const unread = visibleRows.length;

  return (
    <div>
      <ScreenHeader
        title="Уведомления"
        subtitle={unread > 0 ? `${unread} непрочитанных` : 'Всё прочитано'}
        right={unread > 0 ? (
          <Button size="sm" variant="secondary" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4" /> Всё
          </Button>
        ) : null}
      />

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
            <div className="mt-0.5 text-xs text-ink-muted">{unread} непрочитанных · {rows.length - unread} прочитанных</div>
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
          title={rows.length === 0 ? 'Тихо' : 'Всё прочитано'}
          description={rows.length === 0
            ? 'Новых уведомлений нет. Сюда придут события: новая заявка, закрытая смена, инкассация на подтверждение.'
            : 'Непрочитанных уведомлений нет. Прочитанные уведомления скрыты из списка.'}
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
              transition={{ delay: i * 0.02 }}
              onClick={() => markAsRead(n.id)}
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
