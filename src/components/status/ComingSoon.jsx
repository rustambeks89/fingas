// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Placeholder for modules whose UI is not yet implemented but whose
// permissions, RLS, and DB schema already are. Keeps routing intact.

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Sparkles } from 'lucide-react';

export function ComingSoon({ title, subtitle, todo = [] }) {
  return (
    <div>
      <ScreenHeader title={title} subtitle={subtitle} />
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-400 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-ink">В разработке</div>
            <p className="text-sm text-ink-muted mt-1">
              Схема БД, RLS и toggle-permissions для этого модуля уже готовы.
              UI будет добавлен на следующем этапе.
            </p>
            {todo.length > 0 && (
              <ul className="mt-3 text-xs text-ink-soft list-disc pl-4 space-y-1">
                {todo.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
