// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Premium dashboard chat widget - Displays unread message counts,
// latest message preview, and quick navigation. Updates in real-time.

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowRight, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { getLatestChatMessage } from '@/services/chatService';
import { hasPermission, isOwner } from '@/lib/permissions';
import { MODULES } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { supabase } from '@/lib/supabaseClient';

export default function DashboardChatCard() {
  const { user } = useAuth();
  const { unreadCount, refreshCount } = useUnreadMessages();
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);

  const owner = isOwner(user);
  const canView = owner || hasPermission(user, MODULES.CHAT, 'can_view');

  const fetchLatest = useCallback(async () => {
    if (!canView) return;
    try {
      const data = await getLatestChatMessage();
      setLatest(data);
    } catch (e) {
      console.error('[Fingas DashboardChatCard] Error fetching latest msg', e);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    fetchLatest();
  }, [canView, fetchLatest]);

  // Real-time subscription to trigger card updates immediately
  useEffect(() => {
    if (!canView || !user?.profile?.organization_id) return;

    const orgId = user.profile.organization_id;

    const channel = supabase
      .channel(`dashboard_chat_widget_${Math.random().toString(36).substring(2, 9)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          fetchLatest();
          refreshCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canView, user?.profile?.organization_id, fetchLatest, refreshCount]);

  if (!canView) return null;

  const formatMsgTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const getThreadTitle = (thread) => {
    if (!thread) return '';
    if (thread.type === 'organization') return 'Общий чат организации';
    if (thread.type === 'station') return thread.title || 'Чат АЗС';
    if (thread.type === 'object') return thread.title || 'Чат по операции';
    
    // For direct thread, title is other user's name
    const otherPart = thread.participants?.find(p => p.user_id !== user.id);
    return otherPart?.user?.full_name || 'Личный чат';
  };

  return (
    <Card hoverable className="p-5 border border-line/45 hover:border-brand-500/20 transition-all duration-300">
      <Link to="/more/chat" className="block">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-muted font-semibold">Чат команды</div>
              <div className="text-sm font-bold text-ink mt-0.5">Внутренний мессенджер</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              {unreadCount > 0 ? (
                <motion.span
                  key="unread"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="bg-brand-500 text-white font-mono text-[10px] font-black h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center shadow-glow"
                >
                  {unreadCount}
                </motion.span>
              ) : (
                <motion.span
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  className="text-xs text-ink-muted"
                >
                  Новых нет
                </motion.span>
              )}
            </AnimatePresence>
            <ArrowRight className="w-4 h-4 text-ink-muted animate-pulse" />
          </div>
        </div>

        {/* CONTENT PREVIEW */}
        <div className="mt-4 pt-3.5 border-t border-line/30">
          {loading ? (
            <div className="h-10 flex items-center justify-center">
              <div className="text-xs text-ink-muted animate-pulse">Загрузка последних сообщений...</div>
            </div>
          ) : latest ? (
            <div className="flex items-start gap-3">
              {/* Sender Avatar */}
              <div className="w-8 h-8 rounded-xl bg-bg-elevated border border-line flex items-center justify-center overflow-hidden shrink-0 mt-0.5">
                {latest.message.sender?.avatar_url ? (
                  <img src={latest.message.sender.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-ink-muted" />
                )}
              </div>

              {/* Message Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink truncate">
                    {latest.message.sender?.full_name || 'Сотрудник'}
                  </span>
                  <span className="text-[10px] text-ink-muted shrink-0">
                    {formatMsgTime(latest.message.created_at)}
                  </span>
                </div>
                <div className="text-xs text-brand-400 font-medium truncate mt-0.5">
                  {getThreadTitle(latest.thread)}
                </div>
                <p className="text-xs text-ink-soft truncate mt-1">
                  {latest.message.message_type === 'image' && '📷 Фотография'}
                  {latest.message.message_type === 'file' && '📁 Документ / Файл'}
                  {latest.message.message_type === 'system' && `📢 ${latest.message.message}`}
                  {latest.message.message_type === 'text' && latest.message.message}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-1">
              <div className="text-xs text-ink-soft">Новых сообщений нет.</div>
              <div className="text-[10px] text-ink-muted mt-0.5">
                Нажмите, чтобы создать чат с коллегами.
              </div>
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}
