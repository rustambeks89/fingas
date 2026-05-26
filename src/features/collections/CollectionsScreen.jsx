// [CREATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY CODEX - 2026-05-25]
// Project: Fingas
// Purpose: Collection cashflow list + create/approve flow.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft, Banknote, CheckCircle2, Clock3, Plus, ShieldAlert, XCircle } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import {
  confirmCashflow,
  createCashflow,
  listCashflow,
  listWallets,
  rejectCashflow,
} from '@/services/cashflowService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { CASHFLOW_OPERATION, COLLECTION_STATUS, MODULES } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/formatters';
import { isNonEmpty, isPositiveNumber } from '@/lib/validators';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function makeEmptyForm() {
  return {
    date: todayISO(),
    amount: '',
    wallet_from: '',
    wallet_to: '',
    note: '',
  };
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

export default function CollectionsScreen() {
  const { user } = useAuth();
  const { canApprove, canCreate } = usePermissions();
  const [rows, setRows] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(() => makeEmptyForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState('');

  const organizationId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;

  const loadData = useCallback(async () => {
    if (!organizationId) {
      setRows([]);
      setWallets([]);
      setLoading(false);
      return;
    }

    setErr('');
    setLoading(true);
    try {
      const [collectionRows, walletRows] = await Promise.all([
        listCashflow({
          stationId,
          operationType: CASHFLOW_OPERATION.COLLECTION,
          limit: 100,
        }),
        listWallets({ organizationId, active: true }),
      ]);
      setRows(collectionRows);
      setWallets(walletRows);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить инкассации.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, stationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const amount = toNumber(row.amount);
        if (row.status === COLLECTION_STATUS.CONFIRMED) acc.confirmed += amount;
        if (row.status === COLLECTION_STATUS.PENDING) acc.pending += amount;
        return acc;
      },
      { confirmed: 0, pending: 0 },
    );
  }, [rows]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function openCreateSheet() {
    setForm(makeEmptyForm());
    setFormError('');
    setSheetOpen(true);
  }

  function validateForm() {
    if (!organizationId) return 'У пользователя не выбрана организация.';
    if (!isNonEmpty(form.date)) return 'Укажите дату инкассации.';
    if (!isPositiveNumber(form.amount)) return 'Сумма должна быть больше нуля.';
    return '';
  }

  async function submitCollection() {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      await createCashflow({
        organization_id: organizationId,
        station_id: stationId || null,
        date: form.date,
        operation_type: CASHFLOW_OPERATION.COLLECTION,
        payment_type: 'cash',
        wallet_from: form.wallet_from || null,
        wallet_to: form.wallet_to || null,
        cashflow_category: 'Инкассация',
        amount: toNumber(form.amount),
        note: cleanText(form.note),
        status: COLLECTION_STATUS.PENDING,
        created_by: user?.id,
      });
      setSheetOpen(false);
      setForm(makeEmptyForm());
      await loadData();
    } catch (e) {
      setFormError(e?.message ?? 'Не удалось сохранить инкассацию.');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id, action) {
    setActionId(id);
    setErr('');
    try {
      if (action === 'confirm') {
        await confirmCashflow(id);
      } else {
        await rejectCashflow(id);
      }
      await loadData();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось обновить статус.');
    } finally {
      setActionId('');
    }
  }

  return (
    <div>
      <ScreenHeader
        title="Инкассация"
        subtitle="Передача наличности между кошельками"
        right={canCreate(MODULES.COLLECTIONS) ? (
          <Button size="sm" onClick={openCreateSheet}>
            <Plus className="w-4 h-4" />
            Добавить
          </Button>
        ) : null}
      />

      {err && <Card className="text-sm text-danger mb-3">{err}</Card>}
      {!loading && rows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">
              <ArrowRightLeft className="w-3 h-3 text-brand-500" />
              Поток наличности
            </div>
            <div className="mt-1 text-xl font-bold text-ink">{formatMoney(totals.pending)}</div>
            <div className="mt-0.5 text-xs text-ink-muted">Ожидает подтверждения владельцем</div>
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <SummaryCard label="Подтверждено" value={formatMoney(totals.confirmed)} icon={CheckCircle2} />
              <SummaryCard label="Ожидает" value={formatMoney(totals.pending)} icon={Clock3} />
            </div>
          </div>
        </motion.div>
      )}

      {loading && <SkeletonList />}
      {!loading && rows.length === 0 && (
        <EmptyState
          icon={Banknote}
          title="Нет инкассаций"
          description="Создайте инкассацию, когда деньги передаются из кассы."
        />
      )}

      <div className="space-y-3">
        {rows.map((row, index) => (
          <motion.div
            key={row.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
          >
            <CollectionCard
              row={row}
              canApprove={canApprove(MODULES.COLLECTIONS)}
              busy={actionId === row.id}
              onConfirm={() => updateStatus(row.id, 'confirm')}
              onReject={() => updateStatus(row.id, 'reject')}
            />
          </motion.div>
        ))}
      </div>

      <FormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Новая инкассация"
        onSubmit={submitCollection}
        saving={saving}
        error={formError}
      >
        <Input
          label="Дата"
          type="date"
          value={form.date}
          onChange={(e) => patchForm({ date: e.target.value })}
        />
        <Input
          label="Сумма"
          type="number"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={(e) => patchForm({ amount: e.target.value })}
        />
        <Select
          label="Из кошелька"
          value={form.wallet_from}
          onChange={(e) => patchForm({ wallet_from: e.target.value })}
        >
          <option value="">Не выбран</option>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.name}
            </option>
          ))}
        </Select>
        <Select
          label="В кошелек"
          value={form.wallet_to}
          onChange={(e) => patchForm({ wallet_to: e.target.value })}
        >
          <option value="">Не выбран</option>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.name}
            </option>
          ))}
        </Select>
        <Input
          label="Комментарий"
          value={form.note}
          onChange={(e) => patchForm({ note: e.target.value })}
        />
      </FormSheet>
    </div>
  );
}

function CollectionCard({ row, canApprove, busy, onConfirm, onReject }) {
  const statusTone = row.status === COLLECTION_STATUS.CONFIRMED
    ? 'success'
    : row.status === COLLECTION_STATUS.PENDING
      ? 'warning'
      : row.status === COLLECTION_STATUS.REJECTED
        ? 'danger'
        : 'default';
  const showActions = canApprove && row.status === COLLECTION_STATUS.PENDING;
  const statusLabel = row.status === COLLECTION_STATUS.CONFIRMED
    ? 'Подтверждено'
    : row.status === COLLECTION_STATUS.PENDING
      ? 'Ожидает'
      : row.status === COLLECTION_STATUS.REJECTED
        ? 'Отклонено'
        : row.status;
  const StatusIcon = row.status === COLLECTION_STATUS.CONFIRMED
    ? CheckCircle2
    : row.status === COLLECTION_STATUS.REJECTED
      ? XCircle
      : ShieldAlert;

  return (
    <Card hoverable className="!p-3 border border-line/30 hover:border-brand-500/20 transition-all duration-300 rounded-xl bg-bg-card">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
          <Banknote className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-ink-soft font-medium">Инкассация</div>
              <div className="text-base font-bold text-ink mt-0.5">{formatMoney(row.amount)}</div>
            </div>
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2.5">
            <DetailPill icon={Clock3} label={formatDate(row.date)} />
            <DetailPill icon={StatusIcon} label={statusLabel} />
            <DetailPill icon={ArrowRightLeft} label={row.from_wallet?.name ? `Из: ${row.from_wallet.name}` : 'Кошелек списания не выбран'} />
            <DetailPill icon={ArrowRightLeft} label={row.to_wallet?.name ? `В: ${row.to_wallet.name}` : 'Кошелек зачисления не выбран'} />
          </div>

          {row.note && (
            <div className="mt-2.5 rounded-lg bg-bg-soft/40 border border-line/20 px-2.5 py-1.5 text-[11px] text-ink-muted leading-relaxed">
              {row.note}
            </div>
          )}

          {showActions && (
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                loading={busy}
                onClick={onReject}
              >
                Отклонить
              </Button>
              <Button size="sm" className="h-8 text-xs" loading={busy} onClick={onConfirm}>
                Подтвердить
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl bg-bg-card/70 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">
        {Icon ? <Icon className="w-3 h-3 text-brand-500 flex-shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-sm font-bold text-ink mt-0.5 truncate">{value}</div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 rounded-xl bg-bg-card border border-line/30 animate-pulse" />
      ))}
    </div>
  );
}

function DetailPill({ icon: Icon, label }) {
  return (
    <div className="rounded bg-bg-soft/40 border border-line/20 px-2 py-1 text-[11px] text-ink-muted flex items-center gap-1.5 min-w-0">
      <Icon className="w-3 h-3 text-brand-500 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
