-- [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Create Chat schema (threads, participants, messages, attachments, reads), Storage Bucket, and RLS policies.

------------------------------------------------------------------------------
-- Expand Permissions check constraint to include 'chat'
------------------------------------------------------------------------------
alter table public.user_permissions drop constraint if exists user_permissions_module_check;
alter table public.user_permissions add constraint user_permissions_module_check check (module in (
  'dashboard','shifts','sales','fuel_supply','tank_measurements',
  'calibrations','fuel_balances','cashflow','pl','taxes','payroll',
  'suppliers','collections','documents','settings','employees','notifications','chat'
));

------------------------------------------------------------------------------
-- Create Tables
------------------------------------------------------------------------------

-- 1. chat_threads
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete cascade,
  type text not null check (type in ('direct', 'station', 'organization', 'object')),
  title text,
  related_table text,
  related_id uuid,
  created_by uuid not null references auth.users(id) on delete set null,
  last_message_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. chat_participants
create table if not exists public.chat_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text,
  muted boolean not null default false,
  pinned boolean not null default false,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  unique (thread_id, user_id)
);

-- 3. chat_messages
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete set null,
  message text,
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file', 'system')),
  related_table text,
  related_id uuid,
  edited boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. chat_attachments
create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete cascade,
  file_url text not null,
  file_name text,
  file_type text,
  file_size numeric,
  uploaded_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 5. message_reads
create table if not exists public.message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (message_id, user_id)
);

------------------------------------------------------------------------------
-- Indexes
------------------------------------------------------------------------------
create index if not exists idx_chat_threads_org on public.chat_threads(organization_id);
create index if not exists idx_chat_threads_station on public.chat_threads(station_id);
create index if not exists idx_chat_part_thread on public.chat_participants(thread_id);
create index if not exists idx_chat_part_user on public.chat_participants(user_id);
create index if not exists idx_chat_msg_thread on public.chat_messages(thread_id);
create index if not exists idx_chat_msg_sender on public.chat_messages(sender_id);

------------------------------------------------------------------------------
-- Triggers (Auto update last_message_at and updated_at)
------------------------------------------------------------------------------
create or replace function public.trigger_chat_threads_last_message()
returns trigger as $$
begin
  update public.chat_threads
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_chat_messages_last_message on public.chat_messages;
create trigger trg_chat_messages_last_message
  after insert on public.chat_messages
  for each row execute function public.trigger_chat_threads_last_message();

-- Thread updated_at trigger
drop trigger if exists trg_chat_threads_updated_at on public.chat_threads;
create trigger trg_chat_threads_updated_at
  before update on public.chat_threads
  for each row execute function public.trigger_set_updated_at();

-- Message updated_at trigger
drop trigger if exists trg_chat_messages_updated_at on public.chat_messages;
create trigger trg_chat_messages_updated_at
  before update on public.chat_messages
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- Enable Row Level Security (RLS)
------------------------------------------------------------------------------
alter table public.chat_threads enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_attachments enable row level security;
alter table public.message_reads enable row level security;

------------------------------------------------------------------------------
-- RLS Helper Functions & Policies
------------------------------------------------------------------------------

-- Select policies: Owner has org access, participants have thread access, station match for station chats.
create policy chat_threads_select on public.chat_threads
  for select to authenticated
  using (
    -- 1. Org Owner
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = chat_threads.organization_id
        and p.role = 'owner'
    )
    or
    -- 2. Explicit participant
    exists (
      select 1 from public.chat_participants cp
      where cp.thread_id = chat_threads.id
        and cp.user_id = auth.uid()
    )
    or
    -- 3. Org-wide thread (accessible to anyone in the organization)
    (
      chat_threads.type = 'organization'
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid()
          and p.organization_id = chat_threads.organization_id
      )
    )
    or
    -- 4. Station thread matching user's station
    (
      chat_threads.type = 'station'
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid()
          and p.station_id = chat_threads.station_id
          and p.organization_id = chat_threads.organization_id
      )
    )
  );

create policy chat_threads_insert on public.chat_threads
  for insert to authenticated
  with check (
    -- Any active user can insert threads inside their own organization
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = chat_threads.organization_id
        and p.status = 'active'
        and p.can_login = true
    )
  );

create policy chat_threads_update on public.chat_threads
  for update to authenticated
  using (
    created_by = auth.uid() or
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = chat_threads.organization_id
        and p.role = 'owner'
    )
  );

-- chat_participants
create policy chat_participants_select on public.chat_participants
  for select to authenticated
  using (
    -- Visible if you have access to the thread
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_participants.thread_id
    )
  );

create policy chat_participants_insert on public.chat_participants
  for insert to authenticated
  with check (
    -- Can add participants if thread creator or owner
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_participants.thread_id
        and (t.created_by = auth.uid() or exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid()
            and p.organization_id = t.organization_id
            and p.role = 'owner'
        ))
    )
  );

create policy chat_participants_delete on public.chat_participants
  for delete to authenticated
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_participants.thread_id
        and (t.created_by = auth.uid() or exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid()
            and p.organization_id = t.organization_id
            and p.role = 'owner'
        ))
    )
  );

-- chat_messages
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (
    -- Visible if you have access to the thread
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_messages.thread_id
    )
  );

create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    -- Can write if profile is active + has chat can_send permission + has thread access
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = chat_messages.organization_id
        and p.status = 'active'
        and p.can_login = true
    )
    and
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_messages.thread_id
    )
    and
    (
      public.fingas_is_owner() or
      public.fingas_has_perm('chat', 'can_send')
    )
  );

create policy chat_messages_update on public.chat_messages
  for update to authenticated
  using (sender_id = auth.uid());

create policy chat_messages_delete on public.chat_messages
  for delete to authenticated
  using (
    sender_id = auth.uid() or
    public.fingas_is_owner() or
    public.fingas_has_perm('chat', 'can_moderate')
  );

-- chat_attachments
create policy chat_attachments_select on public.chat_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_attachments.thread_id
    )
  );

create policy chat_attachments_insert on public.chat_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.chat_threads t
      where t.id = chat_attachments.thread_id
    )
  );

-- message_reads
create policy message_reads_select on public.message_reads
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_threads t
      where t.id = message_reads.thread_id
    )
  );

create policy message_reads_insert on public.message_reads
  for insert to authenticated
  with check (user_id = auth.uid());

------------------------------------------------------------------------------
-- Storage Buckets & Policies
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('chat-attachments', 'chat-attachments', false)
  on conflict (id) do nothing;

-- Update RLS storage select
drop policy if exists fingas_storage_select on storage.objects;
create policy fingas_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id in ('avatars','shift-reports','receipts','invoices',
                  'tax-documents','measurements','documents','chat-attachments')
  );

-- Update RLS storage insert
drop policy if exists fingas_storage_insert on storage.objects;
create policy fingas_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars','shift-reports','receipts','invoices',
                  'tax-documents','measurements','documents','chat-attachments')
  );

------------------------------------------------------------------------------
-- Automated Chat Notifications Trigger
------------------------------------------------------------------------------

create or replace function public.trigger_chat_notifications()
returns trigger as $$
declare
  r record;
  thread_type text;
  thread_title text;
  sender_name text;
begin
  -- Get thread details
  select type, title into thread_type, thread_title
  from public.chat_threads
  where id = new.thread_id;

  -- Get sender's name
  select full_name into sender_name
  from public.profiles
  where user_id = new.sender_id;

  -- For system messages, use 'Система'
  if new.message_type = 'system' then
    sender_name := 'Система';
  end if;

  -- Loop through all thread participants except the sender
  for r in (
    select user_id from public.chat_participants
    where thread_id = new.thread_id and user_id <> new.sender_id
  ) loop
    insert into public.notifications (
      organization_id,
      station_id,
      recipient_user_id,
      event_type,
      title,
      body,
      link
    ) values (
      new.organization_id,
      new.station_id,
      r.user_id,
      'chat_message',
      case 
        when thread_type = 'direct' then 'Новое сообщение от ' || coalesce(sender_name, 'коллеги')
        else 'Новое сообщение в чате ' || coalesce(thread_title, 'команды')
      end,
      case 
        when new.message_type = 'image' then '📷 Изображение'
        when new.message_type = 'file' then '📁 Файл / Документ'
        else new.message
      end,
      '/more/chat/' || new.thread_id
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_chat_messages_notifications on public.chat_messages;
create trigger trg_chat_messages_notifications
  after insert on public.chat_messages
  for each row execute function public.trigger_chat_notifications();
