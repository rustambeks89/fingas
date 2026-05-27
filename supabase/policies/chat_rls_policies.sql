-- ================================================================
-- Fingas Chat RLS — окончательное исправление (v9)
-- Решает проблему курицы и яйца при создании треда (INSERT ... RETURNING)
-- Добавляет FK-связь для джойна profiles (sender) в PostgREST
-- Автоматически активирует Realtime для чата в базе данных
-- Добавляет колонку hidden_at для индивидуального скрытия чатов
-- Запускай ЦЕЛИКОМ в Supabase → SQL Editor
-- ================================================================

-- ----------------------------------------------------------------
-- 0. ИСПРАВЛЕНИЕ СВЯЗИ ДЛЯ СХЕМЫ И ДОБАВЛЕНИЕ СТОЛБЦА СКРЫТИЯ
-- ----------------------------------------------------------------
-- Добавляем внешний ключ на profiles(user_id) вместо auth.users,
-- чтобы PostgREST знал, как автоматически джойнить sender:profiles в JS.
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id)
  REFERENCES public.profiles(user_id)
  ON DELETE SET NULL;

-- Добавляем колонку hidden_at для индивидуального удаления/скрытия чата
ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- ----------------------------------------------------------------
-- 0.1 АВТОМАТИЧЕСКАЯ АКТИВАЦИЯ REALTIME ДЛЯ ТАБЛИЦ ЧАТА
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Проверяем и добавляем chat_messages
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages' AND schemaname = 'public'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;

    -- Проверяем и добавляем chat_threads
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'chat_threads' AND schemaname = 'public'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;
    END IF;
  END IF;
END
$$;

-- ----------------------------------------------------------------
-- 1. ЯВНЫЙ СБРОС ВСЕХ ВОЗМОЖНЫХ СТАРЫХ ПОЛИТИК (без PL/pgSQL блоков)
-- ----------------------------------------------------------------

-- Таблица: chat_threads
DROP POLICY IF EXISTS "chat_threads_select" ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads_insert" ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads_update" ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads_delete" ON public.chat_threads;
DROP POLICY IF EXISTS "threads_select" ON public.chat_threads;
DROP POLICY IF EXISTS "threads_insert" ON public.chat_threads;
DROP POLICY IF EXISTS "threads_update" ON public.chat_threads;
DROP POLICY IF EXISTS "threads_delete" ON public.chat_threads;

-- Таблица: chat_participants
DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;
DROP POLICY IF EXISTS "participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "participants_delete" ON public.chat_participants;

-- Таблица: chat_messages
DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_update" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete" ON public.chat_messages;
DROP POLICY IF EXISTS "messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "messages_update" ON public.chat_messages;
DROP POLICY IF EXISTS "messages_delete" ON public.chat_messages;

-- Таблица: chat_attachments
DROP POLICY IF EXISTS "chat_attachments_select" ON public.chat_attachments;
DROP POLICY IF EXISTS "chat_attachments_insert" ON public.chat_attachments;
DROP POLICY IF EXISTS "attachments_select" ON public.chat_attachments;
DROP POLICY IF EXISTS "attachments_insert" ON public.chat_attachments;

-- Таблица: message_reads
DROP POLICY IF EXISTS "message_reads_select" ON public.message_reads;
DROP POLICY IF EXISTS "message_reads_insert" ON public.message_reads;

-- Сброс старых функций
DROP FUNCTION IF EXISTS public.is_chat_participant(uuid);
DROP FUNCTION IF EXISTS public.fingas_chat_thread_exists(uuid);
DROP FUNCTION IF EXISTS public.fingas_chat_is_participant(uuid, uuid);
DROP FUNCTION IF EXISTS public.fingas_chat_can_access_thread(uuid, uuid);
DROP FUNCTION IF EXISTS public.fingas_can_access_thread(uuid);

-- ----------------------------------------------------------------
-- 2. СОЗДАЕМ ЕДИНУЮ SECURITY DEFINER ФУНКЦИЮ ДЛЯ ПРОВЕРКИ ДОСТУПА
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fingas_can_access_thread(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_thread record;
  v_is_owner boolean;
  v_is_member boolean;
  v_is_station_member boolean;
BEGIN
  -- Если не авторизован — доступа нет
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. Получаем информацию о треде напрямую из БД (в обход RLS)
  SELECT id, organization_id, station_id, type, created_by
    INTO v_thread
  FROM public.chat_threads
  WHERE id = p_thread_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 2. Создатель треда всегда имеет доступ
  IF v_thread.created_by = v_user_id THEN
    RETURN TRUE;
  END IF;

  -- 3. Явный участник треда имеет доступ
  IF EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE thread_id = p_thread_id AND user_id = v_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- 4. Получаем роль пользователя в организации (в обход RLS)
  SELECT (role = 'owner'), (status = 'active' AND can_login = true)
    INTO v_is_owner, v_is_member
  FROM public.profiles
  WHERE user_id = v_user_id AND organization_id = v_thread.organization_id;

  -- 5. Владелец организации имеет доступ ко всем тредам организации
  IF coalesce(v_is_owner, false) THEN
    RETURN TRUE;
  END IF;

  -- 6. Общие чаты организации (доступны всем активным сотрудникам организации)
  IF v_thread.type = 'organization' AND coalesce(v_is_member, false) THEN
    RETURN TRUE;
  END IF;

  -- 7. Чаты АЗС (доступны активным сотрудникам этой АЗС)
  IF v_thread.type = 'station' AND coalesce(v_is_member, false) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = v_user_id AND station_id = v_thread.station_id
    ) INTO v_is_station_member;
    
    IF v_is_station_member THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- Даем права на выполнение функции всем авторизованным пользователям
GRANT EXECUTE ON FUNCTION public.fingas_can_access_thread(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 3. ПРИМЕНЯЕМ RLS-ПОЛИТИКИ НА ТАБЛИЦЫ
-- ----------------------------------------------------------------

-- ================================================================
-- Таблица: chat_threads
-- ================================================================
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

-- Видеть тред: если ты создатель (для INSERT RETURNING) или по общей логике
CREATE POLICY "threads_select"
ON public.chat_threads FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.fingas_can_access_thread(id)
);

-- Создать тред: создатель должен совпадать с авторизованным пользователем
CREATE POLICY "threads_insert"
ON public.chat_threads FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
);

CREATE POLICY "threads_update"
ON public.chat_threads FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR public.fingas_can_access_thread(id)
);

CREATE POLICY "threads_delete"
ON public.chat_threads FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.organization_id = chat_threads.organization_id
      AND p.role = 'owner'
  )
);

-- ================================================================
-- Таблица: chat_participants
-- ================================================================
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants_select"
ON public.chat_participants FOR SELECT TO authenticated
USING (
  public.fingas_can_access_thread(thread_id)
);

CREATE POLICY "participants_insert"
ON public.chat_participants FOR INSERT TO authenticated
WITH CHECK (
  -- Себя добавлять можно всегда, других — если есть доступ к треду
  user_id = auth.uid()
  OR public.fingas_can_access_thread(thread_id)
);

CREATE POLICY "participants_update"
ON public.chat_participants FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
);

CREATE POLICY "participants_delete"
ON public.chat_participants FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.fingas_can_access_thread(thread_id)
);

-- ================================================================
-- Таблица: chat_messages
-- ================================================================
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select"
ON public.chat_messages FOR SELECT TO authenticated
USING (
  public.fingas_can_access_thread(thread_id)
);

CREATE POLICY "messages_insert"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.fingas_can_access_thread(thread_id)
);

CREATE POLICY "messages_update"
ON public.chat_messages FOR UPDATE TO authenticated
USING (
  sender_id = auth.uid()
);

CREATE POLICY "messages_delete"
ON public.chat_messages FOR DELETE TO authenticated
USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.organization_id = chat_messages.organization_id
      AND p.role = 'owner'
  )
);

-- ================================================================
-- Таблица: chat_attachments
-- ================================================================
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select"
ON public.chat_attachments FOR SELECT TO authenticated
USING (
  public.fingas_can_access_thread(thread_id)
);

CREATE POLICY "attachments_insert"
ON public.chat_attachments FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND public.fingas_can_access_thread(thread_id)
);

-- ================================================================
-- Таблица: message_reads
-- ================================================================
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_reads_select"
ON public.message_reads FOR SELECT TO authenticated
USING (
  public.fingas_can_access_thread(thread_id)
);

CREATE POLICY "message_reads_insert"
ON public.message_reads FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

-- Обновляем схему в PostgREST
NOTIFY pgrst, 'reload schema';
