// [CREATED BY ANTIGRAVITY CLI - 2026-05-27]
// Project: Fingas
// Purpose: Premium mobile chat list interface styled exactly like modern WhatsApp
// with contiguous divided rows, circle avatars, real-time message previews, and precise unread badges.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Users,
  Building2,
  MapPin,
  ClipboardList,
  Plus,
  ChevronRight,
  User,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/status/EmptyState';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { ROLE_LABELS } from '@/lib/constants';

export default function ChatListScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { stations } = useOrgContext();
  const { threads, loading, error } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | direct | station | organization

  const getThreadMeta = (t) => {
    const isDirect = t.type === 'direct';
    const isStation = t.type === 'station';
    const isOrg = t.type === 'organization';

    if (isDirect) {
      const otherPart = t.participants?.find((p) => p.user_id !== user?.id);
      const name = otherPart?.user?.full_name ?? otherPart?.user?.email ?? 'Сотрудник';
      const avatar = otherPart?.user?.avatar_url;
      const roleText = otherPart?.user?.role ? ROLE_LABELS[otherPart.user.role] : '';
      return {
        title: name,
        subtitle: roleText || 'Личный чат',
        avatar,
        icon: User,
        iconColor: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
      };
    }

    if (isStation) {
      const matchStation = stations.find((s) => s.id === t.station_id);
      return {
        title: t.title ?? matchStation?.name ?? 'Чат АЗС',
        subtitle: matchStation?.city ? `АЗС · ${matchStation.city}` : 'Рабочий чат АЗС',
        avatar: null,
        icon: MapPin,
        iconColor: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
      };
    }

    if (isOrg) {
      return {
        title: t.title ?? 'Общий чат компании',
        subtitle: 'Вся организация',
        avatar: null,
        icon: Building2,
        iconColor: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      };
    }

    return {
      title: t.title ?? 'Рабочий диалог',
      subtitle: 'Чат по объекту',
      avatar: null,
      icon: ClipboardList,
      iconColor: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    };
  };

  // Filter & Search
  const filtered = threads.filter((t) => {
    const meta = getThreadMeta(t);
    const matchesSearch =
      meta.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meta.subtitle?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filter === 'all') return matchesSearch;
    return t.type === filter && matchesSearch;
  });

  const formatMsgTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      }
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) {
        return 'Вчера';
      }
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const renderMessagePreview = (thread) => {
    const msg = thread.latest_message;
    if (!msg) return <span className="text-ink-soft italic">Сообщений нет. Нажмите, чтобы начать чат</span>;

    const isMe = msg.sender_id === user?.id;
    const prefix = isMe ? 'Вы: ' : '';
    
    if (msg.message_type === 'image') {
      return (
        <span className="flex items-center gap-1 text-brand-400 font-medium">
          <ImageIcon className="w-3.5 h-3.5" /> {prefix}Фотография
        </span>
      );
    }
    if (msg.message_type === 'file') {
      return (
        <span className="flex items-center gap-1 text-brand-400 font-medium">
          <FileText className="w-3.5 h-3.5" /> {prefix}Документ / Файл
        </span>
      );
    }
    if (msg.message_type === 'system') {
      return <span className="text-ink-soft italic">{msg.message}</span>;
    }
    return <span>{prefix}{msg.message}</span>;
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <ScreenHeader title="Чаты" subtitle="Команда · координация" />
        <Button
          size="sm"
          className="h-9 w-9 p-0 rounded-xl flex items-center justify-center bg-brand-500 text-white shadow-glow"
          onClick={() => navigate('/more/new-chat')}
          aria-label="Новый чат"
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft" />
        <input
          type="text"
          placeholder="Поиск чата или коллеги..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full h-10.5 pl-10 pr-4 rounded-xl bg-bg-card border border-line/40 text-ink text-sm placeholder:text-ink-soft focus:outline-none focus:border-brand-500/50 transition-colors"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-bg-elevated/40 border border-line/30 p-0.5 rounded-xl gap-0.5 mb-3 overflow-x-auto no-scrollbar">
        {[
          { id: 'all', label: 'Все' },
          { id: 'direct', label: 'Личные' },
          { id: 'station', label: 'АЗС' },
          { id: 'organization', label: 'Компания' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
              filter === tab.id
                ? 'text-white bg-brand-500 shadow-sm'
                : 'text-ink-soft hover:text-ink active:scale-95'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Thread list container */}
      <Card className="!p-0.5 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-line/20">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 px-3 flex items-center gap-3 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-bg-elevated" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-bg-elevated rounded w-1/3" />
                  <div className="h-3 bg-bg-elevated rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-4 text-xs text-center m-2">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
              title={searchQuery ? 'Чаты не найдены' : 'Диалогов пока нет'}
              description={
                searchQuery
                  ? 'Попробуйте изменить поисковый запрос.'
                  : 'Нажмите кнопку «+» сверху, чтобы открыть диалог с коллегами.'
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line/25">
            <AnimatePresence mode="wait">
              {filtered.map((t, idx) => {
                const meta = getThreadMeta(t);
                const me = t.participants?.find((p) => p.user_id === user?.id);
                const isUnread =
                  t.last_message_at &&
                  (!me?.last_read_at || new Date(t.last_message_at) > new Date(me.last_read_at));

                return (
                  <motion.li
                    key={t.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.015 }}
                  >
                    <button
                      onClick={() => navigate(`/more/chat/${t.id}`)}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-bg-elevated/40 active:bg-bg-elevated/60 transition-colors relative cursor-pointer ${
                        isUnread ? 'bg-brand-500/[0.015]' : ''
                      }`}
                    >
                      {/* Avatar Slot */}
                      <div className="relative flex-shrink-0">
                        {meta.avatar ? (
                          <div className="w-11 h-11 rounded-full overflow-hidden border border-line/45">
                            <img src={meta.avatar} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className={`w-11 h-11 rounded-full border flex items-center justify-center ${meta.iconColor}`}>
                            <meta.icon className="w-5 h-5" />
                          </div>
                        )}
                        {isUnread && (
                          <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-brand-500 border border-bg-card shadow-glow animate-pulse" />
                        )}
                      </div>

                      {/* Meta & Last Message Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className={`text-sm font-bold truncate font-display ${isUnread ? 'text-ink' : 'text-ink'}`}>
                            {meta.title}
                          </div>
                          {t.last_message_at && (
                            <div className={`text-[10px] whitespace-nowrap font-sans ${isUnread ? 'text-brand-400 font-bold' : 'text-ink-soft'}`}>
                              {formatMsgTime(t.last_message_at)}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <div className={`text-xs truncate flex-1 leading-normal ${isUnread ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
                            {renderMessagePreview(t)}
                          </div>
                          {isUnread && t.unread_count > 0 && (
                            <span className="bg-brand-500 text-white font-mono text-[9px] font-black h-4.5 min-w-4.5 px-1 rounded-full flex items-center justify-center shadow-glow shrink-0">
                              {t.unread_count}
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </Card>
    </div>
  );
}
