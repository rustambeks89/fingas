// Purpose: Wallets registry moved from settings into directories.

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Wallet as WalletIcon } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { listWallets, createWallet, updateWallet, deleteWallet } from '@/services/cashflowService';
import { listStations } from '@/services/stationService';

export default function WalletsScreen() {
  const { user } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const orgId = user?.profile?.organization_id;
  const canManage = canCreate(MODULES.SETTINGS) || canEdit(MODULES.SETTINGS);
  const canRemove = canDelete(MODULES.SETTINGS);

  const [rows, setRows] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);

  const reload = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setStations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const [walletRows, stationRows] = await Promise.all([
        listWallets({ organizationId: orgId }).catch(() => []),
        listStations(orgId).catch(() => []),
      ]);
      setRows(walletRows);
      setStations(stationRows);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить кошельки.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="space-y-3 pb-2">
      <ScreenHeader
        title="Кошельки"
        subtitle="Справочник касс, сейфов и счетов"
        right={canManage ? (
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus className="w-4 h-4" /> Добавить
          </Button>
        ) : null}
      />

      {err && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-bg-card border border-line/40 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="!p-4">
          <EmptyState
            icon={WalletIcon}
            title="Кошельков нет"
            description="Добавьте кассу АЗС, сейф, карт-счёт или р/счёт."
          />
        </Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={!canManage}
              onClick={() => setEditing(row)}
              className={
                'w-full rounded-2xl bg-bg-card border border-line/60 px-4 py-3 flex items-center gap-3 min-w-0 hover:border-brand-500/40 transition-colors text-left disabled:cursor-default ' +
                (!row.active ? 'opacity-60' : '')
              }
            >
              <div className="w-9 h-9 rounded-xl border border-line/40 bg-bg-elevated flex items-center justify-center flex-shrink-0 text-brand-500">
                <WalletIcon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">{row.name}</div>
                  <Badge tone={row.active ? 'success' : 'default'}>{row.active ? 'active' : 'off'}</Badge>
                </div>
                <div className="text-[11px] text-ink-muted truncate">{row.kind} · {row.currency}</div>
              </div>
              <Pencil className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      <WalletSheet
        open={!!editing}
        wallet={editing?.id ? editing : null}
        organizationId={orgId}
        stations={stations}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await reload(); }}
        canDelete={canRemove}
      />
    </div>
  );
}

function WalletSheet({ open, wallet, organizationId, stations, onClose, onSaved, canDelete }) {
  const isEdit = !!wallet;
  const [form, setForm] = useState({ name: '', kind: 'cash_register', currency: 'KGS', station_id: '', active: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (wallet) {
      setForm({
        name: wallet.name ?? '',
        kind: wallet.kind ?? 'cash_register',
        currency: wallet.currency ?? 'KGS',
        station_id: wallet.station_id ?? '',
        active: wallet.active ?? true,
      });
    } else {
      setForm({ name: '', kind: 'cash_register', currency: 'KGS', station_id: '', active: true });
    }
    setErr('');
  }, [open, wallet]);

  async function submit() {
    setSaving(true);
    setErr('');
    try {
      const payload = {
        station_id: form.station_id || null,
        name: form.name,
        kind: form.kind,
        currency: form.currency,
        active: !!form.active,
      };
      if (isEdit) {
        await updateWallet(wallet.id, payload);
      } else {
        await createWallet({ organization_id: organizationId, ...payload });
      }
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function removeWallet() {
    if (!isEdit) return;
    if (!confirm(`Отключить кошелёк «${wallet.name}»?`)) return;
    setDeleting(true);
    setErr('');
    try {
      await deleteWallet(wallet.id);
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось отключить кошелёк.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Редактировать кошелёк' : 'Новый кошелёк'}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={isEdit ? 'Сохранить' : 'Создать'}
      footer={isEdit && canDelete ? (
        <div className="space-y-2.5 pt-1.5">
          <Button type="submit" variant="success" size="block" loading={saving}>
            Сохранить
          </Button>
          <Button type="button" variant="danger" size="block" onClick={removeWallet} loading={deleting}>
            <Trash2 className="w-4 h-4" /> Удалить
          </Button>
          <Button type="button" variant="secondary" size="block" onClick={onClose}>
            Отмена
          </Button>
        </div>
      ) : null}
    >
      <Input label="Название" placeholder="Касса АЗС / Сейф / Р/счёт" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Select label="Тип" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
        <option value="cash_register">Касса АЗС</option>
        <option value="safe">Сейф</option>
        <option value="card">Карт-счёт</option>
        <option value="bank">Р/счёт</option>
        <option value="owner">Кошелёк владельца</option>
        <option value="other">Другое</option>
      </Select>
      <Select label="Валюта" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
        <option value="KGS">KGS (сом)</option>
        <option value="USD">USD</option>
        <option value="RUB">RUB</option>
        <option value="EUR">EUR</option>
      </Select>
      <Select label="АЗС (если относится к одной)" value={form.station_id} onChange={(e) => setForm({ ...form, station_id: e.target.value })}>
        <option value="">— Общий для организации —</option>
        {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      {isEdit && (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-bg-elevated border border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium text-ink">Кошелёк активен</div>
            <div className="text-xs text-ink-muted">Отключённые не подставляются в новых операциях.</div>
          </div>
          <input
            type="checkbox"
            checked={!!form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
            className="w-5 h-5 accent-brand-500"
          />
        </label>
      )}
    </FormSheet>
  );
}
