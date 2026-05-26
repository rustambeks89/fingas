// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Cashflow creation form supporting Direct adjustments, printouts, and cash transactions.

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createCashflow, listWallets } from '@/services/cashflowService';
import { listCounterparties } from '@/services/counterpartyService';
import { useAuth } from '@/hooks/useAuth';

const TITLE = {
  income:     'Приход',
  expense:    'Расход',
  transfer:   'Перевод',
  collection: 'Кассовая операция / Инкассация',
  adjustment: 'Корректировка баланса',
};

const CATEGORY_HINTS = {
  income:   'Подработка, прочий доход…',
  expense:  'Аренда, ремонт, связь…',
};

export function CashflowQuickForm({ mode = 'expense', onDone, onCancel }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const today = new Date().toISOString().slice(0, 10);

  const isAdjustment = mode === 'adjustment';

  const [form, setForm] = useState({
    date: today,
    amount: '',
    cashflow_category: isAdjustment ? 'Корректировка' : '',
    wallet_from: '',
    wallet_to: '',
    counterparty_id: '',
    payment_type: 'cash',
    adjustment_type: 'decrease', // 'increase' or 'decrease' for adjustment adjustments
    note: '',
  });
  const [wallets, setWallets] = useState([]);
  const [parties, setParties] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      listWallets({ organizationId: orgId, active: true }).catch(() => []),
      listCounterparties({ organizationId: orgId, active: true }).catch(() => []),
    ]).then(([w, c]) => { setWallets(w); setParties(c); });
  }, [orgId]);

  const isTransfer = mode === 'transfer';
  const isCollection = mode === 'collection';

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setErr('Сумма должна быть > 0'); return; }
    if (isTransfer && (!form.wallet_from || !form.wallet_to)) {
      setErr('Выберите оба кошелька'); return;
    }
    if (isTransfer && form.wallet_from === form.wallet_to) {
      setErr('Кошельки должны быть разные'); return;
    }
    if (isAdjustment && !form.wallet_from) {
      setErr('Выберите кошелёк для корректировки'); return;
    }

    setSaving(true);
    try {
      let op_type = mode;
      if (isAdjustment) {
        op_type = form.adjustment_type === 'increase' ? 'income' : 'expense';
      } else if (isCollection) {
        op_type = 'collection';
      }

      await createCashflow({
        organization_id: orgId,
        station_id: stationId,
        date: form.date,
        operation_type: op_type,
        payment_type: form.payment_type || null,
        cashflow_category: isAdjustment ? 'Корректировка' : (form.cashflow_category || (isCollection ? 'Инкассация' : null)),
        amount: amt,
        wallet_from: isTransfer || op_type === 'expense' || isCollection ? (form.wallet_from || null) : null,
        wallet_to:   isTransfer || op_type === 'income' ? (isAdjustment ? form.wallet_from : (form.wallet_to || null)) : null,
        counterparty_id: form.counterparty_id || null,
        note: form.note || null,
        status: isCollection ? 'pending_confirmation' : 'confirmed',
        created_by: user?.id,
      });
      onDone?.();
    } catch (e2) {
      setErr(e2?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Дата" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
      
      {isAdjustment && (
        <Select label="Направление корректировки" value={form.adjustment_type} onChange={(e) => setForm({ ...form, adjustment_type: e.target.value })}>
          <option value="decrease">Списание (уменьшить баланс)</option>
          <option value="increase">Пополнение (увеличить баланс)</option>
        </Select>
      )}

      <Input label="Сумма" type="number" step="0.01" min="0" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />

      {!isCollection && !isTransfer && !isAdjustment && (
        <Input label="Категория" placeholder={CATEGORY_HINTS[mode] ?? ''} value={form.cashflow_category} onChange={(e) => setForm({ ...form, cashflow_category: e.target.value })} />
      )}

      {isTransfer ? (
        <div className="grid grid-cols-2 gap-3">
          <Select label="Из" value={form.wallet_from} onChange={(e) => setForm({ ...form, wallet_from: e.target.value })}>
            <option value="">—</option>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Select label="В" value={form.wallet_to} onChange={(e) => setForm({ ...form, wallet_to: e.target.value })}>
            <option value="">—</option>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </div>
      ) : (
        <Select
          label={isAdjustment ? 'Кошелёк' : (mode === 'income' ? 'В кошелёк' : 'Из кошелька')}
          value={mode === 'income' && !isAdjustment ? form.wallet_to : form.wallet_from}
          onChange={(e) => setForm({
            ...form,
            ...(mode === 'income' && !isAdjustment ? { wallet_to: e.target.value } : { wallet_from: e.target.value }),
          })}
        >
          <option value="">— Выберите кошелёк —</option>
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      )}

      {!isTransfer && !isAdjustment && (
        <Select label="Контрагент" value={form.counterparty_id} onChange={(e) => setForm({ ...form, counterparty_id: e.target.value })}>
          <option value="">— Не выбран —</option>
          {parties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      )}

      {!isTransfer && !isAdjustment && (
        <Select label="Способ оплаты" value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })}>
          <option value="cash">Наличные</option>
          <option value="card">Карта</option>
          <option value="qr">QR</option>
          <option value="bank">Банк</option>
        </Select>
      )}

      <Input label="Комментарий" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

      {err && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5">{err}</div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Назад</Button>
        <Button type="submit" variant="success" loading={saving}>
          <Check className="w-4 h-4" /> Сохранить
        </Button>
      </div>
    </form>
  );
}

CashflowQuickForm.titleFor = (mode) => TITLE[mode] ?? 'Операция';
