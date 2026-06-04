// [CREATED BY CLAUDE CLI - 2026-06-04]
// Project: Fingas
// Purpose: единая защита справочников от жёсткого удаления. Раньше каждый
// экран (FuelTypes, CashflowCategories и т.п.) вызывал DELETE напрямую и
// получал либо FK-ошибку с невнятным текстом, либо тихое каскадное
// удаление зависимых строк. Теперь:
//   1) пробуем точечный COUNT по предполагаемым ссылкам;
//   2) если есть использование → возвращаем диагностику для UI;
//   3) если нет → даём добро на DELETE.

import { supabase } from '@/lib/supabaseClient';

/**
 * Проверить, есть ли ссылки на справочную запись в зависимых таблицах.
 *
 * @param {Object} params
 * @param {Array<{table: string, column: string, value: any, label?: string}>} params.refs
 *   Какие таблицы и колонки проверять. Пример:
 *   [{ table: 'tanks', column: 'fuel_type_id', value: id, label: 'резервуарах' }]
 * @returns {Promise<{used: boolean, counts: Array<{table:string,label:string,count:number}>}>}
 */
export async function inspectDirectoryUsage({ refs }) {
  const results = await Promise.all(
    refs.map(async (ref) => {
      try {
        const { count, error } = await supabase
          .from(ref.table)
          .select('*', { count: 'exact', head: true })
          .eq(ref.column, ref.value);
        if (error) return { table: ref.table, label: ref.label ?? ref.table, count: 0, error: error.message };
        return { table: ref.table, label: ref.label ?? ref.table, count: count ?? 0 };
      } catch (e) {
        return { table: ref.table, label: ref.label ?? ref.table, count: 0, error: e?.message ?? String(e) };
      }
    }),
  );
  const counts = results.filter((r) => r.count > 0);
  return { used: counts.length > 0, counts };
}

/**
 * Сформировать человекочитаемое объяснение, почему нельзя удалить.
 */
export function describeUsage(counts) {
  if (!counts || counts.length === 0) return '';
  return counts
    .map((c) => `${c.label}: ${c.count}`)
    .join(' · ');
}
