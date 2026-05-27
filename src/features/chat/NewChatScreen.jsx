// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Premium mobile UI to select an employee and create/open a direct personal chat thread, gating list by active user role rules.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus,
  ArrowLeft,
  Search,
  MessageCircle,
  Users,
  Building2,
  MapPin,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/status/EmptyState';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useAuth } from '@/hooks/useAuth';
import { createDirectThread, createOrganizationThread, createStationThread } from '@/services/chatService';
import { listEmployees } from '@/services/profileService';
import { ROLE_LABELS, ROLES } from '@/lib/constants';

export default function NewChatScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organizationId, stationId, stations } = useOrgContext();

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  // Fetch employees and filter by role permissions
  useEffect(() => {
    if (!organizationId) return;

    setLoading(true);
    setErr('');
    listEmployees({ organizationId, status: 'active' })
      .then((list) => {
        const myRole = user?.profile?.role;
        const myStationId = user?.profile?.station_id;

        const normalized = (list ?? []).filter((e) => {
          // Исключаем себя из списка получателей
          if (e.user_id === user?.id) return false;

          // Владелец организации видит всех
          if (myRole === ROLES.OWNER) return true;

          // Любой сотрудник может написать владельцу (руководству)
          if (e.role === ROLES.OWNER) return true;

          // Сотрудники видят только коллег со своей АЗС
          if (myStationId && e.station_id === myStationId) return true;

          // Если у текущего пользователя нет привязки к конкретной АЗС (например, центральный бухгалтер), он видит всех
          if (!myStationId) return true;

          return false;
        });
        setEmployees(normalized);
      })
      .catch((e) => {
        console.error('[Fingas NewChatScreen] Error fetching employees', e);
        setErr('Не удалось загрузить список сотрудников.');
      })
      .finally(() => setLoading(false));
  }, [organizationId, stationId, user]);

  // Trigger thread creation
  async function handleCreateChat(targetUserId) {
    setCreating(true);
    setErr('');
    try {
      const threadId = await createDirectThread(targetUserId);
      navigate(`/more/chat/${threadId}`, { replace: true });
    } catch (e) {
      console.error('[Fingas NewChatScreen] Create thread error', e);
      setErr(e?.message ?? 'Не удалось создать диалог с сотрудником.');
      setCreating(false);
    }
  }

  async function handleCreateOrgChat() {
    if (!organizationId) return;
    setCreating(true);
    setErr('');
    try {
      const threadId = await createOrganizationThread(organizationId);
      navigate(`/more/chat/${threadId}`, { replace: true });
    } catch (e) {
      console.error('[Fingas NewChatScreen] Create org thread error', e);
      setErr(e?.message ?? 'Не удалось открыть общий чат компании.');
      setCreating(false);
    }
  }

  async function handleCreateStationChat(stId) {
    if (!stId) return;
    setCreating(true);
    setErr('');
    try {
      const threadId = await createStationThread(stId);
      navigate(`/more/chat/${threadId}`, { replace: true });
    } catch (e) {
      console.error('[Fingas NewChatScreen] Create station thread error', e);
      setErr(e?.message ?? 'Не удалось открыть чат АЗС.');
      setCreating(false);
    }
  }

  const filteredEmployees = employees.filter((e) =>
    e.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedEmployees = useMemo(() => {
    const groups = [
      { key: 'owner', title: 'Владельцы', items: [] },
      { key: 'admin', title: 'Администраторы', items: [] },
      { key: 'other', title: 'Сотрудники', items: [] },
    ];
    for (const e of filteredEmployees) {
      if (e.role === ROLES.OWNER) groups[0].items.push(e);
      else if (e.role === ROLES.ADMIN) groups[1].items.push(e);
      else groups[2].items.push(e);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [filteredEmployees]);

  return (
    <div className="pb-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/more/chat')}
          className="w-10 h-10 rounded-2xl border border-line/50 bg-bg-card/40 flex items-center justify-center text-ink-muted hover:text-ink active:scale-95 transition-transform"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <ScreenHeader title="Новый чат" subtitle="Выберите сотрудника или откройте общий чат" />
      </div>

      {/* General Chats Section */}
      <div className="mb-5 mt-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-brand-500 font-bold px-1.5 mb-2.5">
          Общие чаты
        </div>
        <div className={user?.profile?.role === 'operator' ? 'grid grid-cols-1' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
          {/* Button: Organization Chat */}
          {user?.profile?.role !== 'operator' && (
            <Card
              hoverable
              onClick={handleCreateOrgChat}
              className="flex items-center gap-3.5 p-3.5 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl"
            >
              <div className="w-10 h-10 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-ink truncate">Чат всей компании</div>
                <div className="text-[10px] text-ink-soft truncate mt-0.5">Связаться со всей командой</div>
              </div>
              <MessageCircle className="w-4 h-4 text-brand-400 flex-shrink-0" />
            </Card>
          )}

          {/* Button/Selector: Station Chats */}
          {user?.profile?.role === 'owner' ? (
            <div className="space-y-2">
              <div className="text-[9px] uppercase text-ink-soft font-bold px-1.5 mt-1">Чат конкретной АЗС:</div>
              <div className="grid grid-cols-2 gap-2">
                {stations.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleCreateStationChat(st.id)}
                    className="h-10 px-3 rounded-xl border border-line bg-bg-card text-xs font-bold text-ink hover:border-brand-500/30 active:scale-95 transition-all text-left truncate cursor-pointer"
                  >
                    📍 {st.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            stationId && (
              <Card
                hoverable
                onClick={() => handleCreateStationChat(stationId)}
                className="flex items-center gap-3.5 p-3.5 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl"
              >
                <div className="w-10 h-10 rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-ink truncate">Чат моей АЗС</div>
                  <div className="text-[10px] text-ink-soft truncate mt-0.5">В рамках вашей заправки</div>
                </div>
                <MessageCircle className="w-4 h-4 text-brand-400 flex-shrink-0" />
              </Card>
            )
          )}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Личный чат</div>
          <div className="mt-1 text-xl font-bold text-ink">{filteredEmployees.length}</div>
          <div className="mt-0.5 text-xs text-ink-muted">Доступные сотрудники для личного сообщения</div>
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <MiniCard label="Показываю" value={filteredEmployees.length} />
            <MiniCard label="Поиск" value={searchQuery ? 'Вкл' : 'Выкл'} />
            <MiniCard label="Роль" value={user?.profile?.role ? (ROLE_LABELS[user.profile.role] ?? user.profile.role) : '—'} />
          </div>
        </div>
      </motion.div>

      {/* Search Input */}
      <div className="relative mb-4 mt-2">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-ink-soft" />
        <input
          type="text"
          placeholder="Поиск сотрудника по имени..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full h-13 pl-11 pr-4 rounded-2xl bg-bg-card border border-line/45 text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand-500/50 transition-colors"
        />
      </div>

      {err && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-2xl p-4 text-sm mb-3">
          {err}
        </div>
      )}

      {/* Employees list */}
      <div className="space-y-2.5">
        {loading || creating ? (
          <div className="space-y-2.5">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-[2rem] bg-bg-card border border-line/30 animate-pulse" />
            ))}
          </div>
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="Сотрудники не найдены"
            description={
              searchQuery
                ? 'Измените поисковый запрос.'
                : 'Нет доступных сотрудников для переписки согласно вашей роли. Если вы вошли под ролью кассира/оператора, убедитесь, что применили новый SQL-запрос для обновления политик RLS таблицы профилей (0033_profiles_visibility_rls.sql) в Supabase Editor.'
            }
          />
        ) : (
          <AnimatePresence mode="wait">
            {groupedEmployees.map((group) => (
              <div key={group.key} className="space-y-2.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-brand-500 font-bold px-1.5 flex items-center gap-1.5">
                  {group.key === 'owner' ? <Building2 className="w-3.5 h-3.5" /> : group.key === 'admin' ? <MapPin className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                  {group.title}
                </div>
                {group.items.map((e, idx) => {
                  const matchedStation = stations.find((s) => s.id === e.station_id);
                  return (
                    <motion.div
                      key={e.user_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.02 }}
                    >
                      <Card
                        hoverable
                        onClick={() => handleCreateChat(e.user_id)}
                        className="flex items-center gap-3.5 p-3.5 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl"
                      >
                        {e.avatar_url ? (
                          <div className="w-10 h-10 rounded-xl overflow-hidden border border-line/50 flex-shrink-0">
                            <img src={e.avatar_url} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {e.full_name?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-ink truncate font-display">
                            {e.full_name ?? e.email}
                          </div>
                          <div className="text-[10px] text-ink-soft truncate font-sans tracking-wide mt-0.5">
                            {ROLE_LABELS[e.role] || e.role}
                            {matchedStation ? ` · АЗС ${matchedStation.name}` : ''}
                          </div>
                        </div>

                        <MessageCircle className="w-4 h-4 text-brand-400 flex-shrink-0" />
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            ))}
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
