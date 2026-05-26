// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Виды топлива — CRUD справочник. Используется в TankSheet
// (выбор для нового резервуара) и в TankCard для цвета цистерны.

import { useCallback, useEffect, useState } from 'react';
import { Droplets, Pencil, Plus } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { supabase } from '@/lib/supabaseClient';
import { seedDefaultFuelTypes } from '@/services/tankService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';

const PRESET_COLORS = ['#22C55E', '#FF4D3D', '#A855F7', '#3B82F6', '#F59E0B', '#EC4899', '#6B7280'];

export default function FuelTypesScreen() {
  const { user } = useAuth();
  const { canCreate, canEdit } = usePermissions();
  const orgId = user?.profile?.organization_id;
  const canManage = canCreate(MODULES.SETTINGS) || canEdit(MODULES.SETTINGS);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);

  const reload = useCallback(async () => {
    if (!orgId) { setRows([]); setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase
        .from('fuel_types')
        .select('*')
        .eq('organization_id', orgId)
        .order('sort_order')
        .order('code');
      if (error) throw error;
      setRows(data ?? []);
    } catch (e) {
      setErr(e?.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { reload(); }, [reload]);

  async function seedDefaults() {
    if (!orgId) return;
    await seedDefaultFuelTypes(orgId);
    await reload();
  }

  return (
    <div className="space-y-3 pb-2">
      <ScreenHeader
        title="Виды топлива"
        subtitle="Справочник для резервуаров и продаж"
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
            icon={Droplets}
            title="Видов топлива нет"
            description="Создайте свой список или импортируйте стандартный (АИ-92/95/98/ДТ/Газ)."
            action={canManage ? (
              <Button size="sm" onClick={seedDefaults}>Импортировать стандартные</Button>
            ) : null}
          />
        </Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <Row
              key={r.id}
              row={r}
              canManage={canManage}
              onClick={() => setEditing(r)}
            />
          ))}
        </div>
      )}

      <FuelTypeSheet
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
  return (
    <button
      type="button"
      disabled={!canManage}
      onClick={onClick}
      className="w-full rounded-2xl bg-bg-card border border-line/60 px-4 py-3 flex items-center gap-3 min-w-0 hover:border-brand-500/40 transition-colors text-left disabled:cursor-default"
    >
      <span
        className="w-3 h-10 rounded-full flex-shrink-0"
        style={{ background: row.color || '#FF4D3D' }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-bold text-ink truncate">{row.code}</div>
          {row.octane && <Badge>RON {row.octane}</Badge>}
          {!row.active && <Badge>off</Badge>}
        </div>
        <div className="text-[11px] text-ink-muted truncate">{row.name}</div>
      </div>
      {canManage && <Pencil className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />}
    </button>
  );
}

function FuelTypeSheet({ open, item, organizationId, onClose, onSaved }) {
  const isEdit = !!item;
  const { canDelete } = usePermissions();
  const [form, setForm] = useState({
    code: '',
    name: '',
    color: PRESET_COLORS[0],
    octane: '',
    sort_order: 0,
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        code: item.code ?? '',
        name: item.name ?? '',
        color: item.color ?? PRESET_COLORS[0],
        octane: item.octane ?? '',
        sort_order: item.sort_order ?? 0,
        active: item.active ?? true,
      });
    } else {
      setForm({ code: '', name: '', color: PRESET_COLORS[0], octane: '', sort_order: 0, active: true });
    }
    setErr('');
  }, [open, item]);

  async function submit() {
    if (!form.code) { setErr('Код обязателен'); return; }
    if (!form.name) { setErr('Название обязательно'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        color: form.color,
        octane: form.octane !== '' ? Number(form.octane) : null,
        sort_order: Number(form.sort_order) || 0,
        active: !!form.active,
      };
      if (isEdit) {
        const { error } = await supabase.from('fuel_types').update(payload).eq('id', item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fuel_types').insert({ ...payload, organization_id: organizationId });
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
    if (!confirm(`Удалить «${item.code}»?`)) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('fuel_types').delete().eq('id', item.id);
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
      title={isEdit ? `Редактировать ${item?.code ?? ''}` : 'Новый вид топлива'}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={isEdit ? 'Сохранить' : 'Создать'}
      onDelete={isEdit && canDelete(MODULES.SETTINGS) ? remove : null}
      deleting={deleting}
    >
      <Input label="Код" placeholder="АИ-95" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
      <Input label="Полное название" placeholder="Бензин АИ-95" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

      <div>
        <div className="text-sm text-ink-muted mb-2">Цвет (для цистерны)</div>
        <div className="flex gap-1.5 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              className={
                'w-8 h-8 rounded-full border-2 transition-all ' +
                (form.color === c ? 'border-white scale-110' : 'border-line/40')
              }
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Октановое число" type="number" placeholder="95" value={form.octane} onChange={(e) => setForm({ ...form, octane: e.target.value })} />
        <Input label="Порядок" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
      </div>
      {isEdit && (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-bg-elevated border border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium text-ink">Активен</div>
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
