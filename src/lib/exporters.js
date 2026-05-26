// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Lightweight CSV exporter. No external deps — generates CSV with
// UTF-8 BOM so Excel opens cyrillic correctly, then triggers a browser
// download. Excel/Numbers/Google Sheets all accept this format.

function escapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // RFC 4180 — wrap if contains comma, quote, newline, or semicolon
  if (/[",;\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// rows: array of objects
// columns: [{ key, label, format? }]
export function rowsToCSV(rows, columns) {
  const header = columns.map((c) => escapeCell(c.label ?? c.key)).join(';');
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const raw = c.key.split('.').reduce((acc, k) => acc?.[k], r);
          const value = c.format ? c.format(raw, r) : raw;
          return escapeCell(value);
        })
        .join(';'),
    )
    .join('\r\n');
  // BOM so Excel opens UTF-8 correctly
  return '﻿' + header + '\r\n' + body;
}

export function downloadCSV(filename, rows, columns) {
  if (!rows?.length) return;
  const csv = rowsToCSV(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Convenience date helper for filenames
export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
