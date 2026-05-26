// [CREATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY CODEX - 2026-05-25]
// Project: Fingas
// Purpose: Supplier registry list + create flow backed by counterparties.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Phone, Plus, Pencil, ScrollText, Truck } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import {
  createCounterparty,
  deleteCounterparty,
  listCounterparties,
  updateCounterparty,
} from '@/services/counterpartyService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatMoney, formatPhone } from '@/lib/formatters';
import { isNonEmpty, isNonNegativeNumber } from '@/lib/validators';

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  inn: '',
  okpo: '',
  address: '',
  legal_address: '',
  director_name: '',
  vat_payer: false,
  vat_number: '',
  balance: '0',
  note: '',
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

export default function SuppliersScreen() {
  const { user } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const organizationId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;

  const loadSuppliers = useCallback(async () => {
    if (!organizationId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setErr('');
    setLoading(true);
    try {
      const data = await listCounterparties({
        organizationId,
        type: 'supplier',
        active: true,
      });
      setRows(data);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить поставщиков.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, supplier) => {
        acc.balance += toNumber(supplier.balance);
        return acc;
      },
      { balance: 0 },
    );
  }, [rows]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function openCreateSheet() {
    setEditingSupplier(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setSheetOpen(true);
  }

  function openEditSheet(supplier) {
    setEditingSupplier(supplier);
    setForm({
      name: supplier.name ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      inn: supplier.inn ?? '',
      okpo: supplier.okpo ?? '',
      address: supplier.address ?? '',
      legal_address: supplier.legal_address ?? '',
      director_name: supplier.director_name ?? '',
      vat_payer: !!supplier.vat_payer,
      vat_number: supplier.vat_number ?? '',
      balance: String(supplier.balance ?? 0),
      note: supplier.note ?? '',
    });
    setFormError('');
    setSheetOpen(true);
  }

  function validateForm() {
    if (!organizationId) return 'У пользователя не выбрана организация.';
    if (!isNonEmpty(form.name)) return 'Укажите название поставщика.';
    if (!isNonNegativeNumber(form.balance)) return 'Начальное сальдо должно быть не меньше нуля.';
    return '';
  }

  async function submitSupplier() {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        organization_id: organizationId,
        station_id: stationId || null,
        type: 'supplier',
        name: form.name.trim(),
        phone: cleanText(form.phone),
        email: cleanText(form.email),
        inn: cleanText(form.inn),
        okpo: cleanText(form.okpo),
        address: cleanText(form.address),
        legal_address: cleanText(form.legal_address),
        director_name: cleanText(form.director_name),
        vat_payer: !!form.vat_payer,
        vat_number: form.vat_payer ? cleanText(form.vat_number) : null,
        balance: toNumber(form.balance),
        note: cleanText(form.note),
        active: true,
      };
      if (editingSupplier) {
        await updateCounterparty(editingSupplier.id, payload);
      } else {
        await createCounterparty(payload);
      }
      setSheetOpen(false);
      setForm(EMPTY_FORM);
      setEditingSupplier(null);
      await loadSuppliers();
    } catch (e) {
      setFormError(e?.message ?? 'Не удалось сохранить поставщика.');
    } finally {
      setSaving(false);
    }
  }

  async function removeSupplier() {
    if (!editingSupplier) return;
    if (!confirm(`Удалить поставщика «${editingSupplier.name}»?`)) return;
    setDeleting(true);
    setFormError('');
    try {
      await deleteCounterparty(editingSupplier.id);
      setSheetOpen(false);
      setEditingSupplier(null);
      setForm(EMPTY_FORM);
      await loadSuppliers();
    } catch (e) {
      setFormError(e?.message ?? 'Не удалось удалить поставщика.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <ScreenHeader
        title="Поставщики"
        subtitle="Контрагенты и текущее сальдо по поставкам"
        right={canCreate(MODULES.SUPPLIERS) ? (
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
              <Truck className="w-3 h-3 text-brand-500" />
              Реестр поставщиков
            </div>
            <div className="mt-1 text-xl font-bold text-ink">{formatMoney(totals.balance)}</div>
            <div className="mt-0.5 text-xs text-ink-muted">
              Текущее сальдо по {rows.length} контрагентам
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <SummaryCard label="Поставщики" value={rows.length} />
              <SummaryCard label="Активные" value={rows.filter((row) => row.active).length} />
            </div>
          </div>
        </motion.div>
      )}

      {loading && <SkeletonList />}
      {!loading && rows.length === 0 && (
        <EmptyState
          icon={Truck}
          title="Нет поставщиков"
          description="Добавьте поставщика для учета поступлений топлива и оплат."
        />
      )}

      <div className="space-y-3">
        {rows.map((supplier, index) => (
          <motion.div
            key={supplier.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
          >
            <SupplierCard
              supplier={supplier}
              canEdit={canEdit(MODULES.SUPPLIERS)}
              onEdit={() => openEditSheet(supplier)}
            />
          </motion.div>
        ))}
      </div>

      <FormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingSupplier ? 'Редактировать поставщика' : 'Новый поставщик'}
        onSubmit={submitSupplier}
        saving={saving}
        error={formError}
        onDelete={editingSupplier && canDelete(MODULES.SUPPLIERS) ? removeSupplier : null}
        deleting={deleting}
      >
        <Input
          label="Название"
          value={form.name}
          onChange={(e) => patchForm({ name: e.target.value })}
          placeholder="ОсОО «НК Этма»"
          required
        />

        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold pt-1">Реквизиты</div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="ИНН"
            value={form.inn}
            onChange={(e) => patchForm({ inn: e.target.value })}
            placeholder="14 цифр"
          />
          <Input
            label="ОКПО"
            value={form.okpo}
            onChange={(e) => patchForm({ okpo: e.target.value })}
            placeholder="8 цифр"
          />
        </div>
        <Input
          label="Руководитель"
          value={form.director_name}
          onChange={(e) => patchForm({ director_name: e.target.value })}
          placeholder="ФИО, должность"
        />
        <Input
          label="Юридический адрес"
          value={form.legal_address}
          onChange={(e) => patchForm({ legal_address: e.target.value })}
          placeholder="Бишкек, ул. ..."
        />
        <Input
          label="Фактический адрес"
          value={form.address}
          onChange={(e) => patchForm({ address: e.target.value })}
          hint="Если совпадает с юридическим — можно не заполнять"
        />

        <label className="flex items-center gap-2 text-sm text-ink pt-1">
          <input
            type="checkbox"
            checked={form.vat_payer}
            onChange={(e) => patchForm({ vat_payer: e.target.checked })}
            className="w-4 h-4 rounded border-line/50"
          />
          Плательщик НДС
        </label>
        {form.vat_payer && (
          <Input
            label="Регистрационный № НДС"
            value={form.vat_number}
            onChange={(e) => patchForm({ vat_number: e.target.value })}
          />
        )}

        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold pt-2">Контакты</div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Телефон"
            value={form.phone}
            onChange={(e) => patchForm({ phone: e.target.value })}
            placeholder="+996"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => patchForm({ email: e.target.value })}
          />
        </div>

        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold pt-2">Сальдо</div>
        <Input
          label="Начальное сальдо"
          type="number"
          min="0"
          step="0.01"
          value={form.balance}
          onChange={(e) => patchForm({ balance: e.target.value })}
          hint="Положительное значение — мы должны поставщику. Банковские счета добавляются в карточке поставщика."
        />
        <Input
          label="Комментарий"
          value={form.note}
          onChange={(e) => patchForm({ note: e.target.value })}
        />
      </FormSheet>
    </div>
  );
}

function SupplierCard({ supplier, canEdit, onEdit }) {
  const balance = toNumber(supplier.balance);
  const tone = balance > 0 ? 'warning' : 'success';

  return (
    <Card hoverable className="!p-3.5 rounded-xl border border-line/30 bg-bg-card shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
          <Truck className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="text-xs font-bold text-ink truncate">{supplier.name}</div>
                <Badge tone={supplier.active ? 'success' : 'default'}>
                  {supplier.active ? 'Активен' : 'Архив'}
                </Badge>
              </div>
              <div className="text-[10px] text-ink-soft mt-0.5">
                Поставщик
              </div>
            </div>
            <div className="flex items-start gap-2 flex-shrink-0">
              <div className="text-right">
                <div className={balance > 0 ? 'text-sm font-bold text-warning leading-tight' : 'text-sm font-bold text-success leading-tight'}>
                  {formatMoney(balance)}
                </div>
                <div className="text-[10px] text-ink-soft">сальдо</div>
              </div>
              {canEdit && (
                <Button size="sm" variant="secondary" className="!h-8 !w-8 !px-0" onClick={onEdit}>
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2.5">
            <DetailPill icon={Phone} label={supplier.phone ? formatPhone(supplier.phone) : 'Телефон не указан'} />
            <DetailPill icon={ScrollText} label={supplier.inn ? `ИНН ${supplier.inn}` : 'ИНН не указан'} />
            <DetailPill icon={MapPin} label={supplier.address || 'Адрес не указан'} wide />
          </div>

          {supplier.note && (
            <div className="mt-2.5 rounded-lg bg-bg-soft/40 border border-line/20 px-2.5 py-1.5 text-[11px] text-ink-muted leading-relaxed">
              {supplier.note}
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-1.5">
            <Badge tone={tone}>
              {balance > 0 ? 'Есть задолженность' : 'Без долга'}
            </Badge>
            {supplier.email && <Badge tone="default">{supplier.email}</Badge>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl bg-bg-card/70 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className="text-xs font-bold text-ink mt-0.5 truncate">{value}</div>
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

function DetailPill({ icon: Icon, label, wide = false }) {
  return (
    <div className={`rounded bg-bg-soft/40 border border-line/20 px-2 py-1 text-[11px] text-ink-muted flex items-center gap-1.5 min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
      <Icon className="w-3 h-3 text-brand-500 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
