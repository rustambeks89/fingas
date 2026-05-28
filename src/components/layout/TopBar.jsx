import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, Loader2, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { Wordmark } from '@/components/ui/Logo';
import { supabase } from '@/lib/supabaseClient';
import { formatRelative } from '@/lib/formatters';

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    // Tone 1: sweet glass chime (A5, 880 Hz)
    osc1.frequency.setValueAtTime(880.00, now);
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    // Tone 2: high clean shift (D6, 1174.66 Hz)
    osc2.frequency.setValueAtTime(1174.66, now + 0.08);
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.1, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    
    osc1.start(now);
    osc1.stop(now + 0.4);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.6);
  } catch (err) {
    console.warn('Audio chime failed to play:', err);
  }
}

export function TopBar() {
  const { user } = useAuth();
  const p = user?.profile;
  const userId = user?.id;
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = useCallback((notif) => {
    setToast(notif);
    const timer = setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, []);

  function handleTestNotification() {
    playChime();
    showToast({
      id: 'test-id',
      title: 'Уведомление fingas 🛎️',
      body: 'Это премиальный звук и анимация в стиле WhatsApp! Тест прошел успешно.',
      link: '/notifications',
      created_at: new Date().toISOString()
    });
  }

  // 1. Load notifications from Supabase
  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      setRows(data ?? []);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load once user is available and when opened
  useEffect(() => {
    if (userId) {
      load();
    }
  }, [userId, load]);

  // Realtime updates subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`topbar_notifs_${userId}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          load();
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new;
            if (newNotif) {
              playChime();
              showToast(newNotif);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load, showToast]);

  // Unread count (all loaded notifications are unread since read ones are deleted)
  const unreadCount = rows.length;

  // Mark notification as read (deletes it from DB)
  async function markAsRead(id) {
    // Optimistic local deletion
    setRows((prev) => prev.filter((n) => n.id !== id));

    try {
      await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
    } catch {/* noop */}
  }

  // Mark all read (deletes all notifications from DB)
  async function markAllRead() {
    const ids = rows.map((n) => n.id);
    if (ids.length === 0) return;

    // Optimistic local deletion
    setRows([]);

    try {
      await supabase
        .from('notifications')
        .delete()
        .in('id', ids);
    } catch {/* noop */}
  }

  // Drag up handler to close shade
  function handleDragEnd(event, info) {
    if (info.offset.y < -50 || info.velocity.y < -200) {
      setIsOpen(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-transparent safe-top bg-bg-card/85 backdrop-blur-xl">
        <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center select-none">
              <Wordmark />
            </div>
          </div>

          
          <div className="flex-1 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setIsOpen(true);
                load(); // Reload on open to ensure fresh data
              }}
              onDoubleClick={handleTestNotification}
              className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-white/70 hover:text-white transition-colors relative cursor-pointer"
              aria-label="Уведомления"
              title="Двойной клик для теста звука и WhatsApp-уведомления"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 border-2 border-[rgba(10,15,26,0.9)] rounded-full bg-brand-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              )}
            </button>
            <Link to="/profile" className="transition-transform active:scale-95" aria-label="Профиль">
              <Avatar size="md" className="w-10 h-10 border-white/10 shadow-sm" name={p?.full_name ?? user?.email ?? '?'} src={p?.avatar_url} />
            </Link>
          </div>
        </div>
      </header>

      {/* NOTIFICATION SHADE OVERLAY */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Dark glass backdrop - Lighter and more transparent */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/25 backdrop-blur-[3px] z-40 cursor-pointer"
            />

            {/* Notification Shade - More transparent (65%) with bg-[#0C152B]/65 and heavy blur */}
            <motion.div
              drag="y"
              dragConstraints={{ top: -600, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.15 }}
              onDragEnd={handleDragEnd}
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed inset-x-0 top-0 max-w-screen-sm mx-auto bg-[#0C152B]/65 border-b border-white/[0.06] rounded-b-[2rem] z-50 shadow-2xl safe-top flex flex-col max-h-[85vh] touch-none overflow-hidden"
              style={{ backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)' }}
            >
              {/* Drag Handle Top */}
              <div className="pt-2 pb-1.5 flex justify-center">
                <div className="w-12 h-1.5 rounded-full bg-white/20 active:bg-white/40 cursor-grab" />
              </div>

              {/* Shade Header */}
              <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.04]">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <Bell className="w-4.5 h-4.5 text-brand-400" />
                    Уведомления
                  </h3>
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider mt-0.5">
                    {unreadCount > 0 ? `${unreadCount} новых` : 'Уведомлений нет'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="h-8 px-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-[10px] font-black flex items-center gap-1 transition select-none cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5 text-brand-400" /> Очистить все
                    </button>
                  )}
                  {/* Removed close button ('X') as requested */}
                </div>
              </div>

              {/* Notifications List (Scrollable Area) */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 no-scrollbar pointer-events-auto select-none touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                {loading && rows.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center text-white/40 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                    <span className="text-xs font-bold">Загрузка уведомлений...</span>
                  </div>
                )}

                {err && (
                  <div className="p-3.5 rounded-xl border border-danger/30 bg-danger/10 text-xs text-danger text-center font-bold">
                    {err}
                  </div>
                )}

                {!loading && rows.length === 0 && (
                  <div className="py-16 text-center text-white/40">
                    <Bell className="w-8 h-8 mx-auto mb-2 text-white/20" />
                    <h4 className="text-xs font-black text-white/60">Тишина</h4>
                    <p className="text-[10px] text-white/30 mt-1 max-w-xs mx-auto">Новых уведомлений нет. Сюда будут приходить отчеты смен, инкассации и заявки.</p>
                  </div>
                )}

                {rows.map((n) => {
                  const hasLink = Boolean(n.link);
                  const Wrap = hasLink ? Link : 'div';
                  return (
                    <Wrap
                      key={n.id}
                      to={n.link}
                      onClick={() => {
                        markAsRead(n.id);
                        setIsOpen(false);
                      }}
                      className="block active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <div className="p-3 rounded-xl border transition-all duration-200 relative bg-brand-500/5 border-brand-500/20 text-white">
                        <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse" />
                        <div className="flex items-start gap-2.5 min-w-0 pr-4">
                          <div className="w-8.5 h-8.5 rounded-lg border flex items-center justify-center flex-shrink-0 bg-brand-500/10 border-brand-500/20 text-brand-400">
                            <Bell className="w-4.5 h-4.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-black truncate leading-tight">{n.title}</h4>
                            {n.body && (
                              <p className="text-[10px] text-white/50 truncate mt-1 leading-snug">{n.body}</p>
                            )}
                            <span className="text-[9px] text-white/30 block mt-1 font-bold uppercase tracking-wider">{formatRelative(n.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </Wrap>
                  );
                })}
              </div>

              {/* Shade Bottom Swiper Indicator */}
              <div className="pb-3 pt-1 text-center select-none pointer-events-none">
                <span className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">Смахните вверх, чтобы закрыть</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* WHATSAPP-STYLE PUSH TOAST - Translucent glass design */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -80, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -80, scale: 0.95, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', damping: 22, stiffness: 200 }}
            onClick={() => {
              if (toast.link) {
                navigate(toast.link);
              }
              setToast(null);
            }}
            className="fixed top-4 inset-x-4 max-w-screen-sm mx-auto z-50 bg-[#0C152B]/70 backdrop-blur-2xl border border-white/[0.08] shadow-[0_16px_36px_rgba(0,0,0,0.55)] rounded-2xl p-3.5 flex items-start gap-3 cursor-pointer select-none active:scale-[0.98] transition-transform"
          >
            {/* Medallion */}
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-inner shadow-brand-500/5 animate-pulse">
              <Bell className="w-4.5 h-4.5" />
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-white leading-tight truncate">{toast.title}</span>
                <span className="text-[8px] font-black text-brand-400 uppercase tracking-widest flex-shrink-0 bg-brand-500/10 px-1.5 py-0.5 rounded-md border border-brand-500/20 shadow-inner">сейчас</span>
              </div>
              {toast.body && (
                <p className="text-[10px] text-white/60 leading-snug mt-1 line-clamp-2">{toast.body}</p>
              )}
            </div>

            {/* Drag line close */}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-white/20" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
