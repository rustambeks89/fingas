import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Clock3 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BottomSheet } from '@/components/bottom-sheets/BottomSheet';
import { Button } from '@/components/ui/Button';

const MONTHS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseDateValue(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    };
  }
  const [year, month, day] = String(value).split('-').map(Number);
  return { year, month, day };
}

function parseTimeValue(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(String(value))) {
    const now = new Date();
    return {
      hour: now.getHours(),
      minute: now.getMinutes(),
    };
  }
  const [hour, minute] = String(value).split(':').map(Number);
  return { hour, minute };
}

function formatDateValue(parts) {
  if (!parts?.year || !parts?.month || !parts?.day) return '';
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function formatTimeValue(parts) {
  if (parts?.hour == null || parts?.minute == null) return '';
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function formatDateDisplay(value) {
  if (!value) return '';
  const parts = parseDateValue(value);
  return `${parts.day} ${MONTHS_RU[parts.month - 1]} ${parts.year}`;
}

function formatTimeDisplay(value) {
  if (!value) return '';
  const parts = parseTimeValue(value);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function emitChange(onChange, value) {
  onChange?.({
    target: { value },
    currentTarget: { value },
  });
}

function WheelColumn({ items, selectedValue, onSelect, className }) {
  return (
    <div className={cn('relative flex-1 min-w-0', className)}>
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-11 rounded-2xl border border-brand-500/20 bg-brand-500/8" />
      <div className="h-52 overflow-y-auto snap-y snap-mandatory no-scrollbar px-1 py-[4.5rem]">
        <div className="space-y-1">
          {items.map((item) => {
            const active = item.value === selectedValue;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onSelect(item.value)}
                className={cn(
                  'w-full h-10 snap-center rounded-xl text-center transition-all duration-150',
                  active
                    ? 'text-ink font-semibold'
                    : 'text-ink-soft hover:text-ink',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WheelDateInput({
  label,
  hint,
  error,
  className,
  value,
  onChange,
  placeholder,
  disabled,
  required,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parseDateValue(value));

  useEffect(() => {
    setDraft(parseDateValue(value));
  }, [value]);

  const yearRange = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const selectedYear = parseDateValue(value).year;
    const start = Math.min(currentYear - 10, selectedYear - 2);
    const end = Math.max(currentYear + 10, selectedYear + 2);
    return Array.from({ length: end - start + 1 }, (_, index) => {
      const year = start + index;
      return { value: year, label: String(year) };
    });
  }, [value]);

  const dayOptions = useMemo(() => {
    const max = daysInMonth(draft.year, draft.month);
    return Array.from({ length: max }, (_, index) => ({
      value: index + 1,
      label: String(index + 1),
    }));
  }, [draft.month, draft.year]);

  useEffect(() => {
    const max = daysInMonth(draft.year, draft.month);
    if (draft.day > max) {
      setDraft((current) => ({ ...current, day: max }));
    }
  }, [draft.day, draft.month, draft.year]);

  function confirm() {
    emitChange(onChange, formatDateValue(draft));
    setOpen(false);
  }

  return (
    <>
      <label className="block">
        {label && (
          <span className="block text-[13px] font-semibold text-ink mb-1.5">{label}</span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={cn(
            'w-full h-12 px-4 rounded-2xl bg-bg-elevated/70 border border-line/50 text-[15px] transition-all duration-200',
            'flex items-center justify-between gap-3 text-left',
            'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-danger focus:border-danger focus:ring-danger/15',
            className,
          )}
        >
          <span className={cn(value ? 'text-ink' : 'text-ink-soft')}>
            {value ? formatDateDisplay(value) : (placeholder || 'Выберите дату')}
          </span>
          <div className="flex items-center gap-2 text-ink-soft flex-shrink-0">
            <CalendarDays className="w-4 h-4" />
            <ChevronDown className="w-4 h-4" />
          </div>
        </button>
        <input type="text" value={value ?? ''} readOnly required={required} className="sr-only" tabIndex={-1} />
        {hint && !error && (
          <span className="block text-[11px] text-ink-soft mt-1.5">{hint}</span>
        )}
        {error && (
          <span className="block text-[11px] text-danger mt-1.5 font-medium">{error}</span>
        )}
      </label>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label || 'Выбор даты'}>
        <div className="space-y-4">
          <div className="grid grid-cols-[0.9fr_1.2fr_1fr] gap-2">
            <WheelColumn
              items={dayOptions}
              selectedValue={draft.day}
              onSelect={(day) => setDraft((current) => ({ ...current, day }))}
            />
            <WheelColumn
              items={MONTHS_RU.map((month, index) => ({ value: index + 1, label: month }))}
              selectedValue={draft.month}
              onSelect={(month) => setDraft((current) => ({ ...current, month }))}
            />
            <WheelColumn
              items={yearRange}
              selectedValue={draft.year}
              onSelect={(year) => setDraft((current) => ({ ...current, year }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" size="block" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" variant="success" size="block" onClick={confirm}>
              Готово
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

function WheelTimeInput({
  label,
  hint,
  error,
  className,
  value,
  onChange,
  placeholder,
  disabled,
  required,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parseTimeValue(value));

  useEffect(() => {
    setDraft(parseTimeValue(value));
  }, [value]);

  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, index) => ({ value: index, label: pad2(index) })),
    [],
  );
  const minuteOptions = useMemo(
    () => Array.from({ length: 60 }, (_, index) => ({ value: index, label: pad2(index) })),
    [],
  );

  function confirm() {
    emitChange(onChange, formatTimeValue(draft));
    setOpen(false);
  }

  return (
    <>
      <label className="block">
        {label && (
          <span className="block text-[13px] font-semibold text-ink mb-1.5">{label}</span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={cn(
            'w-full h-12 px-4 rounded-2xl bg-bg-elevated/70 border border-line/50 text-[15px] transition-all duration-200',
            'flex items-center justify-between gap-3 text-left',
            'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-danger focus:border-danger focus:ring-danger/15',
            className,
          )}
        >
          <span className={cn(value ? 'text-ink' : 'text-ink-soft')}>
            {value ? formatTimeDisplay(value) : (placeholder || 'Выберите время')}
          </span>
          <div className="flex items-center gap-2 text-ink-soft flex-shrink-0">
            <Clock3 className="w-4 h-4" />
            <ChevronDown className="w-4 h-4" />
          </div>
        </button>
        <input type="text" value={value ?? ''} readOnly required={required} className="sr-only" tabIndex={-1} />
        {hint && !error && (
          <span className="block text-[11px] text-ink-soft mt-1.5">{hint}</span>
        )}
        {error && (
          <span className="block text-[11px] text-danger mt-1.5 font-medium">{error}</span>
        )}
      </label>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label || 'Выбор времени'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <WheelColumn
              items={hourOptions}
              selectedValue={draft.hour}
              onSelect={(hour) => setDraft((current) => ({ ...current, hour }))}
            />
            <WheelColumn
              items={minuteOptions}
              selectedValue={draft.minute}
              onSelect={(minute) => setDraft((current) => ({ ...current, minute }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" size="block" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" variant="success" size="block" onClick={confirm}>
              Готово
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

export function Input({
  label,
  hint,
  error,
  className,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  required,
  ...rest
}) {
  if (type === 'date') {
    return (
      <WheelDateInput
        label={label}
        hint={hint}
        error={error}
        className={className}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />
    );
  }

  if (type === 'time') {
    return (
      <WheelTimeInput
        label={label}
        hint={hint}
        error={error}
        className={className}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />
    );
  }

  return (
    <label className="block">
      {label && (
        <span className="block text-[13px] font-semibold text-ink mb-1.5">{label}</span>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={cn(
          'block w-full h-12 px-4 rounded-2xl bg-bg-elevated/70',
          'border border-line/50 text-[15px] text-ink placeholder:text-ink-soft',
          'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-all duration-200',
          error && 'border-danger focus:border-danger focus:ring-danger/15',
          className,
        )}
        {...rest}
      />
      {hint && !error && (
        <span className="block text-[11px] text-ink-soft mt-1.5">{hint}</span>
      )}
      {error && (
        <span className="block text-[11px] text-danger mt-1.5 font-medium">{error}</span>
      )}
    </label>
  );
}

export function Select({ label, hint, error, className, children, ...rest }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[13px] font-semibold text-ink mb-1.5">{label}</span>
      )}
      <select
        className={cn(
          'block w-full h-12 px-4 rounded-2xl bg-bg-elevated/70',
          'border border-line/50 text-[15px] text-ink transition-all duration-200',
          'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
          error && 'border-danger focus:border-danger focus:ring-danger/15',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {hint && !error && (
        <span className="block text-[11px] text-ink-soft mt-1.5">{hint}</span>
      )}
      {error && (
        <span className="block text-[11px] text-danger mt-1.5 font-medium">{error}</span>
      )}
    </label>
  );
}
