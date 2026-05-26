// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Custom React hook for live real-time chats, messages syncing, and attachments.

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  getThreads,
  getMessages,
  sendMessage,
  sendAttachment,
  markThreadAsRead,
} from '@/services/chatService';

export function useChat(threadId = null) {
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  
  const messagesRef = useRef(messages);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 1. Fetch active threads
  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getThreads();
      setThreads(data);
    } catch (e) {
      console.error('[Fingas useChat] Fetch threads error', e);
      setError(e?.message ?? 'Не удалось загрузить диалоги.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Fetch messages for active thread
  const loadMessages = useCallback(async (id) => {
    if (!id) return;
    setLoadingMessages(true);
    setError('');
    try {
      const data = await getMessages(id);
      setMessages(data);
      // Mark as read immediately
      await markThreadAsRead(id);
    } catch (e) {
      console.error('[Fingas useChat] Fetch messages error', e);
      setError(e?.message ?? 'Не удалось загрузить сообщения.');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // 3. Send text message
  const sendTextMessage = useCallback(async (text, type = 'text', related = {}) => {
    if (!threadId || !text?.trim()) return null;
    try {
      const data = await sendMessage(threadId, text, type, related);
      // Mark thread read locally
      await markThreadAsRead(threadId);
      return data;
    } catch (e) {
      console.error('[Fingas useChat] Send text error', e);
      setError(e?.message ?? 'Ошибка отправки сообщения.');
      throw e;
    }
  }, [threadId]);

  // 4. Send file attachment
  const sendFileAttachment = useCallback(async (file) => {
    if (!threadId || !file) return null;
    try {
      const data = await sendAttachment(threadId, file);
      await markThreadAsRead(threadId);
      return data;
    } catch (e) {
      console.error('[Fingas useChat] Send file error', e);
      setError(e?.message ?? 'Ошибка отправки файла.');
      throw e;
    }
  }, [threadId]);

  // Initial load
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (threadId) {
      loadMessages(threadId);
    } else {
      setMessages([]);
    }
  }, [threadId, loadMessages]);

  // 5. Connect Realtime Postgres Changes
  useEffect(() => {
    if (!threadId) return;

    // Connect to the messages channel for this specific thread
    const messagesChannel = supabase
      .channel(`chat_messages:thread_id=eq.${threadId}_${Math.random().toString(36).substring(2, 9)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          // Fetch complete profile details of the sender for high-fidelity UI rendering
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, role')
            .eq('user_id', payload.new.sender_id)
            .single();

          // Fetch attachment if message_type is image/file
          let fileAttachments = [];
          if (payload.new.message_type === 'image' || payload.new.message_type === 'file') {
            const { data } = await supabase
              .from('chat_attachments')
              .select('*')
              .eq('message_id', payload.new.id);
            fileAttachments = data ?? [];
          }

          const completeMessage = {
            ...payload.new,
            sender: senderProfile ?? null,
            attachments: fileAttachments,
          };

          // Append message securely without breaking standard lifecycle lists
          setMessages((prev) => {
            if (prev.some((m) => m.id === completeMessage.id)) return prev;
            return [...prev, completeMessage];
          });

          // Refresh active threads list so that the latest message timestamp aligns correctly
          loadThreads();
          // Mark thread as read for current user since they are inside the screen
          markThreadAsRead(threadId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [threadId, loadThreads]);

  return {
    threads,
    messages,
    loading,
    loadingMessages,
    error,
    refreshThreads: loadThreads,
    refreshMessages: () => loadMessages(threadId),
    sendTextMessage,
    sendFileAttachment,
  };
}
