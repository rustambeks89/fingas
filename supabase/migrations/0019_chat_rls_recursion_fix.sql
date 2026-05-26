-- Purpose: Fix infinite recursion in chat_participants/chat_threads RLS and
-- keep direct employee chat usable.

------------------------------------------------------------------------------
-- Helper functions that bypass RLS safely via SECURITY DEFINER
------------------------------------------------------------------------------
create or replace function public.fingas_chat_thread_exists(p_thread_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists(
    select 1
    from public.chat_threads t
    where t.id = p_thread_id
  );
$$;

create or replace function public.fingas_chat_is_participant(p_thread_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists(
    select 1
    from public.chat_participants cp
    where cp.thread_id = p_thread_id
      and cp.user_id = coalesce(p_user_id, auth.uid())
  );
$$;

create or replace function public.fingas_chat_can_access_thread(p_thread_id uuid, p_user_id uuid default auth.uid())
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_thread record;
begin
  select id, organization_id, station_id, type, created_by
    into v_thread
  from public.chat_threads
  where id = p_thread_id;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.user_id = v_user_id
      and p.organization_id = v_thread.organization_id
      and p.role = 'owner'
  ) then
    return true;
  end if;

  if v_thread.type = 'organization' and exists (
    select 1
    from public.profiles p
    where p.user_id = v_user_id
      and p.organization_id = v_thread.organization_id
      and p.status = 'active'
      and p.can_login = true
  ) then
    return true;
  end if;

  if v_thread.type = 'station' and exists (
    select 1
    from public.profiles p
    where p.user_id = v_user_id
      and p.organization_id = v_thread.organization_id
      and p.station_id = v_thread.station_id
      and p.status = 'active'
      and p.can_login = true
  ) then
    return true;
  end if;

  if public.fingas_chat_is_participant(p_thread_id, v_user_id) then
    return true;
  end if;

  if v_thread.created_by = v_user_id then
    return true;
  end if;

  return false;
end;
$$;

------------------------------------------------------------------------------
-- Replace chat policies to avoid recursive references between tables
------------------------------------------------------------------------------
drop policy if exists chat_threads_select on public.chat_threads;
create policy chat_threads_select on public.chat_threads
  for select to authenticated
  using (
    public.fingas_chat_can_access_thread(id)
  );

drop policy if exists chat_threads_insert on public.chat_threads;
create policy chat_threads_insert on public.chat_threads
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = chat_threads.organization_id
        and p.status = 'active'
        and p.can_login = true
    )
  );

drop policy if exists chat_threads_update on public.chat_threads;
create policy chat_threads_update on public.chat_threads
  for update to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = chat_threads.organization_id
        and p.role = 'owner'
    )
  );

drop policy if exists chat_participants_select on public.chat_participants;
create policy chat_participants_select on public.chat_participants
  for select to authenticated
  using (
    public.fingas_chat_can_access_thread(thread_id)
  );

drop policy if exists chat_participants_insert on public.chat_participants;
create policy chat_participants_insert on public.chat_participants
  for insert to authenticated
  with check (
    public.fingas_chat_thread_exists(thread_id)
    and (
      public.fingas_is_owner()
      or public.fingas_chat_can_access_thread(thread_id)
      or exists (
        select 1
        from public.chat_threads t
        where t.id = thread_id
          and t.created_by = auth.uid()
      )
    )
  );

drop policy if exists chat_participants_delete on public.chat_participants;
create policy chat_participants_delete on public.chat_participants
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.fingas_is_owner()
    or public.fingas_chat_can_access_thread(thread_id)
  );

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (
    public.fingas_chat_can_access_thread(thread_id)
  );

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = chat_messages.organization_id
        and p.status = 'active'
        and p.can_login = true
    )
    and public.fingas_chat_can_access_thread(thread_id)
    and (
      public.fingas_is_owner()
      or public.fingas_has_perm('chat', 'can_send')
    )
  );

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages
  for update to authenticated
  using (sender_id = auth.uid());

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages
  for delete to authenticated
  using (
    sender_id = auth.uid()
    or public.fingas_is_owner()
    or public.fingas_has_perm('chat', 'can_moderate')
  );

drop policy if exists chat_attachments_select on public.chat_attachments;
create policy chat_attachments_select on public.chat_attachments
  for select to authenticated
  using (public.fingas_chat_can_access_thread(thread_id));

drop policy if exists chat_attachments_insert on public.chat_attachments;
create policy chat_attachments_insert on public.chat_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.fingas_chat_can_access_thread(thread_id)
  );

drop policy if exists message_reads_select on public.message_reads;
create policy message_reads_select on public.message_reads
  for select to authenticated
  using (public.fingas_chat_can_access_thread(thread_id));

drop policy if exists message_reads_insert on public.message_reads;
create policy message_reads_insert on public.message_reads
  for insert to authenticated
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
