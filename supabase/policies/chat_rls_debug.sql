-- ================================================================
-- ДИАГНОСТИКА: запусти это в SQL Editor чтобы увидеть проблему
-- ================================================================

-- 1. Какие политики сейчас висят на chat-таблицах?
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'chat_%'
ORDER BY tablename, policyname;

-- 2. Включён ли RLS?
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname LIKE 'chat_%'
  AND relkind = 'r'
ORDER BY relname;

-- 3. Существует ли колонка created_by?
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'chat_threads'
ORDER BY ordinal_position;

-- 4. Существует ли функция is_chat_participant?
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'is_chat_participant';
