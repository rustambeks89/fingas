-- ================================================================
-- Fingas Migrations — Обновление политики RLS для public.profiles (0033)
-- Разрешает сотрудникам видеть своих коллег по АЗС и владельцев организации.
-- Запусти этот SQL-запрос в Supabase Dashboard → SQL Editor!
-- ================================================================

-- 1. Сбрасываем старую ограничительную политику выборки профилей
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;

-- 2. Создаем новую интеллектуальную политику выборки
CREATE POLICY "profiles_self_select"
ON public.profiles FOR SELECT
TO authenticated
USING (
  -- А: Вы всегда можете видеть свой собственный профиль
  user_id = auth.uid()
  OR
  -- Б: Владелец организации всегда может видеть все профили организации
  public.fingas_is_owner()
  OR
  -- В: Вы можете видеть других сотрудников своей организации, если:
  (
    organization_id = public.fingas_current_org()
    AND (
      -- 1. Собеседник является владельцем (чтобы связаться с руководством)
      role = 'owner'
      OR
      -- 2. Собеседник работает на той же АЗС, что и вы
      (station_id IS NOT NULL AND station_id = public.fingas_current_station())
      OR
      -- 3. Вы сами являетесь центральным сотрудником без привязки к конкретной АЗС (видите всех коллег)
      public.fingas_current_station() IS NULL
    )
  )
);

-- Обновляем PostgREST схему
NOTIFY pgrst, 'reload schema';
