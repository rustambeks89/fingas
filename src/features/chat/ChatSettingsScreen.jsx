// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Chat settings screen — view thread participants, toggle mute/pin, thread info.

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Users,
  BellOff,
  Bell,
  Pin,
  PinOff,
  MapPin,
  Building2,
  User,
  Loader2,
  Shield,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getThreadById, hideThreadForUser, archiveThreadGlobally } from '@/services/chatService';
import { supabase } from '@/lib/supabaseClient';
import { ROLE_LABELS } from '@/lib/constants';

export default function ChatSettingsScreen() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { stations } = useOrgContext();

  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myPart, setMyPart] = useState(null);
  const [toggling, setToggling] = useState('');
  const isOwner = user?.profile?.role === 'owner';

  async function handleHideThread() {
    setToggling('delete');
    try {
      await hideThreadForUser(threadId);
      navigate('/more/chat', { replace: true });
    } catch (e) {
      console.error('[Fingas ChatSettings] Hide thread error', e);
    } finally {
      setToggling('');
    }
  }

  async function handleArchiveThreadGlobally() {
    setToggling('delete');
    try {
      await archiveThreadGlobally(threadId);
      navigate('/more/chat', { replace: true });
    } catch (e) {
      console.error('[Fingas ChatSettings] Delete thread globally error', e);
    } finally {
      setToggling('');
    }
  }

  useEffect(() => {
    if (!threadId) return;
    setLoading(true);
    getThreadById(threadId)
      .then((t) => {
        setThread(t);
        const me = t.participants?.find((p) => p.user_id === user?.id);
        setMyPart(me);
      })
      .catch(() => setThread(null))
      .finally(() => setLoading(false));
  }, [threadId, user?.id]);

  async function toggleMute() {
    if (!myPart) return;
    setToggling('mute');
    try {
      await supabase
        .from('chat_participants')
        .update({ muted: !myPart.muted })
        .eq('id', myPart.id);
      setMyPart((p) => ({ ...p, muted: !p.muted }));
    } catch (e) {
      console.error('[Fingas ChatSettings] Toggle mute error', e);
    } finally {
      setToggling('');
    }
  }

  async function togglePin() {
    if (!myPart) return;
    setToggling('pin');
    try {
      await supabase
        .from('chat_participants')
        .update({ pinned: !myPart.pinned })
        .eq('id', myPart.id);
      setMyPart((p) => ({ ...p, pinned: !p.pinned }));
    } catch (e) {
      console.error('[Fingas ChatSettings] Toggle pin error', e);
    } finally {
      setToggling('');
    }
  }

  const getThreadInfo = () => {
    if (!thread) return { title: '', subtitle: '', icon: Users };
    if (thread.type === 'direct') {
      const other = thread.participants?.find((p) => p.user_id !== user?.id);
      return {
        title: other?.user?.full_name || 'Личный чат',
        subtitle: other?.user?.role ? ROLE_LABELS[other.user.role] : 'Сотрудник',
        icon: User,
      };
    }
    if (thread.type === 'station') {
      const st = stations.find((s) => s.id === thread.station_id);
      return {
        title: thread.title || st?.name || 'Чат АЗС',
        subtitle: st?.city ? `АЗС · ${st.city}` : 'Групповой чат станции',
        icon: MapPin,
      };
    }
    if (thread.type === 'organization') {
      return {
        title: thread.title || 'Общий чат компании',
        subtitle: 'Вся организация',
        icon: Building2,
      };
    }
    return {
      title: thread.title || 'Рабочий диалог',
      subtitle: 'Чат по объекту',
      icon: Users,
    };
  };

  const info = getThreadInfo();
  const participants = thread?.participants || [];

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(`/more/chat/${threadId}`)}
          className="w-10 h-10 rounded-2xl border border-line/50 bg-bg-card/40 flex items-center justify-center text-ink-muted hover:text-ink active:scale-95 transition-transform"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="font-bold text-sm text-ink font-display">Настройки чата</div>
          <div className="text-[10px] text-ink-soft">Участники и уведомления</div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Параметры диалога</div>
          <div className="mt-1 text-xl font-bold text-ink truncate">{info.title || 'Чат'}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{info.subtitle || 'Участники и уведомления'}</div>
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <MiniCard label="Участников" value={participants.length} />
            <MiniCard label="Mute" value={myPart?.muted ? 'Да' : 'Нет'} />
            <MiniCard label="Pin" value={myPart?.pinned ? 'Да' : 'Нет'} />
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          <span className="text-xs text-ink-soft">Загрузка...</span>
        </div>
      ) : !thread ? (
        <Card className="text-center py-8 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
          <div className="text-sm text-ink-muted">Чат не найден.</div>
        </Card>
      ) : (
        <>
          {/* Thread Info Card */}
          <Card className="mb-4 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
                <info.icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-ink font-display truncate">{info.title}</div>
                <div className="text-xs text-ink-muted mt-0.5">{info.subtitle}</div>
                <div className="text-[10px] text-ink-soft mt-1 font-mono">
                  Тип: {thread.type === 'direct' ? 'Личный' : thread.type === 'station' ? 'АЗС' : thread.type === 'organization' ? 'Организация' : 'Объект'}
                  {' · '}{participants.length} участн.
                </div>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={toggleMute}
              disabled={toggling === 'mute'}
              className="rounded-[1.4rem] bg-bg-card/75 border border-line/70 p-4 flex flex-col items-center gap-2 hover:border-brand-500/30 active:scale-[0.97] transition disabled:opacity-50 backdrop-blur-xl"
            >
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                myPart?.muted
                  ? 'bg-warning/15 text-warning border-warning/30'
                  : 'bg-bg-elevated text-ink-muted border-line'
              }`}>
                {myPart?.muted ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
              </div>
              <span className="text-xs font-bold text-ink">
                {myPart?.muted ? 'Вкл. звук' : 'Без звука'}
              </span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={togglePin}
              disabled={toggling === 'pin'}
              className="rounded-[1.4rem] bg-bg-card/75 border border-line/70 p-4 flex flex-col items-center gap-2 hover:border-brand-500/30 active:scale-[0.97] transition disabled:opacity-50 backdrop-blur-xl"
            >
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                myPart?.pinned
                  ? 'bg-brand-500/15 text-brand-400 border-brand-500/30'
                  : 'bg-bg-elevated text-ink-muted border-line'
              }`}>
                {myPart?.pinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
              </div>
              <span className="text-xs font-bold text-ink">
                {myPart?.pinned ? 'Открепить' : 'Закрепить'}
              </span>
            </motion.button>
          </div>

          {/* Participants List */}
          <div className="mb-2">
            <div className="text-xs font-bold text-ink-muted uppercase tracking-wider px-1 mb-3 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-brand-400" />
              Участники ({participants.length})
            </div>
            <div className="space-y-2">
              {participants.map((p, idx) => {
                const profile = p.user;
                const isMe = p.user_id === user?.id;
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <Card className={`flex items-center gap-3 p-4 ${isMe ? 'border-brand-500/20' : ''}`}>
                      <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-line flex items-center justify-center overflow-hidden flex-shrink-0">
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-4.5 h-4.5 text-ink-muted" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-ink truncate">
                          {profile?.full_name || 'Сотрудник'}
                          {isMe && <span className="text-brand-400 ml-1 text-[10px] font-mono">(вы)</span>}
                        </div>
                        {profile?.role && (
                          <Badge tone="brand" className="mt-1 text-[9px]">
                            {ROLE_LABELS[profile.role] || profile.role}
                          </Badge>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Danger Zone (Dialogue deletion) */}
          <div className="mt-8 pt-6 border-t border-line/40">
            <div className="text-[10px] font-bold text-danger uppercase tracking-wider px-1 mb-3">
              Опасная зона
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              {/* For every participant: hide thread for self */}
              <Button
                variant="secondary"
                size="block"
                onClick={handleHideThread}
                disabled={toggling === 'delete'}
                className="flex-1 h-11 text-xs border-danger/30 hover:border-danger/60 text-danger hover:bg-danger/5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Удалить для себя
              </Button>

              {/* Direct chat participant (except cashier/operator) OR Owner can delete/archive globally */}
              {(isOwner || (thread?.type === 'direct' && user?.profile?.role !== 'operator')) && (
                <Button
                  variant="danger"
                  size="block"
                  onClick={handleArchiveThreadGlobally}
                  disabled={toggling === 'delete'}
                  className="flex-1 h-11 text-xs shadow-md shadow-brand-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Удалить для всех
                </Button>
              )}
            </div>
          </div>
        </>
      )}
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
