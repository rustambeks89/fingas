// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Shown after sign-in when there is a session but no public.profiles
// row (or the table itself is missing). Common causes: migrations not yet
// applied to this Supabase project, or this auth user simply hasn't been
// onboarded via the registration flow.

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Logo';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';

export default function AccountSetupScreen() {
  const { user, profileError, refresh, signOut } = useAuth();

  const looksLikeMissingTable =
    typeof profileError === 'string' &&
    /could not find the table|relation .* does not exist|PGRST205/i.test(profileError);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-bg via-bg to-bg-soft">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 flex flex-col items-center justify-center">
          <Wordmark className="text-3xl font-black mx-auto mb-3" />
          <div className="text-2xl font-bold tracking-tight">Аккаунт не готов</div>
          <p className="text-ink-muted mt-1.5 text-sm">
            Вход выполнен, но профиль в БД отсутствует.
          </p>
        </div>

        <div className="rounded-3xl bg-bg-card border border-warning/30 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-warning/15 border border-warning/30 text-warning flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-ink">
                {looksLikeMissingTable
                  ? 'База данных Fingas не инициализирована'
                  : 'Профиль не найден'}
              </div>
              <p className="text-sm text-ink-muted mt-1">
                {looksLikeMissingTable ? (
                  <>
                    База данных Fingas не настроена. Пожалуйста, убедитесь, что все необходимые миграции и конфигурации применены.
                  </>
                ) : (
                  <>
                    Ваш аккаунт существует, но личный профиль сотрудника не найден в системе. Пройдите повторную регистрацию или попросите владельца создать профиль.
                  </>
                )}
              </p>
              {profileError && (
                <pre className="mt-3 text-[11px] text-ink-soft bg-bg-elevated rounded-xl p-2 overflow-auto max-h-24 whitespace-pre-wrap">
                  {profileError}
                </pre>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-2.5 text-sm">
            <div className="font-semibold text-ink">Что делать:</div>
            <ol className="list-decimal pl-5 space-y-1.5 text-ink-muted">
              <li>
                Откройте Supabase → SQL Editor и примените все файлы из{' '}
                <code className="text-brand-400">supabase/migrations/</code> по
                порядку по номеру.
              </li>
              <li>
                Или укажите свой Supabase в{' '}
                <code className="text-brand-400">.env.local</code> и
                перезапустите <code className="text-brand-400">npm run dev</code>.
              </li>
              <li>
                Затем нажмите «Обновить» ниже. Если профиль есть — войдёте
                автоматически.
              </li>
            </ol>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-5">
          <Button variant="secondary" onClick={refresh}>
            <RefreshCw className="w-4 h-4" /> Обновить
          </Button>
          <Button variant="danger" onClick={signOut}>
            <LogOut className="w-4 h-4" /> Выйти
          </Button>
        </div>

        {user?.email && (
          <div className="text-center text-xs text-ink-soft mt-4">
            Вы вошли как {user.email}
          </div>
        )}
      </div>
    </div>
  );
}
