// [CREATED BY ANTIGRAVITY CLI - 2026-05-27]
// Project: Fingas
// Purpose: useFormPersistence — сохраняет состояние формы в localStorage на
// каждое изменение и восстанавливает его при монтировании. Решает проблему
// потери данных при сворачивании браузера на мобильных устройствах.
//
// Использование:
//   const [form, setForm, clearDraft] = useFormPersistence('cashflow-income', initialState);
//   // При успешном сохранении вызывай clearDraft() чтобы убрать черновик.

import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'fingas_draft_';

/**
 * Сохраняет состояние формы в localStorage при каждом изменении.
 * Восстанавливает черновик при монтировании компонента.
 * При вызове clearDraft() удаляет сохранённые данные.
 *
 * @param {string} key   — уникальный ключ черновика (например 'cashflow-income')
 * @param {object} init  — начальные значения формы
 * @returns {[object, Function, Function]} [form, setForm, clearDraft]
 */
export function useFormPersistence(key, init) {
  const storageKey = PREFIX + key;

  // При инициализации пытаемся восстановить черновик из localStorage.
  const [form, setFormRaw] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Мержим с init чтобы новые поля (добавленные после) не пропали.
        return { ...init, ...parsed };
      }
    } catch {
      // Ignore parse errors
    }
    return init;
  });

  // Флаг «черновик был восстановлен» — чтобы форма могла показать баннер
  const hasDraft = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Считаем «значимым» черновиком если хотя бы одно поле не пустое
        const hasValue = Object.values(parsed).some(
          (v) => v !== '' && v !== null && v !== undefined
        );
        hasDraft.current = hasValue;
      }
    } catch {
      hasDraft.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Сохраняем в localStorage при каждом изменении формы.
  const setForm = useCallback((updater) => {
    setFormRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }
      return next;
    });
  }, [storageKey]);

  // Очищаем черновик при успешном сохранении.
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
    hasDraft.current = false;
  }, [storageKey]);

  return [form, setForm, clearDraft];
}

/**
 * Возвращает true если в localStorage есть черновик для данного ключа
 * с хотя бы одним непустым полем.
 */
export function hasSavedDraft(key) {
  try {
    const saved = localStorage.getItem(PREFIX + key);
    if (!saved) return false;
    const parsed = JSON.parse(saved);
    return Object.values(parsed).some(
      (v) => v !== '' && v !== null && v !== undefined
    );
  } catch {
    return false;
  }
}

/**
 * Явно очищает черновик (например при отмене формы).
 */
export function clearSavedDraft(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore
  }
}
