// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Standard form-in-a-bottom-sheet wrapper used by every "Add new …"
// flow (cashflow, fuel supply, suppliers, tanks, taxes, etc.).

import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';

export function FormSheet({
  open,
  onClose,
  title,
  children,
  onSubmit,
  saving = false,
  error = '',
  submitLabel = 'Сохранить',
  onDelete = null,
  deleting = false,
  footer = null,
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        className="space-y-4"
      >
        {children}

        {error && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5">
            {error}
          </div>
        )}
        {footer ?? (
          onDelete ? (
            <div className="space-y-2 pt-1">
              <Button type="submit" variant="success" size="block" loading={saving}>
                {submitLabel}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="danger" size="block" onClick={onDelete} loading={deleting}>
                  Удалить
                </Button>
                <Button type="button" variant="secondary" size="block" onClick={onClose}>
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button type="button" variant="secondary" size="block" onClick={onClose}>
                Отмена
              </Button>
              <Button type="submit" variant="success" size="block" loading={saving}>
                {submitLabel}
              </Button>
            </div>
          )
        )}
      </form>
    </BottomSheet>
  );
}
