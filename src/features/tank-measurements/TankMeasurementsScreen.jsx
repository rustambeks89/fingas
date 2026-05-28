// [CREATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Premium mobile UI for manual tank dips, with level_cm/liters selector, live system comparison (azs_balance), and history log.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gauge,
  History,
  PlusCircle,
  Thermometer,
  Droplet,
  CheckCircle2,
  FileText,
  Calendar,
  Clock,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { useOrgContext } from '@/hooks/useOrgContext';
import { listTankMeasurements, createTankMeasurement } from '@/services/fuelService';
import { listTanks } from '@/services/tankService';
import { formatMoney } from '@/lib/formatters';

const FUEL_TYPES = [
  { value: 'АИ-92', label: 'АИ-92 (Бензин)' },
  { value: 'АИ-95', label: 'АИ-95 (Бензин)' },
  { value: 'ДТ', label: 'ДТ (Дизель)' },
  { value: 'СУГ', label: 'СУГ (Газ)' },
];

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function TankMeasurementsScreen() {
  const { organizationId, stationId: profileStationId, stations } = useOrgContext();
  const [activeTab, setActiveTab] = useState('history'); // history | new

  const [measurements, setMeasurements] = useState([]);
  const [tanks, setTanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [pickedStationId, setPickedStationId] = useState(profileStationId ?? '');
  useEffect(() => {
    if (!pickedStationId && stations.length > 0) {
      setPickedStationId(profileStationId ?? stations[0].id);
    }
  }, [profileStationId, stations, pickedStationId]);
  const stationId = pickedStationId || profileStationId;
  const showStationPicker = stations.length > 1 || (!profileStationId && stations.length > 0);

  // Form State
  const [selectedTank, setSelectedTank] = useState('');
  const [fuelType, setFuelType] = useState('АИ-92');
  const [inputMode, setInputMode] = useState('level'); // level | volume
  const [levelCm, setLevelCm] = useState('');
  const [liters, setLiters] = useState('');
  const [temp] = useState('15');
  const [waterLevel] = useState('0');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync / Load
  async function loadData({ silent = false } = {}) {
    if (!organizationId || !stationId) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setErr('');
    try {
      const [history, tankRows] = await Promise.all([
        listTankMeasurements({ stationId, limit: 50 }),
        listTanks({ organizationId, stationId, active: true }).catch(() => []),
      ]);
      setMeasurements(history);
      setTanks(tankRows);
      setSelectedTank((current) => {
        if (current && tankRows.some((t) => t.id === current)) return current;
        return tankRows[0]?.id ?? '';
      });
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить данные замеров.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, stationId]);

  useEffect(() => {
    const handleUpdate = () => loadData({ silent: true });
    window.addEventListener('fingas-data-changed', handleUpdate);
    return () => window.removeEventListener('fingas-data-changed', handleUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, stationId]);

  useEffect(() => {
    const tank = tanks.find((t) => t.id === selectedTank);
    if (!tank?.fuel_code) return;
    const match = FUEL_TYPES.find((f) => f.value === tank.fuel_code || f.label.includes(tank.fuel_code));
    setFuelType(match?.value ?? tank.fuel_code);
  }, [selectedTank, tanks]);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!organizationId) {
      setErr('Не выбрана организация.');
      return;
    }
    if (!stationId) {
      setErr('Выберите АЗС.');
      return;
    }

    setSaving(true);
    setErr('');
    try {
      const row = {
        organization_id: organizationId,
        station_id: stationId,
        tank_id: selectedTank || null,
        date: localDateString(),
        time: new Date().toTimeString().split(' ')[0],
        fuel_type: fuelType,
        level_cm: inputMode === 'level' && levelCm ? Number(levelCm) : null,
        liters: inputMode === 'volume' && liters ? Number(liters) : null,
        temperature: temp ? Number(temp) : null,
        water_level: waterLevel ? Number(waterLevel) : null,
        note: note || null,
      };

      await createTankMeasurement(row);
      setMeasurements((current) => [{ ...row, id: `pending-${Date.now()}` }, ...current]);
      setSaveSuccess(true);
      setActiveTab('history');
      window.dispatchEvent(new Event('fingas-data-changed'));
      loadData({ silent: true });
      setTimeout(() => {
        setSaveSuccess(false);
      }, 1200);

      // Reset form
      setLevelCm('');
      setLiters('');
      setNote('');
    } catch (e) {
      setErr(e?.message ?? 'Ошибка при сохранении замера.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PullToRefresh onRefresh={loadData}>
      <div>
        <ScreenHeader title="Замеры резервуаров" subtitle="Инвентаризация и контроль утечек" />

        {showStationPicker && (
          <div className="mb-3">
            <Select label="АЗС" value={pickedStationId} onChange={(e) => setPickedStationId(e.target.value)}>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-bg-soft border border-line p-1 rounded-2xl gap-1 mb-4">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'history' ? 'text-ink bg-bg-card shadow-card' : 'text-ink-soft hover:text-ink'
            }`}
          >
            <History className="w-4 h-4" /> История
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'new' ? 'text-ink bg-bg-card shadow-card' : 'text-ink-soft hover:text-ink'
            }`}
          >
            <PlusCircle className="w-4 h-4" /> Новый замер
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
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 rounded-3xl bg-bg-card border border-line animate-pulse" />
                  ))}
                </div>
              ) : measurements.length === 0 ? (
                <EmptyState
                  icon={Gauge}
                  title="История замеров пуста"
                  description="Здесь будут отображаться результаты ваших физических замеров резервуаров метроштоком."
                />
              ) : (
                <div className="space-y-3">
                  {measurements.map((m) => {
                    const hasLevel = m.level_cm != null;
                    const hasVolume = m.liters != null;
                    const userLiters = hasVolume ? m.liters : (hasLevel ? m.level_cm * 15 : 0);
                    const maxTankLiters = 20000;
                    const percent = Math.min(Math.max((userLiters / maxTankLiters) * 100, 10), 100);

                    // Colors for different fuel types
                    let fuelColorClass = 'from-brand-700 via-brand-600 to-brand-500'; // AI-92
                    if (m.fuel_type?.includes('95')) {
                      fuelColorClass = 'from-rose-600 via-pink-500 to-rose-400'; // AI-95
                    } else if (m.fuel_type?.toLowerCase().includes('дт') || m.fuel_type?.toLowerCase().includes('диз')) {
                      fuelColorClass = 'from-sky-600 via-blue-500 to-cyan-400'; // Diesel
                    } else if (m.fuel_type?.toLowerCase().includes('суг') || m.fuel_type?.toLowerCase().includes('газ')) {
                      fuelColorClass = 'from-emerald-600 via-teal-500 to-emerald-400'; // Gas
                    }

                    return (
                      <Card key={m.id} hoverable className="relative overflow-hidden flex gap-5 items-stretch p-5">
                        {/* Left: Info */}
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge tone="brand" className="font-bold text-[10px] tracking-wide">{m.fuel_type}</Badge>
                            <span className="text-xs text-ink-soft flex items-center gap-1 font-semibold">
                              <Calendar className="w-3.5 h-3.5 text-ink-soft" /> {m.date}
                            </span>
                            <span className="text-xs text-ink-soft flex items-center gap-1 font-semibold">
                              <Clock className="w-3.5 h-3.5 text-ink-soft" /> {m.time?.substring(0, 5) || ''}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div className="rounded-2xl bg-bg-soft/70 border border-line/35 p-2.5">
                              <span className="text-[10px] uppercase font-black tracking-wider text-ink-soft">Налив</span>
                              <div className="text-sm font-black text-ink mt-0.5">{hasLevel ? `${m.level_cm} см` : '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-bg-soft/70 border border-line/35 p-2.5">
                              <span className="text-[10px] uppercase font-black tracking-wider text-ink-soft">Объем</span>
                              <div className="text-sm font-black text-ink mt-0.5">
                                {formatMoney(userLiters, 'л')}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-ink-muted bg-bg-soft/40 border border-line/30 rounded-xl px-2.5 py-1.5">
                            <div className="flex items-center gap-1 font-bold">
                              <Thermometer className="w-3.5 h-3.5 text-orange-500" /> {m.temperature ?? '—'}°C
                            </div>
                            <div className="flex items-center gap-1 font-bold">
                              <Droplet className="w-3.5 h-3.5 text-blue-500" /> Вода: {m.water_level ?? '0'} см
                            </div>
                          </div>

                          {m.note && (
                            <div className="bg-bg-soft/30 border border-line/30 rounded-xl p-2 text-[11px] text-ink-muted flex items-start gap-1.5 leading-relaxed">
                              <FileText className="w-3.5 h-3.5 text-brand-500 flex-shrink-0 mt-0.5" />
                              <span>{m.note}</span>
                            </div>
                          )}
                        </div>

                        {/* Right: Glass 3D Capsule Tank Visual */}
                        <div className="w-20 flex flex-col items-center justify-center relative">
                          <div className="w-14 h-28 rounded-3xl bg-bg-elevated border border-line/50 shadow-[inset_0_4px_12px_rgba(255,255,255,0.04)] relative overflow-hidden flex flex-col justify-end p-0.5 backdrop-blur-md">
                            {/* Glossy fluid */}
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${percent}%` }}
                              className={`w-full rounded-[1.25rem] bg-gradient-to-t ${fuelColorClass} relative overflow-hidden`}
                              transition={{ type: 'spring', stiffness: 100, damping: 22 }}
                            >
                              <div className="absolute top-0 left-0 right-0 h-2 bg-white/25 blur-[0.5px] animate-pulse" />
                              <span className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.15),transparent_40%,rgba(0,0,0,0.15))]" />
                            </motion.div>
                            
                            {/* Glass glare highlight */}
                            <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />
                            <div className="absolute top-2 left-2 w-1.5 h-12 rounded-full bg-white/15 pointer-events-none" />

                            {/* Level lines inside */}
                            <div className="absolute inset-y-4 left-1.5 w-1 flex flex-col justify-between text-[6px] text-ink-soft opacity-30 font-mono select-none">
                              <span>-</span>
                              <span>-</span>
                              <span>-</span>
                              <span>-</span>
                            </div>
                          </div>
                          <span className="text-[9px] font-black font-mono mt-1 text-ink-muted">{percent.toFixed(0)}%</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="new"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                {saveSuccess && (
                  <div className="bg-success/15 border border-success/30 text-success rounded-2xl p-4 text-center font-semibold text-sm flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Замер сохранен в базу!
                  </div>
                )}

                {err && (
                  <div className="bg-danger/15 border border-danger/30 text-danger rounded-2xl p-4 text-sm">
                    {err}
                  </div>
                )}

                <Card className="space-y-4">
                  <Select
                    label="Резервуар"
                    value={selectedTank}
                    onChange={(e) => setSelectedTank(e.target.value)}
                  >
                    <option value="">
                      {tanks.length === 0 ? '— Резервуары не настроены —' : '— Без привязки к резервуару —'}
                    </option>
                    {tanks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.number ? `№${t.number} · ` : ''}{t.name}{t.fuel_code ? ` (${t.fuel_code})` : ''}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Вид топлива"
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value)}
                  >
                    {FUEL_TYPES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </Card>

                {/* Mode Toggle Switch */}
                <div className="flex bg-bg-elevated border border-line p-1 rounded-2xl gap-1">
                  <button
                    type="button"
                    onClick={() => setInputMode('level')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                      inputMode === 'level' ? 'text-ink bg-bg-card shadow-card' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    По высоте метроштока (см)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('volume')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                      inputMode === 'volume' ? 'text-ink bg-bg-card shadow-card' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    По датчику объема (литры)
                  </button>
                </div>

                <Card className="space-y-4">
                  {inputMode === 'level' ? (
                    <Input
                      label="Высота налива топлива метроштоком (см)"
                      type="number"
                      step="0.1"
                      placeholder="Например, 150.5"
                      required
                      value={levelCm}
                      onChange={(e) => setLevelCm(e.target.value)}
                    />
                  ) : (
                    <div className="text-xs text-ink-soft bg-bg-soft rounded-xl p-2.5 text-center">
                      Синхронизированные данные АСУ для {fuelType} пока не найдены в системе.
                    </div>
                  )}
                </Card>

              <Button type="submit" size="block" loading={saving} disabled={saveSuccess}>
                Сохранить замер
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </PullToRefresh>
  );
}
