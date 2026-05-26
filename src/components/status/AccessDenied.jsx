// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Shown when the toggle-permissions deny access to a module/screen.

import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export function AccessDenied({ reason = 'У вас нет доступа к этому разделу.' }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-full bg-bg-elevated border border-line flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-ink-muted" />
        </div>
        <div className="text-lg font-semibold text-ink mb-1">Нет доступа</div>
        <p className="text-sm text-ink-muted">{reason}</p>
        <p className="text-xs text-ink-soft mt-4">
          Доступы выдаются владельцем через раздел «Сотрудники» → «Доступы».
        </p>
      </Card>
    </div>
  );
}
