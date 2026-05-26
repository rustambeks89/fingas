// [CREATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Premium mobile UI for TRK Calibrations and Sales Exclusions. Features tab navigation, raw sales linking, and manual forms.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wrench,
  History,
  Link2,
  PlusCircle,
  CheckCircle2,
  Calendar,
  Clock,
  Sparkles,
  Link2Off,
  User,
  Pencil,
  Trash2,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { BottomSheet } from '@/components/bottom-sheets/BottomSheet';
import { useOrgContext } from '@/hooks/useOrgContext';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import {
  createCalibration,
  deleteCalibration,
  listCalibrations,
  updateCalibration,
} from '@/services/fuelService';
import { listSales } from '@/services/salesService';
import { supabase } from '@/lib/supabaseClient';
import { formatMoney } from '@/lib/formatters';

const FUEL_TYPES = [
  { value: 'АИ-92', label: 'АИ-92' },
  { value: 'АИ-95', label: 'АИ-95' },
  { value: 'ДТ', label: 'ДТ' },
  { value: 'СУГ', label: 'Газ' },
];

export default function CalibrationsScreen() {
  const { organizationId, stationId, user } = useOrgContext();
  const { canEdit, canDelete } = usePermissions();
  const [activeTab, setActiveTab] = useState('history'); // history | matching | manual

  const [calibrations, setCalibrations] = useState([]);
  const [sales, setSales] = useState([]);
  const [exclusions, setExclusions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Form Sheets
  const [selectedSale, setSelectedSale] = useState(null);
  const [showFormSheet, setShowFormSheet] = useState(false);
  const [editingCalibration, setEditingCalibration] = useState(null);

  // Manual Form State
  const [fuel, setFuel] = useState('АИ-92');
  const [volume, setVolume] = useState('10'); // Standard 10L calibration bucket
  const [trkNumber, setTrkNumber] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editForm, setEditForm] = useState({
    date: '',
    time: '',
    fuel: 'АИ-92',
    volume: '',
    trk_number: '',
    operator: '',
    note: '',
  });

  async function loadData() {
    if (!stationId) return;
    setLoading(true);
    setErr('');
    try {
      const [calibList, salesList, exclList] = await Promise.all([
        listCalibrations({ stationId, limit: 50 }),
        listSales({ stationId, limit: 50 }).catch(() => []),
        supabase
          .from('sales_exclusions')
          .select('*')
          .eq('station_id', stationId)
          .then(({ data }) => data ?? []),
      ]);
      setCalibrations(calibList);
      setSales(salesList);
      setExclusions(exclList);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить данные поверок.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId]);

  // Handle manual or matched submission
  async function handleCreateCalibration(isMatched = false) {
    if (!stationId || !organizationId) {
      setErr('Не выбран контекст АЗС.');
      return;
    }

    setSaving(true);
    setErr('');
    try {
      const finalFuel = isMatched ? selectedSale.FuelName : fuel;
      const finalVolume = isMatched ? Number(selectedSale.Volume) : Number(volume);
      const finalNote = isMatched
        ? `Связано с транзакцией #${selectedSale.id} от ${selectedSale.TransactionDatetime}`
        : note;

      const row = {
        organization_id: organizationId,
        station_id: stationId,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        fuel: finalFuel,
        volume: finalVolume,
        trk_number: trkNumber,
        operator: user?.profile?.full_name ?? user?.email ?? 'Оператор',
        note: finalNote || null,
      };

      await createCalibration(row);

      // If matched, link to sales_exclusions as well!
      if (isMatched) {
        const { error: exclErr } = await supabase.from('sales_exclusions').insert({
          organization_id: organizationId,
          station_id: stationId,
          source_table: 'azs_selling',
          source_id: String(selectedSale.id),
          reason: 'calibration',
          note: `Поверка ТРК №${trkNumber}`,
          created_by: user.id,
        });
        if (exclErr) throw exclErr;
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setShowFormSheet(false);
        setSelectedSale(null);
        setActiveTab('history');
        loadData();
      }, 1500);

      // Reset
      setTrkNumber('');
      setNote('');
    } catch (e) {
      setErr(e?.message ?? 'Ошибка сохранения поверки.');
    } finally {
      setSaving(false);
    }
  }

  // Restore dynamic sale to revenue calculations (Delete link from sales_exclusions)
  async function handleRemoveExclusion(saleId) {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sales_exclusions')
        .delete()
        .eq('source_table', 'azs_selling')
        .eq('source_id', String(saleId));
      if (error) throw error;
      await loadData();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось вернуть транзакцию в учет.');
    } finally {
      setLoading(false);
    }
  }

  function openEditCalibration(calibration) {
    setEditingCalibration(calibration);
    setEditForm({
      date: calibration.date ?? '',
      time: String(calibration.time ?? '').slice(0, 8),
      fuel: calibration.fuel ?? 'АИ-92',
      volume: String(calibration.volume ?? ''),
      trk_number: calibration.trk_number ?? '',
      operator: calibration.operator ?? '',
      note: calibration.note ?? '',
    });
  }

  async function submitEditCalibration() {
    if (!editingCalibration) return;
    setEditSaving(true);
    setErr('');
    try {
      await updateCalibration(editingCalibration.id, {
        date: editForm.date,
        time: editForm.time,
        fuel: editForm.fuel,
        volume: Number(editForm.volume),
        trk_number: editForm.trk_number || null,
        operator: editForm.operator || null,
        note: editForm.note || null,
      });
      setEditingCalibration(null);
      await loadData();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить поверку.');
    } finally {
      setEditSaving(false);
    }
  }

  async function removeCalibration() {
    if (!editingCalibration) return;
    if (!confirm('Удалить запись поверки?')) return;
    setEditDeleting(true);
    setErr('');
    try {
      await deleteCalibration(editingCalibration.id);
      setEditingCalibration(null);
      await loadData();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось удалить поверку.');
    } finally {
      setEditDeleting(false);
    }
  }

  async function removeCalibrationQuick(calibration) {
    if (!confirm('Удалить запись поверки?')) return;
    setLoading(true);
    setErr('');
    try {
      await deleteCalibration(calibration.id);
      await loadData();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось удалить поверку.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <ScreenHeader title="Поверки ТРК" subtitle="Учет калибровочных проливов и сверка" />

      {/* Tabs */}
      <div className="flex bg-bg-soft border border-line p-1 rounded-2xl gap-1 mb-4">
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'history' ? 'text-ink bg-bg-card shadow-card' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <History className="w-4 h-4" /> Поверки
        </button>
        <button
          onClick={() => setActiveTab('matching')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'matching' ? 'text-ink bg-bg-card shadow-card' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <Link2 className="w-4 h-4" /> Сверка проливов
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'manual' ? 'text-ink bg-bg-card shadow-card' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <PlusCircle className="w-4 h-4" /> Ручной ввод
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'history' ? (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 rounded-3xl bg-bg-card border border-line animate-pulse" />
                ))}
              </div>
            ) : calibrations.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="Поверок ТРК не найдено"
                description="Здесь будут записи о контрольных проливах через поверенные мерники для калибровки."
              />
            ) : (
              <div className="space-y-3">
                {calibrations.map((c) => (
                  <Card key={c.id}>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge tone="brand">{c.fuel}</Badge>
                          <Badge tone="info">ТРК №{c.trk_number || '—'}</Badge>
                        </div>
                        <div className="text-base font-bold text-ink mt-1">
                          Объем: {formatMoney(c.volume, 'л')}
                        </div>
                        <div className="text-xs text-ink-muted flex items-center gap-1.5 mt-1.5">
                          <Calendar className="w-3.5 h-3.5" /> {c.date}
                          <Clock className="w-3.5 h-3.5" /> {c.time?.substring(0, 5) || ''}
                        </div>
                      </div>
                      <div className="text-[10px] text-ink-soft text-right flex flex-col items-end gap-1">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {c.operator}
                        </span>
                        {c.note?.includes('транзакцией') && (
                          <Badge tone="success" className="text-[9px]">
                            Связано с транзакцией
                          </Badge>
                        )}
                        {(canEdit(MODULES.CALIBRATIONS) || canDelete(MODULES.CALIBRATIONS)) && (
                          <div className="flex items-center gap-1 pt-1">
                            {canEdit(MODULES.CALIBRATIONS) && (
                              <Button size="sm" variant="secondary" className="h-8 px-2.5" onClick={() => openEditCalibration(c)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canDelete(MODULES.CALIBRATIONS) && (
                              <Button size="sm" variant="danger" className="h-8 px-2.5" onClick={() => removeCalibrationQuick(c)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {c.note && (
                      <div className="mt-2.5 bg-bg-soft border border-line rounded-xl p-2 text-xs text-ink-muted">
                        {c.note}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </motion.div>
        ) : activeTab === 'matching' ? (
          <motion.div
            key="matching"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            <div className="text-xs text-ink-muted bg-bg-soft border border-line p-3 rounded-2xl flex items-start gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold">Интеллектуальная сверка проливов:</span> Выберите транзакцию из АСУ АЗС, которая была сделана во время поверки, чтобы исключить её из выручки в отчёте о прибылях и убытках и защитить бухгалтерские отчеты от перекосов.
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-3xl bg-bg-card border border-line animate-pulse" />
                ))}
              </div>
            ) : sales.length === 0 ? (
              <EmptyState
                icon={Link2}
                title="Транзакции из АСУ не найдены"
                description="Нет синхронизированных продаж из локальной базы azs_selling для сверки."
              />
            ) : (
              <div className="space-y-2.5">
                {sales.map((s) => {
                  const isExcluded = exclusions.some((x) => x.source_id === String(s.id));
                  return (
                    <Card key={s.id} className={isExcluded ? 'opacity-85 border border-dashed border-line' : ''}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Badge tone="default">{s.FuelName}</Badge>
                            <span className="text-[11px] text-ink-soft">
                              Колонка {s.Nozzle || s.Dispenser || '—'}
                            </span>
                          </div>
                          <div className="text-base font-bold text-ink">
                            {formatMoney(s.Volume, 'л')} · {formatMoney(s.ShopCost, 'сом')}
                          </div>
                          <div className="text-[11px] text-ink-soft flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {s.TransactionDatetime?.replace('T', ' ')}
                          </div>
                        </div>

                        <div>
                          {isExcluded ? (
                            <div className="flex flex-col items-end gap-1.5">
                              <Badge tone="warning" className="text-[9px]">
                                Исключено (Поверка)
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-ink h-8 px-2"
                                onClick={() => handleRemoveExclusion(s.id)}
                              >
                                <Link2Off className="w-3 h-3 mr-1 text-danger" /> Вернуть в учет
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className="text-xs h-9 px-3"
                              onClick={() => {
                                setSelectedSale(s);
                                setShowFormSheet(true);
                              }}
                            >
                              <Link2 className="w-3.5 h-3.5 mr-1" /> Привязать
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateCalibration(false);
              }}
              className="space-y-4"
            >
              {saveSuccess && (
                <div className="bg-success/15 border border-success/30 text-success rounded-2xl p-4 text-center font-semibold text-sm flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Поверка зарегистрирована!
                </div>
              )}

              {err && (
                <div className="bg-danger/15 border border-danger/30 text-danger rounded-2xl p-4 text-sm">
                  {err}
                </div>
              )}

              <Card className="space-y-4">
                <Select label="Вид топлива" value={fuel} onChange={(e) => setFuel(e.target.value)}>
                  {FUEL_TYPES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>

                <Input
                  label="Номер ТРК / Колонки"
                  placeholder="Например, Колонка №2"
                  required
                  value={trkNumber}
                  onChange={(e) => setTrkNumber(e.target.value)}
                />

                <Input
                  label="Объем поверочного пролива (литры)"
                  type="number"
                  step="0.01"
                  required
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                />

                <Input
                  label="Примечания"
                  placeholder="Метрологическая поверка..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Card>

              <Button type="submit" size="block" loading={saving} disabled={saveSuccess}>
                Зарегистрировать поверку
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <FormSheet
        open={!!editingCalibration}
        onClose={() => setEditingCalibration(null)}
        title="Редактировать поверку"
        onSubmit={submitEditCalibration}
        saving={editSaving}
        error={err}
        onDelete={canDelete(MODULES.CALIBRATIONS) ? removeCalibration : null}
        deleting={editDeleting}
      >
        <Input label="Дата" type="date" value={editForm.date} onChange={(e) => setEditForm((c) => ({ ...c, date: e.target.value }))} />
        <Input label="Время" type="time" value={editForm.time} onChange={(e) => setEditForm((c) => ({ ...c, time: e.target.value }))} />
        <Select label="Вид топлива" value={editForm.fuel} onChange={(e) => setEditForm((c) => ({ ...c, fuel: e.target.value }))}>
          {FUEL_TYPES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
        <Input label="Объем" type="number" step="0.01" value={editForm.volume} onChange={(e) => setEditForm((c) => ({ ...c, volume: e.target.value }))} />
        <Input label="Номер ТРК" value={editForm.trk_number} onChange={(e) => setEditForm((c) => ({ ...c, trk_number: e.target.value }))} />
        <Input label="Оператор" value={editForm.operator} onChange={(e) => setEditForm((c) => ({ ...c, operator: e.target.value }))} />
        <Input label="Примечание" value={editForm.note} onChange={(e) => setEditForm((c) => ({ ...c, note: e.target.value }))} />
      </FormSheet>

      {/* Transaction Matching Form Sheet */}
      <BottomSheet
        open={showFormSheet}
        onClose={() => {
          setShowFormSheet(false);
          setSelectedSale(null);
        }}
        title="Связать поверку с транзакцией АСУ"
      >
        {selectedSale && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateCalibration(true);
            }}
            className="space-y-4"
          >
            {saveSuccess && (
              <div className="bg-success/15 border border-success/30 text-success rounded-2xl p-4 text-center font-semibold text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Связано и исключено из отчётов!
              </div>
            )}

            <div className="bg-bg-soft border border-line rounded-2xl p-3 text-sm space-y-2">
              <div className="text-ink-soft uppercase text-[10px] tracking-wider">Выбранная транзакция:</div>
              <div className="font-bold text-ink">
                {selectedSale.FuelName} · {formatMoney(selectedSale.Volume, 'л')} ·{' '}
                {formatMoney(selectedSale.ShopCost, 'сом')}
              </div>
              <div className="text-xs text-ink-muted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> {selectedSale.TransactionDatetime?.replace('T', ' ')}
              </div>
            </div>

            <div className="space-y-4">
              <Input
                label="Номер ТРК / Колонки"
                placeholder="Колонка №1"
                required
                value={trkNumber}
                onChange={(e) => setTrkNumber(e.target.value)}
              />
              <p className="text-xs text-ink-soft">
                После отправки транзакция будет помечена как «исключенная поверка». Она перестанет учитываться при расчете выручки АЗС в отчётах о прибылях и убытках.
              </p>
            </div>

            {err && (
              <div className="bg-danger/15 border border-danger/30 text-danger rounded-2xl p-4 text-sm">
                {err}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowFormSheet(false);
                  setSelectedSale(null);
                }}
              >
                Отмена
              </Button>
              <Button type="submit" loading={saving} disabled={saveSuccess}>
                Связать поверку
              </Button>
            </div>
          </form>
        )}
      </BottomSheet>
    </div>
  );
}
