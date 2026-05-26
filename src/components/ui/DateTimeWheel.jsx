// [CREATED BY CLAUDE CLI - 2026-05-26]
// Project: Fingas
// Purpose: Композитные wheel-пикеры для даты и времени поверх WheelPicker.

import { useMemo } from 'react';
import { WheelPicker } from './WheelPicker';

const MONTHS_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function daysIn(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function pad2(n) { return String(n).padStart(2, '0'); }

// value: "YYYY-MM-DD" | null. onChange: (str) => void
export function DateWheel({ value, onChange, minYear, maxYear }) {
  const now = new Date();
  const ymd = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return { y, m: m - 1, d };
    }
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  }, [value]);

  const yMin = minYear ?? now.getFullYear() - 5;
  const yMax = maxYear ?? now.getFullYear() + 1;
  const years = useMemo(() => range(yMin, yMax), [yMin, yMax]);
  const months = useMemo(() => range(0, 11), []);
  const days = useMemo(() => range(1, daysIn(ymd.y, ymd.m)), [ymd.y, ymd.m]);

  function emit(next) {
    // если выбранный день вылетел за пределы месяца — обрезаем
    const dMax = daysIn(next.y, next.m);
    const d = Math.min(next.d, dMax);
    onChange?.(`${next.y}-${pad2(next.m + 1)}-${pad2(d)}`);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <WheelPicker
        label="День"
        items={days}
        value={ymd.d}
        onChange={(d) => emit({ ...ymd, d })}
        format={(v) => pad2(v)}
      />
      <WheelPicker
        label="Месяц"
        items={months}
        value={ymd.m}
        onChange={(m) => emit({ ...ymd, m })}
        format={(v) => MONTHS_RU[v]}
      />
      <WheelPicker
        label="Год"
        items={years}
        value={ymd.y}
        onChange={(y) => emit({ ...ymd, y })}
      />
    </div>
  );
}

// value: "HH:mm" | null. step — шаг минут (например 5, 15).
export function TimeWheel({ value, onChange, step = 1 }) {
  const now = new Date();
  const parsed = useMemo(() => {
    if (value && /^\d{2}:\d{2}$/.test(value)) {
      const [h, m] = value.split(':').map(Number);
      return { h, m };
    }
    return { h: now.getHours(), m: Math.round(now.getMinutes() / step) * step };
  }, [value, step]);

  const hours = useMemo(() => range(0, 23), []);
  const minutes = useMemo(() => {
    const out = [];
    for (let m = 0; m < 60; m += step) out.push(m);
    return out;
  }, [step]);

  // приводим выбранную минуту к ближайшему шагу для корректного снапа
  const mSnapped = minutes.reduce(
    (best, x) => (Math.abs(x - parsed.m) < Math.abs(best - parsed.m) ? x : best),
    minutes[0],
  );

  function emit(next) {
    onChange?.(`${pad2(next.h)}:${pad2(next.m)}`);
  }

  return (
    <div className="grid grid-cols-2 gap-2 max-w-[240px] mx-auto">
      <WheelPicker
        label="Часы"
        items={hours}
        value={parsed.h}
        onChange={(h) => emit({ h, m: mSnapped })}
        format={(v) => pad2(v)}
      />
      <WheelPicker
        label="Минуты"
        items={minutes}
        value={mSnapped}
        onChange={(m) => emit({ h: parsed.h, m })}
        format={(v) => pad2(v)}
      />
    </div>
  );
}
