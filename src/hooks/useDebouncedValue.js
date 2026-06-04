// [CREATED BY CLAUDE CLI - 2026-06-04]
// Project: Fingas
// Purpose: Возвращает дебаунсенную копию value. Полезно, когда переменная
// меняется часто (например, дата в фильтре редактируется тапами), но
// затратный side-effect (запрос к Supabase) должен выполняться только когда
// пользователь «отпустил» ввод. Default delay = 300 мс.

import { useEffect, useState } from 'react';

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
