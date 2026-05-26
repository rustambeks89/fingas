// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Display formatters — money, liters, dates, phone, percent.

import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const LITER_FMT = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
});

export function formatMoney(value, currency = 'сом') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return `0 ${currency}`;
  }
  return `${MONEY_FMT.format(Number(value))} ${currency}`;
}

export function formatLiters(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0 л';
  }
  return `${LITER_FMT.format(Number(value))} л`;
}

export function formatPercent(value, fractionDigits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0%';
  }
  return `${Number(value).toFixed(fractionDigits)}%`;
}

// POS пишет TransactionDatetime/synced_at в местное время. Иногда строка
// приходит с трейлом "Z" или "+00:00", и JS добавляет ещё одно tz-смещение
// при new Date() — час уезжает на размер часового пояса. Берём как «настенное
// время» — срезаем хвост и парсим строку как is.
export function parsePosDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const cleaned = String(value).replace(/Z$/, '').replace(/[+-]\d{2}:?\d{2}$/, '');
  const d = parseISO(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso, pattern = 'd MMM yyyy') {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'string' ? parsePosDate(iso) : iso;
    if (!d) return '—';
    return format(d, pattern);
  } catch {
    return '—';
  }
}

export function formatDateTime(iso) {
  return formatDate(iso, 'd MMM yyyy, HH:mm');
}

export function formatTime(iso) {
  return formatDate(iso, 'HH:mm');
}

export function formatRelative(iso) {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'string' ? parsePosDate(iso) : iso;
    if (!d) return '—';
    return formatDistanceToNowStrict(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

export function formatPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('996')) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  return phone;
}

export function initials(fullName) {
  if (!fullName) return '?';
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
