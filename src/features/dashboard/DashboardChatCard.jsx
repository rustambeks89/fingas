// [CREATED BY ANTIGRAVITY CLI - 2026-05-27]
// Project: Fingas
// Purpose: Floating Action Button (FAB) for Chat - Displays unread message counts,
// and redirects to mesenger. Positioned fixedly above the bottom tab navigation.

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { hasPermission, isOwner } from '@/lib/permissions';
import { MODULES } from '@/lib/constants';
import { supabase } from '@/lib/supabaseClient';

export default function DashboardChatCard() {
  const { user } = useAuth();
  const { unreadCount, refreshCount } = useUnreadMessages();
  const location = useLocation();

  const owner = isOwner(user);
  const canView = owner || hasPermission(user, MODULES.CHAT, 'can_view');

  // Real-time subscription to trigger unread count updates immediately
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
          refreshCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canView, user?.profile?.organization_id, refreshCount]);

  // Hide the floating button ONLY when we are actually inside the chat pages
  const isChatPage = location.pathname.startsWith('/more/chat');
  if (!canView || isChatPage) return null;

  return (
    <div className="fixed bottom-24 right-5 z-40">
      <Link to="/more/chat" aria-label="Мессенджер">
        <motion.div
          whileHover={{ scale: 1.08, translateY: -2 }}
          whileTap={{ scale: 0.92 }}
          className="w-[58px] h-[58px] rounded-full bg-gradient-to-tr from-emerald-600/90 to-emerald-500/90 border border-emerald-400/40 flex items-center justify-center text-white backdrop-blur-2xl relative transition-shadow duration-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.55)] cursor-pointer"
        >
          <MessageSquare className="w-[26px] h-[26px] text-white" />
          
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="absolute -top-1 -right-1 bg-brand-500 text-white font-mono text-[9px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center border border-bg shadow-[0_0_8px_rgba(239,68,68,0.5)] select-none"
              >
                {unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </Link>
    </div>
  );
}
