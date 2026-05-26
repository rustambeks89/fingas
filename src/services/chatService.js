// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Frontend service for all Supabase chat database operations.

import { supabase } from '@/lib/supabaseClient';

// Helper to get active user ID
async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

async function fetchProfilesByUserIds(userIds = []) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, full_name, avatar_url, role, email')
    .in('user_id', ids);

  if (error) throw error;
  return data ?? [];
}

function attachProfilesToThreads(threads, profiles) {
  const byUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));
  return (threads ?? []).map((thread) => ({
    ...thread,
    participants: (thread.participants ?? []).map((participant) => ({
      ...participant,
      user: byUserId.get(participant.user_id) ?? null,
    })),
  }));
}

async function enrichThreads(threads) {
  const userIds = [];
  for (const thread of threads ?? []) {
    for (const participant of thread.participants ?? []) {
      if (participant?.user_id) userIds.push(participant.user_id);
    }
  }
  const profiles = await fetchProfilesByUserIds(userIds);
  return attachProfilesToThreads(threads, profiles);
}

// 1. Fetch all threads for current user
export async function getThreads() {
  const userId = await getUserId();
  if (!userId) return [];

  // Query threads. Due to RLS, users only see allowed threads.
  const { data: threads, error } = await supabase
    .from('chat_threads')
    .select(`
      *,
      participants:chat_participants ( * )
    `)
    .eq('archived', false)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return enrichThreads(threads ?? []);
}

// 2. Fetch specific thread by ID
export async function getThreadById(threadId) {
  const { data, error } = await supabase
    .from('chat_threads')
    .select(`
      *,
      participants:chat_participants ( * )
    `)
    .eq('id', threadId)
    .single();

  if (error) throw error;
  const [thread] = await enrichThreads([data]);
  return thread;
}

// 3. Fetch all messages in a thread
export async function getMessages(threadId) {
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select(`
      *,
      sender:profiles ( id, full_name, avatar_url, role ),
      attachments:chat_attachments ( * )
    `)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return messages ?? [];
}

// 4. Create or find direct thread between current user and target user
export async function createDirectThread(targetUserId) {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  // Fetch current user organization details
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userId)
    .single();

  const orgId = myProfile?.organization_id;
  if (!orgId) throw new Error('No active organization found');

  // Check if thread already exists
  const { data: myThreads } = await supabase
    .from('chat_threads')
    .select('id, type, participants:chat_participants(user_id)')
    .eq('organization_id', orgId)
    .eq('type', 'direct');

  const existing = myThreads?.find(t => 
    t.participants?.some(p => p.user_id === targetUserId) &&
    t.participants?.some(p => p.user_id === userId)
  );

  if (existing) return existing.id;

  // Create new direct thread
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .insert({
      organization_id: orgId,
      type: 'direct',
      created_by: userId,
    })
    .select()
    .single();

  if (threadError) throw threadError;

  // Add participants
  const { error: partError } = await supabase
    .from('chat_participants')
    .insert([
      { thread_id: thread.id, user_id: userId },
      { thread_id: thread.id, user_id: targetUserId },
    ]);

  if (partError) {
    // Cleanup thread if participants failed
    await supabase.from('chat_threads').delete().eq('id', thread.id);
    throw partError;
  }

  return thread.id;
}

// 5. Create or find station thread
export async function createStationThread(stationId) {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userId)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('No active organization found');

  // Find existing station thread
  const { data: existing, error: findError } = await supabase
    .from('chat_threads')
    .select('id')
    .eq('station_id', stationId)
    .eq('type', 'station')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing.id;

  // Fetch station name for title
  const { data: station } = await supabase
    .from('stations')
    .select('name')
    .eq('id', stationId)
    .single();

  // Create new station thread
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .insert({
      organization_id: orgId,
      station_id: stationId,
      type: 'station',
      title: station?.name ? `Чат АЗС: ${station.name}` : 'Чат АЗС',
      created_by: userId,
    })
    .select()
    .single();

  if (threadError) throw threadError;

  // Add creator as participant
  await supabase.from('chat_participants').insert({
    thread_id: thread.id,
    user_id: userId,
  });

  return thread.id;
}

// 6. Create or find organization thread
export async function createOrganizationThread(orgId) {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const { data: existing, error: findError } = await supabase
    .from('chat_threads')
    .select('id')
    .eq('type', 'organization')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  // Create new organization thread
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .insert({
      organization_id: orgId,
      type: 'organization',
      title: org?.name ? `Общий чат: ${org.name}` : 'Общий чат организации',
      created_by: userId,
    })
    .select()
    .single();

  if (threadError) throw threadError;

  // Add creator as participant
  await supabase.from('chat_participants').insert({
    thread_id: thread.id,
    user_id: userId,
  });

  return thread.id;
}

// 7. Send message to thread
export async function sendMessage(threadId, messageText, type = 'text', related = {}) {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  // Fetch thread details to fill organization_id and station_id
  const thread = await getThreadById(threadId);

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      organization_id: thread.organization_id,
      station_id: thread.station_id || null,
      sender_id: userId,
      message: messageText,
      message_type: type,
      related_table: related.table || null,
      related_id: related.id || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 8. Upload attachment to storage and link it in a message
export async function sendAttachment(threadId, file) {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const thread = await getThreadById(threadId);

  // Upload file to Supabase Storage Bucket
  const fileExt = file.name.split('.').pop();
  const fileName = `${threadId}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('chat-attachments')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  // Get public/signed URL
  const { data: urlData } = await supabase.storage
    .from('chat-attachments')
    .getPublicUrl(filePath);

  const fileUrl = urlData?.publicUrl ?? '';

  // Create message entry
  const isImage = file.type.startsWith('image/');
  const msgType = isImage ? 'image' : 'file';

  const message = await sendMessage(threadId, `Файл: ${file.name}`, msgType);

  // Link in attachments
  const { data: attachment, error: attachError } = await supabase
    .from('chat_attachments')
    .insert({
      message_id: message.id,
      thread_id: threadId,
      organization_id: thread.organization_id,
      station_id: thread.station_id || null,
      file_url: fileUrl,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (attachError) throw attachError;
  return attachment;
}

// 9. Mark thread as read for current user
export async function markThreadAsRead(threadId) {
  const userId = await getUserId();
  if (!userId) return;

  // Update participant joined/read timestamp
  await supabase
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('user_id', userId);
}

// 10. Fetch unread messages count for active user
export async function getUnreadCount() {
  const userId = await getUserId();
  if (!userId) return 0;

  // Fetch threads user belongs to
  const threads = await getThreads();
  let count = 0;

  for (const t of threads) {
    const me = t.participants?.find(p => p.user_id === userId);
    if (!me) continue;

    const lastRead = me.last_read_at ? new Date(me.last_read_at) : new Date(0);
    const lastMsg = t.last_message_at ? new Date(t.last_message_at) : new Date(0);

    if (lastMsg > lastRead) {
      count++;
    }
  }

  return count;
}

// 11. Create a system notification message linked to operations
export async function createSystemMessage({
  threadId,
  organizationId,
  stationId,
  message,
  relatedTable,
  relatedId,
}) {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      organization_id: organizationId,
      station_id: stationId || null,
      sender_id: userId, // system updates logged as active user action
      message: message,
      message_type: 'system',
      related_table: relatedTable || null,
      related_id: relatedId || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 12. Fetch the latest active message (and corresponding thread) for dashboard preview
export async function getLatestChatMessage() {
  try {
    const userId = await getUserId();
    if (!userId) return null;

    // Get active user threads (already ordered by last_message_at desc)
    const threads = await getThreads();
    if (threads.length === 0) return null;

    // Find the first thread that has messages
    for (const t of threads) {
      if (!t.last_message_at) continue;
      
      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select(`
          *,
          sender:profiles ( id, full_name, avatar_url, role )
        `)
        .eq('thread_id', t.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && messages && messages.length > 0) {
        const [thread] = await enrichThreads([t]);
        return {
          message: messages[0],
          thread
        };
      }
    }
    return null;
  } catch (e) {
    console.error('[Fingas chatService] Error in getLatestChatMessage', e);
    return null;
  }
}
