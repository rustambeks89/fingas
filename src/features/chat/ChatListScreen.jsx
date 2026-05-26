// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Premium mobile UI listing all chat threads (direct, station, organization) with unread count overlays and filter controls.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Search,
  Users,
  Building2,
  MapPin,
  ClipboardList,
  Plus,
  Clock,
  ChevronRight,
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
      // Find the other participant
      const otherPart = t.participants?.find((p) => p.user_id !== user?.id);
      const name = otherPart?.user?.full_name ?? otherPart?.user?.email ?? 'Сотрудник';
      const avatar = otherPart?.user?.avatar_url;
      const roleText = otherPart?.user?.role ? ROLE_LABELS[otherPart.user.role] : '';
      return {
        title: name,
        subtitle: roleText || 'Личный чат',
        avatar,
        icon: Users,
        iconColor: 'text-brand-500 bg-brand-500/10 border-brand-500/20',
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

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between">
        <ScreenHeader title="Чат команды" subtitle="Внутренняя переписка и координация" />
        <Button
          size="sm"
          className="h-10 w-10 p-0 rounded-2xl flex items-center justify-center"
          onClick={() => navigate('/more/new-chat')}
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Переписка</div>
          <div className="mt-1 text-xl font-bold text-ink">{filtered.length}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{threads.length} тредов · {loading ? 'загрузка' : 'готово'}</div>
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <MiniCard label="Личные" value={threads.filter((t) => t.type === 'direct').length} />
            <MiniCard label="АЗС" value={threads.filter((t) => t.type === 'station').length} />
            <MiniCard label="Компания" value={threads.filter((t) => t.type === 'organization').length} />
          </div>
        </div>
      </motion.div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-ink-soft" />
        <input
          type="text"
          placeholder="Поиск диалога или сотрудника..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full h-13 pl-11 pr-4 rounded-2xl bg-bg-card border border-line/45 text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand-500/50 transition-colors"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-bg-soft/80 border border-line/35 p-1 rounded-2xl gap-1 mb-4 overflow-x-auto no-scrollbar">
        {[
          { id: 'all', label: 'Все' },
          { id: 'direct', label: 'Личные' },
          { id: 'station', label: 'АЗС' },
          { id: 'organization', label: 'Компания' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              filter === tab.id
                ? 'text-ink bg-bg-card shadow-card scale-[1.01]'
                : 'text-ink-soft hover:text-ink active:scale-95'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Thread list container */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-[2rem] bg-bg-card border border-line/30 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-2xl p-4 text-sm">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={searchQuery ? 'Диалоги не найдены' : 'Сообщений пока нет'}
            description={
              searchQuery
                ? 'Попробуйте изменить запрос поиска.'
                : 'Начните личный чат с сотрудником или напишите в общий чат АЗС!'
            }
          />
        ) : (
          <AnimatePresence mode="wait">
            {filtered.map((t, idx) => {
              const meta = getThreadMeta(t);
              const me = t.participants?.find((p) => p.user_id === user?.id);
              const isUnread =
                t.last_message_at &&
                (!me?.last_read_at || new Date(t.last_message_at) > new Date(me.last_read_at));

              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  <Card
                    hoverable
                    onClick={() => navigate(`/more/chat/${t.id}`)}
                    className={`flex items-center gap-3.5 p-4 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl ${
                      isUnread ? 'border border-brand-500/25 bg-brand-500/2' : ''
                    }`}
                  >
                    {/* Icon / Avatar Slot */}
                    <div className="relative flex-shrink-0">
                      {meta.avatar ? (
                        <div className="w-12 h-12 rounded-2xl overflow-hidden border border-line/50">
                          <img src={meta.avatar} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${meta.iconColor}`}>
                          <meta.icon className="w-5.5 h-5.5" />
                        </div>
                      )}
                      {isUnread && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-500 border border-bg-card shadow-glow animate-pulse" />
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-sm text-ink truncate font-display">{meta.title}</div>
                        {t.last_message_at && (
                          <div className="text-[10px] text-ink-soft flex items-center gap-0.5 whitespace-nowrap font-mono">
                            <Clock className="w-3 h-3" />
                            {new Date(t.last_message_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-ink-soft truncate font-sans mt-0.5">{meta.subtitle}</div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-ink-soft flex-shrink-0" />
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function MiniCard({ label, value }) {
  return (
    <div className="rounded-xl bg-bg-card/75 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className="mt-0.5 text-xs font-bold text-ink truncate">{value}</div>
    </div>
  );
}
