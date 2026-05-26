// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Friendly first-run screen when Supabase env vars are missing.
// Walks the user through copying .env.example -> .env.local.

import { Database, Check, Copy } from 'lucide-react';
import { useState } from 'react';

export default function SetupScreen() {
  const [copied, setCopied] = useState('');

  function copy(text, id) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(''), 1500);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-bg via-bg to-bg-soft">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-3xl bg-brand-500/15 border border-brand-500/30 items-center justify-center mb-4">
            <Database className="w-7 h-7 text-brand-400" />
          </div>
          <div className="text-3xl font-bold tracking-tight">fingas</div>
          <p className="text-ink-muted mt-2">Подключите Supabase, чтобы начать</p>
        </div>

        <div className="rounded-3xl bg-bg-card border border-line p-6 space-y-5">
          <Step n={1} title="Создайте проект в Supabase">
            Откройте{' '}
            <a className="text-brand-400" href="https://supabase.com" target="_blank" rel="noreferrer">
              supabase.com
            </a>{' '}
            и создайте новый проект (бесплатный тариф подходит).
          </Step>

          <Step n={2} title="Скопируйте URL и anon key">
            Settings → API → Project URL и anon public key.
          </Step>

          <Step n={3} title="Создайте файл .env.local">
            <div className="mt-2 space-y-2">
              <CodeCopy
                id="env"
                code={`VITE_SUPABASE_URL=https://YOUR.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY`}
                copied={copied === 'env'}
                onCopy={(t) => copy(t, 'env')}
              />
              <div className="text-xs text-ink-soft">
                Файл должен лежать в корне проекта рядом с package.json. Затем
                перезапустите <code className="text-brand-400">npm run dev</code>.
              </div>
            </div>
          </Step>

          <Step n={4} title="Примените миграции">
            Откройте Supabase → SQL Editor и по очереди вставьте файлы из{' '}
            <code className="text-brand-400">supabase/migrations/</code>{' '}
            по порядку по номеру. Все скрипты идемпотентны.
          </Step>

          <Step n={5} title="Отключите Confirm email">
            Для потока Fingas оставьте только одобрение владельцем: в{' '}
            <code className="text-brand-400">Authentication → Settings</code>{' '}
            отключите <code className="text-brand-400">Confirm email</code>.
          </Step>
        </div>

        <p className="text-center text-xs text-ink-soft mt-6">
          После настройки страница должна автоматически открыть экран входа.
        </p>
      </div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-400 font-bold flex items-center justify-center">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">{title}</div>
        <div className="text-sm text-ink-muted mt-1">{children}</div>
      </div>
    </div>
  );
}

function CodeCopy({ code, copied, onCopy }) {
  return (
    <div className="relative">
      <pre className="text-xs bg-bg-elevated border border-line rounded-2xl p-3 overflow-x-auto text-ink whitespace-pre">
        {code}
      </pre>
      <button
        onClick={() => onCopy(code)}
        className="absolute top-2 right-2 w-8 h-8 rounded-xl bg-bg-card border border-line text-ink-muted hover:text-ink flex items-center justify-center"
        aria-label="Скопировать"
      >
        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}
