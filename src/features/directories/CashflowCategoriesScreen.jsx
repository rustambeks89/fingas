// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Статьи прихода / расхода — справочник для cashflow.

import { useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, Repeat, Wallet } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';

const KIND_META = {
  income:  { label: 'Приход',          icon: ArrowDownRight, tone: 'success' },
  expense: { label: 'Расход',          icon: ArrowUpRight,   tone: 'danger'  },
  both:    { label: 'Универсальная',   icon: Repeat,         tone: 'info'    },
};

const FILTERS = [
  { id: 'all',     label: 'Все' },
  { id: 'income',  label: 'Приходы' },
  { id: 'expense', label: 'Расходы' },
];

export default function CashflowCategoriesScreen() {
  const { user } = useAuth();
  const { canCreate, canEdit } = usePermissions();
  const orgId = user?.profile?.organization_id;
  const canManage = canCreate(MODULES.SETTINGS) || canEdit(MODULES.SETTINGS);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const reload = useCallback(async () => {
    if (!orgId) { setRows([]); setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase
        .from('cashflow_categories')
        .select('*')
        .eq('organization_id', orgId)
        .order('kind')
        .order('name');
      if (error) {
        if (String(error.message ?? '').includes('cashflow_categories') || error.code === '42P01') {
          setRows([]);
          setErr('Таблица cashflow_categories еще не создана в базе. Примените миграцию 0017_cashflow_categories_repair.sql.');
          return;
        }
        throw error;
      }
      setRows(data ?? []);
    } catch (e) {
      setErr(e?.message ?? 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { reload(); }, [reload]);

  const visible = rows.filter((r) => filter === 'all' || r.kind === filter || r.kind === 'both');

  return (
    <div className="space-y-3 pb-2">
      <ScreenHeader
        title="Статьи кэшфлоу"
        subtitle="Категории прихода и расхода"
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

      <div className="flex gap-1 p-1 rounded-2xl bg-bg-card/60 border border-line/40">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={
              'flex-1 h-8 rounded-xl text-[11px] font-semibold transition-all ' +
              (filter === f.id ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-muted hover:text-ink')
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-2xl bg-bg-card border border-line/40 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="!p-4">
          <EmptyState
            icon={Wallet}
            title="Статей нет"
            description={canManage
              ? 'Добавьте статьи (Аренда, Ремонт, Зарплата, Дополнительный доход и т.д.).'
              : 'Попросите владельца добавить статьи.'}
          />
        </Card>
      ) : (
        <div className="space-y-1.5">
          {visible.map((r) => (
            <Row key={r.id} row={r} canManage={canManage} onClick={() => setEditing(r)} />
          ))}
        </div>
      )}

      <CategorySheet
        open={!!editing}
        item={editing?.id ? editing : null}
        organizationId={orgId}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await reload(); }}
      />
    </div>
  );
}

function Row({ row, canManage, onClick }) {
  const meta = KIND_META[row.kind] ?? KIND_META.both;
  const Icon = meta.icon;
  const iconCls = {
    success: 'bg-success/15 border-success/30 text-success',
    danger:  'bg-danger/15 border-danger/30 text-danger',
    info:    'bg-info/15 border-info/30 text-info',
  }[meta.tone];
  return (
    <button
      type="button"
      disabled={!canManage}
      onClick={onClick}
      className="w-full rounded-2xl bg-bg-card border border-line/60 px-4 py-3 flex items-center gap-3 min-w-0 hover:border-brand-500/40 transition-colors text-left disabled:cursor-default"
    >
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconCls}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-semibold text-ink truncate">{row.name}</div>
          {!row.active && <Badge>off</Badge>}
        </div>
        <div className="text-[11px] text-ink-muted truncate">{meta.label}</div>
      </div>
      {canManage && <Pencil className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />}
    </button>
  );
}

function CategorySheet({ open, item, organizationId, onClose, onSaved }) {
  const isEdit = !!item;
  const { canDelete } = usePermissions();
  const [form, setForm] = useState({ name: '', kind: 'expense', active: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({ name: item.name ?? '', kind: item.kind ?? 'expense', active: item.active ?? true });
    } else {
      setForm({ name: '', kind: 'expense', active: true });
    }
    setErr('');
  }, [open, item]);

  async function submit() {
    if (!form.name) { setErr('Название обязательно'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { name: form.name.trim(), kind: form.kind, active: !!form.active };
      if (isEdit) {
        const { error } = await supabase.from('cashflow_categories').update(payload).eq('id', item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cashflow_categories').insert({ ...payload, organization_id: organizationId });
        if (error) throw error;
      }
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!isEdit) return;
    if (!confirm(`Удалить статью «${item.name}»?`)) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('cashflow_categories').delete().eq('id', item.id);
      if (error) throw error;
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось удалить');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={isEdit ? `Редактировать ${item?.name ?? ''}` : 'Новая статья'}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={isEdit ? 'Сохранить' : 'Создать'}
      onDelete={isEdit && canDelete(MODULES.SETTINGS) ? remove : null}
      deleting={deleting}
    >
      <Input label="Название" placeholder="Аренда / Ремонт / Зарплата" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Select label="Тип" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
        <option value="expense">Расход</option>
        <option value="income">Приход</option>
        <option value="both">Универсальная (приход + расход)</option>
      </Select>
      {isEdit && (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-bg-elevated border border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium text-ink">Активна</div>
            <div className="text-xs text-ink-muted">Неактивные не предлагаются в формах.</div>
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
