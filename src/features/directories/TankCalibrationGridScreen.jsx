// [CREATED BY CLAUDE CLI - 2026-05-27]
// Project: Fingas
// Purpose: Градуировочная таблица резервуаров — для каждого бака можно ввести
// пары «высота уровня (см) → объём (л)». Используется в форме поступления и
// замеров для пересчёта см → литры по реальной форме резервуара.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Ruler, Trash2, Upload } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { useOrgContext } from '@/hooks/useOrgContext';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import {
  listTanks,
  listTankCalibrationGrid,
  upsertTankCalibrationPoint,
  deleteTankCalibrationPoint,
  bulkUpsertTankCalibrationGrid,
} from '@/services/tankService';

export default function TankCalibrationGridScreen() {
  const { organizationId, stationId: profileStationId, stations } = useOrgContext();
  const { canEdit, canCreate } = usePermissions();
  const canManage = canCreate(MODULES.SETTINGS) || canEdit(MODULES.SETTINGS);

  const [pickedStationId, setPickedStationId] = useState(profileStationId ?? '');
  useEffect(() => {
    if (!pickedStationId && stations.length > 0) {
      setPickedStationId(profileStationId ?? stations[0].id);
    }
  }, [profileStationId, stations, pickedStationId]);
  const stationId = pickedStationId || profileStationId;
  const showStationPicker = stations.length > 1 || (!profileStationId && stations.length > 0);

  const [tanks, setTanks] = useState([]);
  const [pickedTankId, setPickedTankId] = useState('');
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const reloadTanks = useCallback(async () => {
    if (!organizationId || !stationId) { setTanks([]); return; }
    const rows = await listTanks({ organizationId, stationId, active: undefined }).catch(() => []);
    setTanks(rows);
    if (rows.length > 0 && !rows.find((r) => r.id === pickedTankId)) {
      setPickedTankId(rows[0].id);
    } else if (rows.length === 0) {
      setPickedTankId('');
    }
  }, [organizationId, stationId, pickedTankId]);

  useEffect(() => { reloadTanks(); }, [reloadTanks]);

  const reloadPoints = useCallback(async () => {
    if (!pickedTankId) { setPoints([]); setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const rows = await listTankCalibrationGrid({ tankId: pickedTankId });
      setPoints(rows);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить таблицу');
    } finally {
      setLoading(false);
    }
  }, [pickedTankId]);

  useEffect(() => { reloadPoints(); }, [reloadPoints]);

  const tank = useMemo(() => tanks.find((t) => t.id === pickedTankId) ?? null, [tanks, pickedTankId]);

  async function removePoint(id) {
    if (!confirm('Удалить точку?')) return;
    try {
      await deleteTankCalibrationPoint(id);
      await reloadPoints();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось удалить');
    }
  }

  return (
    <div className="space-y-3 pb-2">
      <ScreenHeader
        title="Градуировочная таблица"
        subtitle="Соответствие см → литры для каждого резервуара"
        right={canManage && pickedTankId ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" /> Импорт
            </Button>
            <Button size="sm" onClick={() => setEditing({})}>
              <Plus className="w-4 h-4" /> Точка
            </Button>
          </div>
        ) : null}
      />

      {showStationPicker && (
        <Select label="АЗС" value={pickedStationId} onChange={(e) => setPickedStationId(e.target.value)}>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      )}

      <Select
        label="Резервуар"
        value={pickedTankId}
        onChange={(e) => setPickedTankId(e.target.value)}
        disabled={tanks.length === 0}
      >
        {tanks.length === 0 ? (
          <option value="">— На этой АЗС нет резервуаров —</option>
        ) : (
          tanks.map((t) => (
            <option key={t.id} value={t.id}>
              №{t.number ?? '—'} · {t.name} · {t.fuel_code ?? '—'}
            </option>
          ))
        )}
      </Select>

      {err && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      )}

      {tank && (
        <Card className="!p-3 bg-bg-elevated/60">
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-soft font-bold">Резервуар</div>
          <div className="mt-0.5 text-sm font-semibold text-ink">{tank.name}</div>
          <div className="mt-1 text-[11px] text-ink-muted">
            Объём бака: {Number(tank.capacity_liters ?? 0).toLocaleString('ru-RU')} л
          </div>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-bg-elevated/60 animate-pulse" />)}
        </div>
      ) : points.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="Таблица пуста"
          description={pickedTankId
            ? 'Добавьте точки «высота → литры». Между ними значения интерполируются автоматически.'
            : 'Сначала выберите резервуар.'}
        />
      ) : (
        <div className="space-y-2">
          {points.map((p) => (
            <Card key={p.id} className="!p-3">
              <div className="flex items-center gap-3">
                <Badge tone="brand">{Number(p.height_cm)} см</Badge>
                <div className="text-sm font-semibold text-ink flex-1">
                  {Number(p.liters).toLocaleString('ru-RU')} л
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="secondary" className="h-8 px-2.5" onClick={() => setEditing(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="danger" className="h-8 px-2.5" onClick={() => removePoint(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <PointSheet
        open={!!editing}
        point={editing && editing.id ? editing : null}
        organizationId={organizationId}
        stationId={stationId}
        tankId={pickedTankId}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await reloadPoints(); }}
      />

      <ImportSheet
        open={importOpen}
        organizationId={organizationId}
        stationId={stationId}
        tankId={pickedTankId}
        onClose={() => setImportOpen(false)}
        onSaved={async () => { setImportOpen(false); await reloadPoints(); }}
      />
    </div>
  );
}

// Парсит вставленный текст. Поддерживает разделители: таб, пробел, точка с запятой,
// запятая. Десятичные дроби: и точка и запятая. Пустые строки и строка-заголовок
// (если первая колонка не число) пропускаются.
function parseGridText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    // нормализуем разделители: табы → ;
    const parts = raw.split(/[\t;,]| {2,}| (?=\d)/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const norm = (v) => Number(String(v).replace(',', '.').replace(/\s+/g, ''));
    const cm = norm(parts[0]);
    const l  = norm(parts[1]);
    if (!Number.isFinite(cm) || !Number.isFinite(l)) {
      // строка-заголовок или мусор — игнорируем
      if (i === 0) continue;
      errors.push(`Строка ${i + 1}: не удалось разобрать «${raw}»`);
      continue;
    }
    if (cm < 0 || l < 0) {
      errors.push(`Строка ${i + 1}: отрицательное значение`);
      continue;
    }
    out.push({ height_cm: cm, liters: l });
  }
  // удаляем дубликаты по cm — оставляем последнее
  const map = new Map();
  for (const r of out) map.set(r.height_cm, r);
  return { rows: [...map.values()].sort((a, b) => a.height_cm - b.height_cm), errors };
}

function ImportSheet({ open, organizationId, stationId, tankId, onClose, onSaved }) {
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setText(''); setReplace(false); setErr(''); }
  }, [open]);

  const { rows: parsedRows, errors: parseErrors } = useMemo(() => parseGridText(text), [text]);

  async function submit() {
    setSaving(true); setErr('');
    try {
      if (!tankId) throw new Error('Не выбран резервуар');
      if (parsedRows.length === 0) throw new Error('Не удалось разобрать ни одной строки');
      await bulkUpsertTankCalibrationGrid({
        organizationId, stationId, tankId, rows: parsedRows, replace,
      });
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось импортировать');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Импорт градуировочной таблицы"
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={replace ? `Заменить (${parsedRows.length})` : `Загрузить ${parsedRows.length} точек`}
    >
      <div className="text-[12px] text-ink-muted leading-relaxed">
        Скопируй колонки <b>«высота, см»</b> и <b>«литры»</b> из паспорта бака или Excel
        и вставь сюда. Разделитель — таб, пробел, запятая или «;». Дробные значения
        можно с точкой или запятой. Существующие точки с такой же высотой будут
        обновлены, остальные — добавлены.
      </div>

      <label className="block">
        <span className="block text-[13px] font-semibold text-ink mb-1.5">Данные</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'0\t0\n10\t152.3\n20\t315.1\n30\t489.0'}
          rows={10}
          className="block w-full px-4 py-3 rounded-2xl bg-bg-elevated/70 border border-line/50 text-[14px] text-ink placeholder:text-ink-soft font-mono focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-all"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
          className="w-4 h-4 rounded border-line/50"
        />
        Заменить всю таблицу (удалить старые точки)
      </label>

      {parsedRows.length > 0 && (
        <div className="rounded-2xl border border-success/30 bg-success/10 p-3 space-y-1">
          <div className="text-xs font-semibold text-success">
            Разобрано точек: {parsedRows.length}
          </div>
          <div className="text-[11px] text-ink-soft font-mono leading-relaxed">
            {parsedRows.slice(0, 4).map((r) => (
              <div key={r.height_cm}>{r.height_cm} см → {r.liters.toLocaleString('ru-RU')} л</div>
            ))}
            {parsedRows.length > 4 && (
              <div>… и ещё {parsedRows.length - 4}</div>
            )}
          </div>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-3 space-y-0.5">
          <div className="text-xs font-semibold text-warning">Проблемы при разборе:</div>
          {parseErrors.slice(0, 4).map((e, i) => (
            <div key={i} className="text-[11px] text-warning/90">{e}</div>
          ))}
          {parseErrors.length > 4 && (
            <div className="text-[11px] text-warning/70">… и ещё {parseErrors.length - 4}</div>
          )}
        </div>
      )}
    </FormSheet>
  );
}

function PointSheet({ open, point, organizationId, stationId, tankId, onClose, onSaved }) {
  const isEdit = !!point;
  const [form, setForm] = useState({ height_cm: '', liters: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (point) {
      setForm({ height_cm: String(point.height_cm ?? ''), liters: String(point.liters ?? '') });
    } else {
      setForm({ height_cm: '', liters: '' });
    }
    setErr('');
  }, [open, point]);

  async function submit() {
    setSaving(true); setErr('');
    try {
      const height_cm = Number(form.height_cm);
      const liters = Number(form.liters);
      if (!(height_cm >= 0)) throw new Error('Высота должна быть ≥ 0');
      if (!(liters >= 0)) throw new Error('Объём должен быть ≥ 0');
      await upsertTankCalibrationPoint({
        ...(isEdit ? { id: point.id } : {}),
        organization_id: organizationId,
        station_id: stationId,
        tank_id: tankId,
        height_cm,
        liters,
      });
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Изменить точку' : 'Новая точка'}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={isEdit ? 'Сохранить' : 'Добавить'}
    >
      <Input
        label="Высота уровня, см"
        type="number" step="0.01" min="0"
        value={form.height_cm}
        onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
        required
      />
      <Input
        label="Объём, литры"
        type="number" step="0.001" min="0"
        value={form.liters}
        onChange={(e) => setForm({ ...form, liters: e.target.value })}
        required
      />
      <div className="text-[11px] text-ink-soft">
        Между соседними точками литры рассчитываются линейной интерполяцией.
        Чем больше точек — тем точнее замеры на форме поступления.
      </div>
    </FormSheet>
  );
}
