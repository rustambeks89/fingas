-- [CREATED BY ANTIGRAVITY - 2026-05-27]
-- Project: Fingas
-- Purpose: Add DELETE policy for the notifications table to allow operators and owners to clear read notifications.

drop policy if exists notif_del on public.notifications;
create policy notif_del on public.notifications for delete using (
  recipient_user_id = auth.uid()
);
