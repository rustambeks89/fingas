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
  AlertTriangle,
  FileText,
  Calendar,
  Clock,
  Sparkles,
} from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { useOrgContext } from '@/hooks/useOrgContext';
import { listTankMeasurements, createTankMeasurement } from '@/services/fuelService';
import { listLatestBalances } from '@/services/balanceService';
import { formatMoney } from '@/lib/formatters';

const TANK_OPTIONS = [
  { id: '1', name: 'Резервуар №1 (АИ-92)' },
  { id: '2', name: 'Резервуар №2 (АИ-95)' },
  { id: '3', name: 'Резервуар №3 (ДТ)' },
  { id: '4', name: 'Резервуар №4 (СУГ)' },
];

const FUEL_TYPES = [
  { value: 'АИ-92', label: 'АИ-92 (Бензин)' },
  { value: 'АИ-95', label: 'АИ-95 (Бензин)' },
  { value: 'ДТ', label: 'ДТ (Дизель)' },
  { value: 'СУГ', label: 'СУГ (Газ)' },
];

export default function TankMeasurementsScreen() {
  const { organizationId, stationId } = useOrgContext();
  const [activeTab, setActiveTab] = useState('history'); // history | new

  const [measurements, setMeasurements] = useState([]);
  const [systemBalances, setSystemBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Form State
  const [selectedTank, setSelectedTank] = useState('1');
  const [fuelType, setFuelType] = useState('АИ-92');
  const [inputMode, setInputMode] = useState('level'); // level | volume
  const [levelCm, setLevelCm] = useState('');
  const [liters, setLiters] = useState('');
  const [temp, setTemp] = useState('15');
  const [waterLevel, setWaterLevel] = useState('0');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync / Load
  async function loadData() {
    if (!stationId) return;
    setLoading(true);
    setErr('');
    try {
      const [history, balances] = await Promise.all([
        listTankMeasurements({ stationId, limit: 50 }),
        listLatestBalances({ stationId }).catch(() => []),
      ]);
      setMeasurements(history);
      setSystemBalances(balances);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить данные замеров.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId]);

  // Compute matched system balance
  const matchedSystem = systemBalances.find(
    (b) =>
      b.fuel_name?.toLowerCase().includes(fuelType.toLowerCase()) ||
      (fuelType === 'ДТ' && b.fuel_name?.toLowerCase().includes('диз'))
  );

  const systemLiters = matchedSystem ? Number(matchedSystem.liters || 0) : null;
  const userLiters = inputMode === 'volume' ? Number(liters || 0) : Number(levelCm || 0) * 15; // Simple cm -> liters mock factor for UX feedback

  const variance = systemLiters ? userLiters - systemLiters : 0;
  const variancePct = systemLiters ? (variance / systemLiters) * 100 : 0;
  const hasDiscrepancy = Math.abs(variancePct) > 1.5;

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!stationId || !organizationId) {
      setErr('Не выбран контекст АЗС.');
      return;
    }

    setSaving(true);
    setErr('');
    try {
      const row = {
        organization_id: organizationId,
        station_id: stationId,
        tank_id: selectedTank,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        fuel_type: fuelType,
        level_cm: inputMode === 'level' && levelCm ? Number(levelCm) : null,
        liters: inputMode === 'volume' && liters ? Number(liters) : null,
        temperature: temp ? Number(temp) : null,
        water_level: waterLevel ? Number(waterLevel) : null,
        note: note || null,
      };

      await createTankMeasurement(row);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setActiveTab('history');
        loadData();
      }, 1500);

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
    <div>
      <ScreenHeader title="Замеры резервуаров" subtitle="Инвентаризация и контроль утечек" />

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
                  {TANK_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Вид топлива"
                  value={fuelType}
                  onChange={(e) => {
                    setFuelType(e.target.value);
                    // Match default tank option
                    const matchedIdx = FUEL_TYPES.findIndex((f) => f.value === e.target.value);
                    if (matchedIdx !== -1) setSelectedTank(String(matchedIdx + 1));
                  }}
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
                  <Input
                    label="Фактический объем топлива (литры)"
                    type="number"
                    step="0.001"
                    placeholder="Например, 12500"
                    required
                    value={liters}
                    onChange={(e) => setLiters(e.target.value)}
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Температура (°C)"
                    type="number"
                    step="0.1"
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                  />
                  <Input
                    label="Подтоварная вода (см)"
                    type="number"
                    step="0.1"
                    value={waterLevel}
                    onChange={(e) => setWaterLevel(e.target.value)}
                  />
                </div>

                <Input
                  label="Комментарий / Заметки"
                  placeholder="Примечание к замеру..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Card>

              {/* System comparison analysis */}
              {(levelCm || liters) && (
                <Card className="border border-line overflow-hidden relative">
                  <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-brand-400" />
                  </div>
                  <div className="font-semibold text-sm mb-3">Сверка с системным балансом (MySQL)</div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="rounded-xl bg-bg-elevated p-2.5">
                      <div className="text-[10px] uppercase text-ink-soft">По замеру (литры)</div>
                      <div className="text-base font-bold mt-0.5">{formatMoney(userLiters, 'л')}</div>
                    </div>
                    <div className="rounded-xl bg-bg-elevated p-2.5">
                      <div className="text-[10px] uppercase text-ink-soft">Из АСУ АЗС (MySQL)</div>
                      <div className="text-base font-bold mt-0.5">
                        {systemLiters ? formatMoney(systemLiters, 'л') : 'нет данных'}
                      </div>
                    </div>
                  </div>

                  {systemLiters ? (
                    <div
                      className={`text-xs p-3 rounded-2xl flex items-start gap-2 border ${
                        hasDiscrepancy
                          ? 'bg-warning/15 border-warning/30 text-warning'
                          : 'bg-success/15 border-success/30 text-success'
                      }`}
                    >
                      {hasDiscrepancy ? (
                        <>
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-bold">Обнаружено расхождение!</span> Отклонение{' '}
                            <span className="underline font-bold">
                              {variance > 0 ? '+' : ''}
                              {formatMoney(variance, 'л')} ({variancePct.toFixed(2)}%)
                            </span>
                            . Рекомендуется повторить замер или проверить герметичность резервуара.
                          </div>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-bold">Замер сходится с АСУ АЗС!</span> Отклонение{' '}
                            {variancePct.toFixed(2)}% ({formatMoney(variance, 'л')}) находится в пределах нормы
                            (до 1.5%).
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-ink-soft bg-bg-soft rounded-xl p-2.5 text-center">
                      Синхронизированные данные azs_balance для {fuelType} пока не найдены в системе.
                    </div>
                  )}
                </Card>
              )}

              <Button type="submit" size="block" loading={saving} disabled={saveSuccess}>
                Сохранить замер
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
