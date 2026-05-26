// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Custom React hook to dynamically count unread threads, enabling active notification badges on the main layout and menu.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getUnreadCount } from '@/services/chatService';
import { useAuth } from './useAuth';

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch (e) {
      console.error('[Fingas useUnreadMessages] Error', e);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Subscribe to ALL new messages in the organization to update badges reactively
  useEffect(() => {
    if (!user?.id) return;

    const orgId = user?.profile?.organization_id;
    if (!orgId) return;

    // Listen for any message insertions in our organization
    const globalMsgChannel = supabase
      .channel(`global_chat_unread_${Math.random().toString(36).substring(2, 9)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          // Re-evaluate unread counts upon new incoming messages
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(globalMsgChannel);
    };
  }, [user?.id, user?.profile?.organization_id, fetchCount]);

  return { unreadCount, refreshCount: fetchCount };
}
