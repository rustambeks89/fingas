// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Premium mobile UI for an active chat thread. Features responsive bubbles, image/file attachments, auto-scroll, and system events.

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  Clock,
  Loader2,
  Sparkles,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getThreadById } from '@/services/chatService';
import { ROLE_LABELS } from '@/lib/constants';

export default function ChatThreadScreen() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { stations } = useOrgContext();
  const { messages, loadingMessages, error, sendTextMessage, editMessage, deleteMessage } = useChat(threadId);

  const [threadMeta, setThreadMeta] = useState(null);
  const [inputText, setInputText] = useState('');
  const [localErr, setLocalErr] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);

  const scrollRef = useRef(null);

  // Load thread meta-details (name, type, etc.)
  useEffect(() => {
    if (!threadId) return;
    getThreadById(threadId)
      .then((t) => {
        const isDirect = t.type === 'direct';
        const isStation = t.type === 'station';
        const isOrg = t.type === 'organization';

        if (isDirect) {
          const otherPart = t.participants?.find((p) => p.user_id !== user?.id);
          const name = otherPart?.user?.full_name ?? otherPart?.user?.email ?? 'Сотрудник';
          setThreadMeta({
            title: name,
            subtitle: otherPart?.user?.role ? ROLE_LABELS[otherPart.user.role] : 'Личный чат',
            avatar: otherPart?.user?.avatar_url,
            participants: t.participants,
          });
        } else if (isStation) {
          const matchStation = stations.find((s) => s.id === t.station_id);
          setThreadMeta({
            title: t.title ?? matchStation?.name ?? 'Чат АЗС',
            subtitle: 'Групповой чат АЗС',
            avatar: null,
            participants: t.participants,
          });
        } else if (isOrg) {
          setThreadMeta({
            title: t.title ?? 'Общий чат компании',
            subtitle: 'Вся организация',
            avatar: null,
            participants: t.participants,
          });
        } else {
          setThreadMeta({
            title: t.title ?? 'Рабочий диалог',
            subtitle: 'Чат по объекту',
            avatar: null,
            participants: t.participants,
          });
        }
      })
      .catch(() => setThreadMeta(null));
  }, [threadId, user?.id, stations]);

  // Autoscroll to bottom
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loadingMessages]);

  // Group messages by day
  const groupMessagesByDate = (msgList) => {
    const groups = {};
    msgList.forEach((m) => {
      const date = new Date(m.created_at);
      const dateStr = date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      
      let label = dateStr;
      if (date.toDateString() === today.toDateString()) {
        label = 'Сегодня';
      } else if (date.toDateString() === yesterday.toDateString()) {
        label = 'Вчера';
      }
      
      if (!groups[label]) groups[label] = [];
      groups[label].push(m);
    });
    return groups;
  };

  // Check if message was not read by other participants yet
  const isMessageUnread = (msg) => {
    if (!threadMeta?.participants) return false;
    const otherParts = threadMeta.participants.filter((p) => p.user_id !== user?.id);
    if (otherParts.length === 0) return false;
    return otherParts.some((p) => !p.last_read_at || new Date(p.last_read_at) < new Date(msg.created_at));
  };

  const canEditOrDelete = (msg) => {
    if (msg.sender_id !== user?.id) return false;
    if (msg.message_type === 'system') return false;
    return isMessageUnread(msg);
  };

  // Send Actions
  async function handleSend(e) {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText('');
    setLocalErr('');
    try {
      if (editingMessage) {
        await editMessage(editingMessage.id, text);
        setEditingMessage(null);
      } else {
        await sendTextMessage(text);
      }
      scrollToBottom();
    } catch {
      setInputText(text); // Restore text on fail
      setLocalErr(editingMessage ? 'Не удалось изменить сообщение.' : 'Не удалось отправить сообщение.');
    }
  }

  async function handleDeleteMessage(msgId) {
    try {
      await deleteMessage(msgId);
    } catch {
      setLocalErr('Не удалось удалить сообщение.');
    }
  }

  function startEditing(msg) {
    setEditingMessage(msg);
    setInputText(msg.message);
  }

  return (
    <div className="fixed inset-0 bg-bg z-40 flex flex-col pt-safe-top pb-safe-bottom">
      {/* Sticky Thread Header */}
      <header className="glass-premium border-b border-line/50 px-4 py-3 flex items-center justify-between gap-3 relative z-10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/more/chat')}
            className="w-10 h-10 rounded-2xl border border-line/50 bg-bg-card/40 flex items-center justify-center text-ink-muted hover:text-ink active:scale-95 transition-transform"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          {threadMeta?.avatar ? (
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-line/40 flex-shrink-0">
              <img src={threadMeta.avatar} alt="" className="w-full h-full object-cover" />
            </div>
          ) : null}

          <div className="min-w-0">
            <div className="font-bold text-sm text-ink truncate font-display">
              {threadMeta?.title ?? 'Загрузка...'}
            </div>
            <div className="text-[10px] text-ink-soft truncate font-sans tracking-wide">
              {threadMeta?.subtitle ?? 'соединение...'}
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate(`/more/chat/${threadId}/settings`)}
          className="w-10 h-10 rounded-2xl border border-line/50 bg-bg-card/40 flex items-center justify-center text-ink-muted hover:text-ink active:scale-95 transition-transform flex-shrink-0"
          aria-label="Настройки чата"
        >
          <Settings className="w-4.5 h-4.5" />
        </button>
      </header>

      <div className="px-4 pt-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[2rem] p-4 border border-brand-500/25 bg-gradient-to-br from-brand-500/16 via-brand-500/5 to-bg-soft"
        >
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft">Диалог</div>
              <div className="mt-1 text-base font-bold text-ink truncate">{threadMeta?.title ?? 'Загрузка...'}</div>
              <div className="text-xs text-ink-muted truncate">{threadMeta?.subtitle ?? 'соединение...'}</div>
            </div>
            <Badge tone="default">{messages.length}</Badge>
          </div>
        </motion.div>
      </div>

      {/* Messages Scroll Area */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth no-scrollbar"
      >
        {loadingMessages ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            <span className="text-xs text-ink-soft">Загрузка переписки...</span>
          </div>
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-2xl p-4 text-xs text-center">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Здесь начнется диалог"
            description="Отправьте первое сообщение, чтобы начать общение с коллегами."
          />
        ) : (
          Object.entries(groupMessagesByDate(messages)).map(([dateLabel, groupMsgs]) => (
            <div key={dateLabel} className="space-y-4">
              <div className="flex justify-center my-4">
                <span className="bg-bg-soft/80 border border-line/45 rounded-full px-3.5 py-1 text-[10px] font-bold text-ink-soft uppercase tracking-wider font-sans">
                  {dateLabel}
                </span>
              </div>
              
              {groupMsgs.map((m) => {
                const isMe = m.sender_id === user?.id;
                const isSystem = m.message_type === 'system';

                if (isSystem) {
                  return (
                    <div key={m.id} className="flex justify-center my-2">
                      <div className="bg-bg-soft/70 border border-line/40 rounded-2xl px-4 py-2 text-center text-xs text-ink-soft max-w-[85%] leading-relaxed flex items-start gap-1.5 font-sans">
                        <Sparkles className="w-3.5 h-3.5 text-brand-400 mt-0.5 flex-shrink-0" />
                        <span>{m.message}</span>
                      </div>
                    </div>
                  );
                }

                const editable = canEditOrDelete(m);

                return (
                  <div key={m.id} className={`flex gap-2.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {/* Sender Avatar for group chats */}
                    {!isMe && m.sender?.avatar_url && (
                      <div className="w-8 h-8 rounded-lg overflow-hidden border border-line/40 flex-shrink-0 self-end mb-1">
                        <img src={m.sender.avatar_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className="max-w-[78%] flex flex-col">
                      {/* Sender Name for group chats */}
                      {!isMe && m.sender?.full_name && (
                        <span className="text-[10px] font-bold text-ink-soft mb-1 pl-1 font-display">
                          {m.sender.full_name} ({ROLE_LABELS[m.sender.role] || m.sender.role})
                        </span>
                      )}

                      {/* Message Bubble */}
                      <div
                        className={`rounded-[1.5rem] px-4 py-3 text-sm leading-relaxed ${
                          isMe
                            ? 'bg-gradient-to-b from-brand-500 to-brand-600 text-white rounded-br-none shadow-[0_4px_16px_-4px_rgba(34,197,94,0.22)] border border-brand-500/20'
                            : 'bg-bg-card border border-line/45 text-ink rounded-bl-none shadow-card'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words font-sans">{m.message}</div>

                        {/* Timestamp inside bubble */}
                        <div
                          className={`text-[9px] font-mono mt-1.5 flex items-center justify-end gap-1 ${
                            isMe ? 'text-white/60' : 'text-ink-soft'
                          }`}
                        >
                          {m.edited && <span className="text-[8px] uppercase tracking-wider opacity-85 mr-1 font-bold">Изменено</span>}
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>

                      {/* Inline Actions (Edit/Delete) for sent unread messages */}
                      {editable && (
                        <div className="flex items-center justify-end gap-3 mt-1.5 px-1.5 text-[10px] font-bold text-brand-500">
                          <button
                            type="button"
                            onClick={() => startEditing(m)}
                            className="hover:underline cursor-pointer active:scale-95 transition-transform"
                          >
                            Изменить
                          </button>
                          <span className="text-line/60">•</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(m.id)}
                            className="text-danger hover:underline cursor-pointer active:scale-95 transition-transform"
                          >
                            Удалить
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </main>

      {/* Input controls Panel */}
      <footer className="glass-premium border-t border-line/50 p-3.5 relative z-10 flex-shrink-0 safe-bottom">
        {localErr && (
          <div className="text-[11px] text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-1.5 mb-2 text-center font-bold">
            {localErr}
          </div>
        )}

        {/* Editing indicator banner */}
        {editingMessage && (
          <div className="flex items-center justify-between bg-brand-500/10 border-l-2 border-brand-500 px-3.5 py-2 mb-2 rounded-r-xl text-xs">
            <span className="text-ink-muted truncate">Редактирование: "{editingMessage.message}"</span>
            <button
              type="button"
              onClick={() => {
                setEditingMessage(null);
                setInputText('');
              }}
              className="text-brand-500 font-bold hover:underline ml-2"
            >
              Отмена
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2">
          {/* Text Input area */}
          <input
            type="text"
            placeholder="Ваше сообщение..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 h-12 px-4 rounded-2xl bg-bg-elevated border border-line/45 text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand-500/50 transition-colors text-sm font-sans"
          />

          {/* Send Button */}
          <Button
            type="submit"
            disabled={!inputText.trim()}
            className="w-12 h-12 p-0 rounded-2xl flex items-center justify-center flex-shrink-0"
          >
            <Send className="w-4.5 h-4.5" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
