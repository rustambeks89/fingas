// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Per-supplier ledger — supplies (debit), payments (credit), running
// balance, big "Оплатить" CTA. Open by deep-link: /suppliers/:id

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, CreditCard, Download, Truck } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import {
  getCounterparty,
  getSupplierStatement,
  paySupplier,
} from '@/services/counterpartyService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatDate, formatMoney, formatPhone } from '@/lib/formatters';
import { downloadCSV, todayStamp } from '@/lib/exporters';

export default function SupplierDetailScreen() {
  const { user } = useAuth();
  const { canCreate, canExport } = usePermissions();
  const navigate = useNavigate();
  const { id } = useParams();

  const [supplier, setSupplier] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [payOpen, setPayOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [s, ev] = await Promise.all([
        getCounterparty(id),
        getSupplierStatement(id),
      ]);
      setSupplier(s);
      setEvents(ev);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  function exportStatement() {
    if (!events.length) return;
    downloadCSV(`supplier-${supplier?.name ?? id}-${todayStamp()}`, events, [
      { key: 'date', label: 'Дата' },
      { key: 'kind', label: 'Тип', format: (k) => k === 'supply' ? 'Поставка' : 'Оплата' },
      { key: 'detail', label: 'Описание' },
      { key: 'amount', label: 'Сумма' },
      { key: 'running', label: 'Сальдо' },
    ]);
  }

  if (loading && !supplier) {
    return <div className="text-center text-ink-soft py-12">Загрузка…</div>;
  }
  if (!supplier) {
    return <div className="text-center text-ink-soft py-12">Поставщик не найден.</div>;
  }

  const balance = Number(supplier.balance ?? 0);

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-ink-muted text-sm mb-2"
      >
        <ChevronLeft className="w-4 h-4" /> Назад
      </button>

      <ScreenHeader
        title={supplier.name}
        subtitle={supplier.inn ? `ИНН ${supplier.inn}` : 'Поставщик'}
        right={(
          <div className="flex items-center gap-2">
            {canExport(MODULES.SUPPLIERS) && events.length > 0 && (
              <Button size="sm" variant="secondary" onClick={exportStatement}>
                <Download className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Лицевой счёт</div>
          <div className="mt-1 text-xl font-bold text-ink">{formatMoney(Math.abs(balance))}</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {balance > 0 ? 'Долг перед поставщиком' : balance < 0 ? 'Переплата поставщику' : 'Баланс закрыт'}
          </div>
          {(supplier.phone || supplier.email || supplier.address) && (
            <div className="mt-2 text-[10px] text-ink-soft leading-normal space-y-0.5 border-t border-line/25 pt-2">
              {supplier.phone && <div>Тел: {formatPhone(supplier.phone)}</div>}
              {supplier.email && <div>Email: {supplier.email}</div>}
              {supplier.address && <div>Адрес: {supplier.address}</div>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <MiniCard label="Поставки" value={events.filter((e) => e.kind === 'supply').length} />
            <MiniCard label="Оплаты" value={events.filter((e) => e.kind === 'payment').length} />
            <MiniCard label="Сальдо" value={formatMoney(balance)} />
          </div>
        </div>
        {canCreate(MODULES.SUPPLIERS) && (
          <Button size="block" className="mt-3.5 h-9 text-xs" onClick={() => setPayOpen(true)}>
            <CreditCard className="w-4 h-4" /> Оплатить
          </Button>
        )}
      </motion.div>

      {err && (
        <div className="mb-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      )}

      {/* LEDGER */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft">Взаиморасчёт</div>
        <Badge tone="default">{events.length}</Badge>
      </div>
      {events.length === 0 && (
        <EmptyState
          icon={Truck}
          title="История пуста"
          description="Поставки и оплаты появятся здесь автоматически."
        />
      )}
      <div className="space-y-2">
        {events.map((e, i) => (
          <motion.div
            key={`${e.kind}-${e.id}`}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
          >
            <Card className="!p-4 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className={
                  'w-10 h-10 rounded-2xl border flex items-center justify-center flex-shrink-0 ' +
                  (e.kind === 'supply'
                    ? 'bg-warning/10 border-warning/30 text-warning'
                    : 'bg-success/10 border-success/30 text-success')
                }>
                  {e.kind === 'supply' ? <Truck className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink truncate">
                    {e.kind === 'supply' ? 'Поставка' : 'Оплата'}
                  </div>
                  <div className="text-xs text-ink-muted truncate">
                    {formatDate(e.date)}{e.doc ? ` · ${e.doc}` : ''}
                  </div>
                  {e.detail && (
                    <div className="text-[11px] text-ink-soft truncate">{e.detail}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className={'font-semibold ' + (e.amount >= 0 ? 'text-warning' : 'text-success')}>
                    {e.amount >= 0 ? '+' : '−'}{formatMoney(Math.abs(e.amount))}
                  </div>
                  <Badge>{formatMoney(e.running)}</Badge>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <PaySheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onDone={async () => { setPayOpen(false); await reload(); }}
        supplierId={id}
        suggested={balance > 0 ? balance : 0}
        organizationId={user?.profile?.organization_id}
        stationId={user?.profile?.station_id}
        userId={user?.id}
      />
    </div>
  );
}

function MiniCard({ label, value }) {
  return (
    <div className="rounded-xl bg-bg-card/75 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className="mt-0.5 text-xs font-bold text-ink truncate">{value}</div>
    </div>
  );
}

function PaySheet({ open, onClose, onDone, supplierId, suggested, organizationId, stationId, userId }) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setAmount(suggested > 0 ? String(suggested) : '');
      setDate(today);
      setNote('');
      setErr('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggested]);

  async function submit() {
    setSaving(true);
    setErr('');
    try {
      const num = Number(amount);
      if (!num || num <= 0) throw new Error('Сумма должна быть > 0');
      await paySupplier({
        supplierId, organizationId, stationId, userId,
        amount: num, date, note,
      });
      onDone?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet open={open} onClose={onClose} title="Оплата поставщику" onSubmit={submit} saving={saving} error={err}>
      <Input label="Сумма" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <Input label="Дата" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <Input label="Комментарий" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="text-xs text-ink-soft">
        Запись попадёт в supplier_payments + автоматически отразится в cashflow и
        уменьшит сальдо поставщика (через триггер 0010).
      </div>
    </FormSheet>
  );
}
