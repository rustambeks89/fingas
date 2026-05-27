// [CREATED BY ANTIGRAVITY CLI - 2026-05-27]
// Project: Fingas
// Purpose: Premium WhatsApp-style conversation screen featuring circular headers,
// tail-shaped message bubbles, real-time single/double status ticks, and a sleek bottom pill input box.

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  Loader2,
  Sparkles,
  Settings,
  User,
  Check,
  CheckCheck,
} from 'lucide-react';
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

  // Load thread details (avatar, direct participant, station)
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

  // Scroll to bottom helper
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

  // Check read status for ticks
  const isMessageUnread = (msg) => {
    if (!threadMeta?.participants) return true;
    const otherParts = threadMeta.participants.filter((p) => p.user_id !== user?.id);
    if (otherParts.length === 0) return false;
    // Unread if any other active participant has not read it yet
    return otherParts.some((p) => !p.last_read_at || new Date(p.last_read_at) < new Date(msg.created_at));
  };

  const canEditOrDelete = (msg) => {
    if (msg.sender_id !== user?.id) return false;
    if (msg.message_type === 'system') return false;
    return isMessageUnread(msg);
  };

  // Actions
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
      setInputText(text); // Restore
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
      {/* WhatsApp Circular Header */}
      <header className="glass-premium border-b border-line/40 px-3.5 py-2.5 flex items-center justify-between gap-3 relative z-10 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate('/more/chat')}
            className="w-9 h-9 rounded-full border border-line/50 bg-bg-card/40 flex items-center justify-center text-ink-muted hover:text-ink active:scale-95 transition-transform"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          {threadMeta?.avatar ? (
            <div className="w-10 h-10 rounded-full overflow-hidden border border-line/45 flex-shrink-0">
              <img src={threadMeta.avatar} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0 font-bold text-sm">
              {threadMeta?.title?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
            </div>
          )}

          <div className="min-w-0">
            <div className="font-bold text-sm text-ink truncate font-display">
              {threadMeta?.title ?? 'Загрузка...'}
            </div>
            <div className="text-[10px] text-ink-soft truncate font-sans font-medium tracking-wide">
              {threadMeta?.subtitle ?? 'соединение...'}
            </div>
          </div>
        </div>
        
        <button
          onClick={() => navigate(`/more/chat/${threadId}/settings`)}
          className="w-9 h-9 rounded-full border border-line/50 bg-bg-card/40 flex items-center justify-center text-ink-muted hover:text-ink active:scale-95 transition-transform flex-shrink-0"
          aria-label="Настройки чата"
        >
          <Settings className="w-4.5 h-4.5" />
        </button>
      </header>

      {/* Messages Feed */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3.5 scroll-smooth no-scrollbar bg-gradient-to-b from-bg/40 to-bg-soft/20"
      >
        {loadingMessages ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            <span className="text-xs text-ink-soft">Загрузка переписки...</span>
          </div>
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-4 text-xs text-center">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Начало переписки"
            description="Отправьте первое сообщение в чат, чтобы начать общение с командой."
          />
        ) : (
          Object.entries(groupMessagesByDate(messages)).map(([dateLabel, groupMsgs]) => (
            <div key={dateLabel} className="space-y-3">
              {/* Date Group Header */}
              <div className="flex justify-center my-3 select-none">
                <span className="bg-bg-elevated/70 border border-line/40 rounded-xl px-3.5 py-0.5 text-[9px] font-black text-ink-soft uppercase tracking-wider">
                  {dateLabel}
                </span>
              </div>
              
              {groupMsgs.map((m) => {
                const isMe = m.sender_id === user?.id;
                const isSystem = m.message_type === 'system';

                if (isSystem) {
                  return (
                    <div key={m.id} className="flex justify-center my-2.5">
                      <div className="bg-bg-soft/70 border border-line/40 rounded-xl px-4 py-1.5 text-center text-xs text-ink-soft max-w-[85%] leading-relaxed flex items-start justify-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand-400 mt-0.5 flex-shrink-0" />
                        <span>{m.message}</span>
                      </div>
                    </div>
                  );
                }

                const unread = isMessageUnread(m);
                const editable = canEditOrDelete(m);

                return (
                  <div key={m.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {/* Circle Avatar for Group Chats */}
                    {!isMe && (
                      <div className="w-7 h-7 rounded-full overflow-hidden border border-line/45 flex-shrink-0 self-end mb-0.5">
                        {m.sender?.avatar_url ? (
                          <img src={m.sender.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-brand-500/10 text-brand-400 flex items-center justify-center font-bold text-[10px]">
                            {m.sender?.full_name?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="max-w-[78%] flex flex-col">
                      {/* Sender Details */}
                      {!isMe && m.sender?.full_name && (
                        <span className="text-[10px] font-black text-ink-soft mb-1 pl-1 truncate">
                          {m.sender.full_name} · <span className="text-[9px] uppercase tracking-wider">{ROLE_LABELS[m.sender.role] || m.sender.role}</span>
                        </span>
                      )}

                      {/* WhatsApp Tail Bubble */}
                      <div
                        className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          isMe
                            ? 'bg-gradient-to-tr from-brand-600/90 to-brand-500/90 text-white rounded-tr-none shadow-sm border border-brand-400/20'
                            : 'bg-bg-card border border-line/45 text-ink rounded-tl-none shadow-sm'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words font-sans selection:bg-brand-500/35">{m.message}</div>

                        {/* Status ticks and Time info inside bubble */}
                        <div
                          className={`text-[8.5px] mt-1 flex items-center justify-end gap-1.5 font-sans ${
                            isMe ? 'text-white/70' : 'text-ink-soft'
                          }`}
                        >
                          {m.edited && <span className="text-[7.5px] uppercase tracking-wider font-bold mr-0.5">Изменено</span>}
                          
                          <span className="font-mono">
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>

                          {/* WhatsApp Ticks Status */}
                          {isMe && (
                            <span className="shrink-0 flex items-center">
                              {unread ? (
                                <Check className="w-3.5 h-3.5 text-white/50" />
                              ) : (
                                <CheckCheck className="w-3.5 h-3.5 text-blue-300 drop-shadow-glow" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Inline Actions */}
                      {editable && (
                        <div className="flex items-center justify-end gap-2.5 mt-1 px-1.5 text-[9px] font-black text-brand-500 uppercase tracking-wider">
                          <button
                            type="button"
                            onClick={() => startEditing(m)}
                            className="hover:underline cursor-pointer active:scale-95 transition-transform"
                          >
                            Изменить
                          </button>
                          <span className="text-line/40 select-none">•</span>
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

      {/* WhatsApp Pill Input Footer */}
      <footer className="glass-premium border-t border-line/45 p-3 relative z-10 flex-shrink-0 safe-bottom">
        {localErr && (
          <div className="text-[10px] text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-1.5 mb-2 text-center font-bold uppercase tracking-wider">
            {localErr}
          </div>
        )}

        {/* Editing indicator */}
        {editingMessage && (
          <div className="flex items-center justify-between bg-brand-500/10 border-l-2 border-brand-500 px-3 py-1.5 mb-2 rounded-r-xl text-xs">
            <span className="text-ink-muted truncate">Редактирование: "{editingMessage.message}"</span>
            <button
              type="button"
              onClick={() => {
                setEditingMessage(null);
                setInputText('');
              }}
              className="text-brand-500 font-extrabold hover:underline ml-2"
            >
              Отмена
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2 max-w-screen-sm mx-auto">
          {/* Pill Container */}
          <div className="flex-1 flex items-center bg-bg-elevated border border-line/45 rounded-full h-11 px-4 focus-within:border-brand-500/40 transition-colors shadow-inner">
            <input
              type="text"
              placeholder="Сообщение..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-transparent border-none text-ink placeholder:text-ink-soft focus:outline-none text-sm font-sans h-full min-w-0"
            />
          </div>

          {/* Circular Button */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              inputText.trim()
                ? 'bg-brand-500 text-white shadow-glow active:scale-90 cursor-pointer'
                : 'bg-bg-elevated text-ink-soft border border-line/45 cursor-not-allowed'
            }`}
            aria-label="Отправить"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>
    </div>
  );
}
