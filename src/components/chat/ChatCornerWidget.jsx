// [CREATED BY CODEX - 2026-05-25]
// Purpose: Small floating chat entry in the screen corner. It opens a compact
// window with recent conversations instead of duplicating the main menu.

import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquare, ArrowRight, Clock, Search, X } from 'lucide-react';
import { BottomSheet } from '@/components/bottom-sheets/BottomSheet';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useChat } from '@/hooks/useChat';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_LABELS } from '@/lib/constants';
import { formatRelative } from '@/lib/formatters';

export function ChatCornerWidget() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { threads, loading } = useChat();
  const { unreadCount } = useUnreadMessages();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const hidden = location.pathname.startsWith('/more/chat');
  const recent = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (threads ?? []).filter((thread) => {
      const meta = getThreadMeta(thread, user?.id);
      if (!normalized) return true;
      return `${meta.title} ${meta.subtitle}`.toLowerCase().includes(normalized);
    }).slice(0, 10);
  }, [threads, query, user?.id]);

  if (hidden) return null;

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-24 z-40 w-14 h-14 rounded-full bg-brand-500 text-white shadow-[0_12px_32px_-8px_rgba(34,197,94,0.42)] border border-white/10 flex items-center justify-center"
        aria-label="Открыть чат"
      >
        <MessageSquare className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-bg text-ink text-[10px] font-bold flex items-center justify-center border border-line">
            {unreadCount}
          </span>
        )}
      </motion.button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Чат"
      >
        <div className="space-y-4">
          <div className="rounded-[1.4rem] bg-bg-card/75 border border-line/70 p-3 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-soft">
              <Clock className="w-3.5 h-3.5 text-brand-500" />
              Переписка
            </div>
            <div className="mt-1 text-sm text-ink-muted">
              {unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Нет новых сообщений'}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск переписки"
              className="pl-11 pr-11"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-ink-soft hover:text-ink flex items-center justify-center"
                aria-label="Очистить поиск"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-2">
            {loading ? (
              <div className="text-sm text-ink-soft py-6 text-center">Загрузка…</div>
            ) : recent.length === 0 ? (
              <div className="text-sm text-ink-soft py-6 text-center">Диалоги не найдены</div>
            ) : (
              recent.map((thread) => {
                const meta = getThreadMeta(thread, user?.id);
                const me = thread.participants?.find((p) => p.user_id === user?.id);
                const isUnread = !!thread.last_message_at && (!me?.last_read_at || new Date(thread.last_message_at) > new Date(me.last_read_at));
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(`/more/chat/${thread.id}`);
                    }}
                    className="w-full text-left rounded-[1.4rem] bg-bg-card/75 border border-line/70 p-3 backdrop-blur-xl flex items-center gap-3 active:scale-[0.98] transition"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-ink truncate">{meta.title}</div>
                        {isUnread && (
                          <Badge tone="brand" className="shrink-0">new</Badge>
                        )}
                      </div>
                      <div className="text-xs text-ink-muted truncate">
                        {meta.subtitle}
                      </div>
                      <div className="text-[11px] text-ink-soft mt-1 truncate">
                        {formatRelative(thread.last_message_at)}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-ink-soft flex-shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

function getThreadMeta(thread, currentUserId) {
  if (!thread) return { title: 'Чат', subtitle: '' };

  if (thread.type === 'direct') {
    const other = thread.participants?.find((p) => p.user_id !== currentUserId)?.user;
    return {
      title: other?.full_name || other?.email || 'Личный чат',
      subtitle: other?.role ? ROLE_LABELS[other.role] ?? other.role : 'Личный чат',
    };
  }

  if (thread.type === 'station') {
    return {
      title: thread.title || 'Чат АЗС',
      subtitle: 'Рабочий чат станции',
    };
  }

  if (thread.type === 'organization') {
    return {
      title: thread.title || 'Общий чат компании',
      subtitle: 'Вся организация',
    };
  }

  return {
    title: thread.title || 'Рабочий диалог',
    subtitle: 'Чат по объекту',
  };
}
