// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Premium mobile UI for an active chat thread. Features responsive bubbles, image/file attachments, auto-scroll, and system events.

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  Paperclip,
  FileText,
  Clock,
  ExternalLink,
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
  const { messages, loadingMessages, error, sendTextMessage, sendFileAttachment } = useChat(threadId);

  const [threadMeta, setThreadMeta] = useState(null);
  const [inputText, setInputText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

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
          });
        } else if (isStation) {
          const matchStation = stations.find((s) => s.id === t.station_id);
          setThreadMeta({
            title: t.title ?? matchStation?.name ?? 'Чат АЗС',
            subtitle: 'Групповой чат АЗС',
            avatar: null,
          });
        } else if (isOrg) {
          setThreadMeta({
            title: t.title ?? 'Общий чат компании',
            subtitle: 'Вся организация',
            avatar: null,
          });
        } else {
          setThreadMeta({
            title: t.title ?? 'Рабочий диалог',
            subtitle: 'Чат по объекту',
            avatar: null,
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

  // Send Actions
  async function handleSend(e) {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText('');
    setLocalErr('');
    try {
      await sendTextMessage(text);
      scrollToBottom();
    } catch {
      setInputText(text); // Restore text on fail
      setLocalErr('Не удалось отправить сообщение.');
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setLocalErr('');
    try {
      await sendFileAttachment(file);
      scrollToBottom();
    } catch {
      setLocalErr('Ошибка загрузки файла.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
          messages.map((m) => {
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
                    {/* Render Image Attachments */}
                    {m.message_type === 'image' && m.attachments?.[0]?.file_url && (
                      <div className="mb-2 rounded-xl overflow-hidden border border-line/20 bg-black/10">
                        <img
                          src={m.attachments[0].file_url}
                          alt="Вложение"
                          className="max-h-60 w-full object-cover"
                        />
                      </div>
                    )}

                    {/* Render File Attachments */}
                    {m.message_type === 'file' && m.attachments?.[0]?.file_url && (
                      <a
                        href={m.attachments[0].file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-2 p-3 rounded-xl border border-line/20 bg-bg-elevated/40 flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted hover:text-ink hover:bg-bg-elevated transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-brand-400 flex-shrink-0" />
                          <span className="truncate">{m.attachments[0].file_name ?? 'Файл'}</span>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />
                      </a>
                    )}

                    <div className="whitespace-pre-wrap break-words font-sans">{m.message}</div>

                    {/* Timestamp inside bubble */}
                    <div
                      className={`text-[9px] font-mono mt-1.5 flex items-center justify-end gap-1 ${
                        isMe ? 'text-white/60' : 'text-ink-soft'
                      }`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Input controls Panel */}
      <footer className="glass-premium border-t border-line/50 p-3.5 relative z-10 flex-shrink-0 safe-bottom">
        {localErr && (
          <div className="text-[11px] text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-1.5 mb-2 text-center font-bold">
            {localErr}
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2">
          {/* File attach button */}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-12 h-12 rounded-2xl border border-line/50 bg-bg-card/40 flex items-center justify-center text-ink-muted hover:text-ink active:scale-95 transition-all hover:bg-bg-card/80 disabled:opacity-55"
            aria-label="Прикрепить файл"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Text Input area */}
          <input
            type="text"
            placeholder="Ваше сообщение..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={uploading}
            className="flex-1 h-12 px-4 rounded-2xl bg-bg-elevated border border-line/45 text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand-500/50 transition-colors text-sm font-sans"
          />

          {/* Send Button */}
          <Button
            type="submit"
            disabled={!inputText.trim() || uploading}
            className="w-12 h-12 p-0 rounded-2xl flex items-center justify-center flex-shrink-0"
          >
            <Send className="w-4.5 h-4.5" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
