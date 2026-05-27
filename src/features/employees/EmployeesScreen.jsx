// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Employees screen with 4 tabs: Заявки / Активные / Доступы / Заблокированные.
// "Одобрить" opens ApproveSheet with role + station + template controls.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Check } from 'lucide-react';
import {
  blockEmployee,
  listEmployees,
  rejectEmployee,
  unblockEmployee,
} from '@/services/profileService';
import {
  getEmployeePayRate,
  saveEmployeePayRate,
  calculateEmployeePayrollSummary,
} from '@/services/payrollService';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { useAuth } from '@/hooks/useAuth';
import { PROFILE_STATUS, ROLE_LABELS, PROFILE_STATUS_LABELS } from '@/lib/constants';
import { ApproveSheet } from './ApproveSheet';
import { supabase } from '@/lib/supabaseClient';

const TABS = [
  { id: 'requests',    label: 'Заявки',          status: PROFILE_STATUS.PENDING },
  { id: 'active',      label: 'Активные',        status: PROFILE_STATUS.ACTIVE },
  { id: 'permissions', label: 'Доступы',         status: PROFILE_STATUS.ACTIVE },
  { id: 'blocked',     label: 'Заблокированные', status: PROFILE_STATUS.BLOCKED },
];

export default function EmployeesScreen() {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const [tab, setTab] = useState('active');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [counts, setCounts] = useState({ requests: 0, active: 0, blocked: 0 });
  const [approveFor, setApproveFor] = useState(null);
  const [selectedPayrollProfile, setSelectedPayrollProfile] = useState(null);

  const activeTab = useMemo(() => TABS.find((t) => t.id === tab), [tab]);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await listEmployees({
        organizationId: orgId,
        status: activeTab.status,
      });
      setRows(data);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, activeTab.status]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`employees_${orgId}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          reload();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, reload]);

  // pull counts for tab badges in parallel
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    async function load() {
      const [reqs, acts, blks] = await Promise.all([
        listEmployees({ organizationId: orgId, status: PROFILE_STATUS.PENDING }).catch(() => []),
        listEmployees({ organizationId: orgId, status: PROFILE_STATUS.ACTIVE }).catch(() => []),
        listEmployees({ organizationId: orgId, status: PROFILE_STATUS.BLOCKED }).catch(() => []),
      ]);
      if (!cancelled) setCounts({ requests: reqs.length, active: acts.length, blocked: blks.length });
    }
    load();
    return () => { cancelled = true; };
  }, [orgId, rows.length]);

  async function reject(p) {
    if (!confirm(`Отклонить заявку ${p.full_name || p.email}?`)) return;
    await rejectEmployee(p.id);
    await reload();
  }
  async function block(p) {
    if (!confirm(`Заблокировать ${p.full_name || p.email}?`)) return;
    await blockEmployee(p.id);
    await reload();
  }
  async function unblock(p) {
    await unblockEmployee(p.id);
    await reload();
  }

  function badgeFor(id) {
    const n =
      id === 'requests' ? counts.requests :
      id === 'active' || id === 'permissions' ? counts.active :
      id === 'blocked' ? counts.blocked : 0;
    if (!n) return null;
    return (
      <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold bg-white/15">
        {n}
      </span>
    );
  }

  return (
    <div>
      <ScreenHeader
        title="Сотрудники"
        subtitle={`${counts.active} активных${counts.requests ? ` · ${counts.requests} заявок` : ''}${counts.blocked ? ` · ${counts.blocked} заблокированных` : ''}`}
      />

      {/* Quick switcher — компактно, без больших карточек статистики */}
      {(counts.requests > 0 || counts.blocked > 0) && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1.5 mb-3">
          {TABS.filter((t) => t.id !== 'permissions').map((t) => {
            const n =
              t.id === 'requests' ? counts.requests :
              t.id === 'active'   ? counts.active :
              t.id === 'blocked'  ? counts.blocked : 0;
            if (t.id === 'blocked' && n === 0) return null;
            if (t.id === 'requests' && n === 0) return null;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  'flex-shrink-0 px-3 h-8 rounded-xl text-xs font-semibold border transition-colors flex items-center ' +
                  (tab === t.id
                    ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                    : 'bg-bg-card text-ink-muted border-line hover:text-ink hover:border-brand-500/50')
                }
              >
                {t.label}{badgeFor(t.id)}
              </button>
            );
          })}
        </div>
      )}

      {err && (
        <div className="mt-3 text-sm text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5">
          {err}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading && (
          <div className="space-y-2">
            {[0,1,2].map((i) => (
              <div key={i} className="h-24 rounded-[1.4rem] bg-bg-card border border-line/60 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <EmptyState
            icon={Users}
            title={tab === 'requests' ? 'Нет новых заявок' : 'Пусто'}
            description={
              tab === 'requests' ? 'Когда сотрудники зарегистрируются, заявки появятся здесь.' :
              tab === 'active'   ? 'Активных сотрудников пока нет. Одобрите заявки на соседней вкладке.' :
              tab === 'permissions' ? 'Нет активных сотрудников для настройки прав.' :
              'Заблокированных нет.'
            }
          />
        )}

        {!loading && rows.map((p, i) => (
          <motion.div
            key={p.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
        >
            <Card className="rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <Avatar name={p.full_name} src={p.avatar_url} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink truncate">
                    {p.full_name || p.email}
                  </div>
                  <div className="text-xs text-ink-muted truncate">
                    {ROLE_LABELS[p.role] ?? p.role}
                    {p.station?.name ? ` · ${p.station.name}` : ''}
                  </div>
                  <div className="text-[11px] text-ink-soft truncate">{p.email}{p.phone ? ` · ${p.phone}` : ''}</div>
                </div>
                <Badge tone={
                  p.status === 'active' ? 'success' :
                  p.status === 'blocked' ? 'danger' :
                  p.status === 'rejected' ? 'warning' : 'info'
                }>
                  {PROFILE_STATUS_LABELS[p.status] ?? p.status}
                </Badge>
              </div>

              {tab === 'requests' && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Button size="sm" onClick={() => setApproveFor(p)}>Одобрить</Button>
                  <Button size="sm" variant="secondary" onClick={() => reject(p)}>Отклонить</Button>
                </div>
              )}
              {tab === 'active' && p.role !== 'owner' && (
                <div className="space-y-2 mt-3">
                  {p.role === 'operator' && p.user_id && (
                    <Link to={`/employees/${p.user_id}`} className="block">
                      <Button size="sm" variant="brand" className="w-full h-8 text-[11px] font-bold rounded-xl">
                        Перейти к карточке →
                      </Button>
                    </Link>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Link to={`/employees/${p.user_id}/permissions`} className="w-full">
                      <Button size="sm" variant="secondary" className="w-full h-8 text-[11px] rounded-xl">Доступы</Button>
                    </Link>
                    <Button size="sm" variant="danger" className="w-full h-8 text-[11px] rounded-xl" onClick={() => block(p)}>Заблокировать</Button>
                  </div>
                </div>
              )}
              {tab === 'permissions' && p.role !== 'owner' && (
                <Link to={`/employees/${p.user_id}/permissions`} className="block mt-3">
                  <Button size="sm" variant="secondary" className="w-full">Открыть toggles →</Button>
                </Link>
              )}
              {tab === 'blocked' && (
                <Button size="sm" className="mt-3 w-full" onClick={() => unblock(p)}>Разблокировать</Button>
              )}
            </Card>
          </motion.div>
        ))}
      </div>

      <EmployeePayrollSheet
        open={!!selectedPayrollProfile}
        profile={selectedPayrollProfile}
        organizationId={orgId}
        onClose={() => setSelectedPayrollProfile(null)}
      />

      <ApproveSheet
        open={!!approveFor}
        profile={approveFor}
        organizationId={orgId}
        onClose={() => setApproveFor(null)}
        onDone={reload}
      />
    </div>
  );
}


// ---------------------------------------------------------------------------
// NEW: EMPLOYEE PAY RATES & CALCULATOR SHEET
// ---------------------------------------------------------------------------
function EmployeePayrollSheet({ open, profile, organizationId, onClose }) {
  const [rateKind, setRateKind] = useState('fixed');
  const [baseAmount, setBaseAmount] = useState('0');
  const [ratesJson, setRatesJson] = useState({
    'АИ-92': '0', 'АИ-95': '0', 'АИ-98': '0', 'ДТ': '0', 'Газ': '0'
  });
  
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [summary, setSummary] = useState(null);
  const [savingRate, setSavingRate] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [wallets, setWallets] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState('');
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (open && profile && organizationId) {
      setErr(''); setSuccess('');
      setPayoutAmount('');
      
      import('@/services/cashflowService').then(({ listWallets }) => {
        listWallets({ organizationId, active: true }).then((w) => {
          setWallets(w);
          if (w.length > 0) setSelectedWallet(w[0].id);
        }).catch(() => {});
      });

      getEmployeePayRate(profile.user_id).then((rate) => {
        if (rate) {
          setRateKind(rate.kind);
          setBaseAmount(String(rate.base_amount ?? 0));
          if (rate.rates_json) {
            setRatesJson({
              'АИ-92': String(rate.rates_json['АИ-92'] ?? 0),
              'АИ-95': String(rate.rates_json['АИ-95'] ?? 0),
              'АИ-98': String(rate.rates_json['АИ-98'] ?? 0),
              'ДТ': String(rate.rates_json['ДТ'] ?? 0),
              'Газ': String(rate.rates_json['Газ'] ?? 0),
            });
          }
        } else {
          setRateKind('fixed');
          setBaseAmount('0');
          setRatesJson({
            'АИ-92': '0', 'АИ-95': '0', 'АИ-98': '0', 'ДТ': '0', 'Газ': '0'
          });
        }
      }).catch(() => {});
    }
  }, [open, profile, organizationId]);

  const loadSummary = useCallback(() => {
    if (!profile || !organizationId) return;
    calculateEmployeePayrollSummary(profile.user_id, organizationId, fromDate, toDate)
      .then((sum) => {
        setSummary(sum);
        if (sum) {
          setPayoutAmount(String(sum.netSalary > 0 ? sum.netSalary.toFixed(2) : '0.00'));
        }
      })
      .catch(() => setSummary(null));
  }, [profile, organizationId, fromDate, toDate]);

  useEffect(() => {
    if (open) {
      loadSummary();
    }
  }, [open, loadSummary]);

  async function handleSaveRate() {
    if (!profile || !organizationId) return;
    setSavingRate(true); setErr(''); setSuccess('');
    try {
      const parsedRates = {};
      for (const [f, v] of Object.entries(ratesJson)) {
        parsedRates[f] = Number(v) || 0;
      }

      await saveEmployeePayRate(profile.user_id, organizationId, {
        kind: rateKind,
        base_amount: Number(baseAmount) || 0,
        rates_json: parsedRates,
      });
      setSuccess('Ставка успешно сохранена!');
      loadSummary();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось сохранить ставку');
    } finally {
      setSavingRate(false);
    }
  }

  async function handlePayout() {
    if (!profile || !organizationId) return;
    const amt = Number(payoutAmount);
    if (!amt || amt <= 0) { setErr('Введите сумму выплаты больше 0'); return; }
    setSavingPayout(true); setErr(''); setSuccess('');
    try {
      const { data: cfRow, error: cfErr } = await supabase
        .from('cashflow')
        .insert({
          organization_id: organizationId,
          station_id: profile.station_id || null,
          date: new Date().toISOString().slice(0, 10),
          operation_type: 'expense',
          payment_type: 'cash',
          wallet_from: selectedWallet || null,
          cashflow_category: 'Зарплата',
          amount: amt,
          note: `Выплата зарплаты сотруднику: ${profile.full_name || profile.email}`,
          status: 'confirmed',
        })
        .select()
        .single();
      if (cfErr) throw cfErr;

      const { error: payErr } = await supabase
        .from('payroll')
        .insert({
          organization_id: organizationId,
          station_id: profile.station_id || null,
          user_id: profile.user_id,
          period: new Date().toISOString().slice(0, 10),
          salary_type: rateKind,
          accrued: 0,
          paid: amt,
          paid_at: new Date().toISOString(),
          cashflow_id: cfRow.id,
          note: `Выплата за период с ${fromDate} по ${toDate}`,
        });
      if (payErr) throw payErr;

      setSuccess('Выплата зарплаты успешно проведена в Кэшфлоу!');
      setPayoutAmount('0.00');
      loadSummary();
    } catch (e) {
      setErr(e?.message ?? 'Не удалось провести выплату');
    } finally {
      setSavingPayout(false);
    }
  }

  const formatMoney = (v) => {
    return Number(v || 0).toLocaleString('ru-RU', { style: 'currency', currency: 'KGS', minimumFractionDigits: 2 });
  };

  if (!profile) return <FormSheet open={false} onClose={onClose} title="" />;

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={`${profile.full_name || profile.email}`}
      onSubmit={(e) => { e?.preventDefault?.(); onClose(); }}
      submitLabel="Готово"
    >
      <div className="space-y-4">
        {/* SECTION 1: PAY RATES MANAGEMENT */}
        <div className="rounded-2xl border border-line/40 bg-bg-elevated/40 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-ink-soft font-bold">Настройка ставки сдельщика / окладника</div>
            <Badge tone="brand">{ROLE_LABELS[profile.role] ?? profile.role}</Badge>
          </div>

          <div>
            <span className="text-[10px] text-ink-soft block mb-1">Схема оплаты</span>
            <div className="grid grid-cols-2 gap-1 bg-bg-elevated p-0.5 rounded-lg border border-line/40">
              <button
                type="button"
                onClick={() => setRateKind('fixed')}
                className={`py-1.5 text-xs font-bold rounded-md transition-colors ${rateKind === 'fixed' ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-muted'}`}
              >
                Фиксированная (за смену)
              </button>
              <button
                type="button"
                onClick={() => setRateKind('piecework')}
                className={`py-1.5 text-xs font-bold rounded-md transition-colors ${rateKind === 'piecework' ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-muted'}`}
              >
                Сдельная (за литр)
              </button>
            </div>
          </div>

          {rateKind === 'fixed' ? (
            <Input
              label="Фиксированная сумма за смену, сом"
              type="number"
              value={baseAmount}
              onChange={(e) => setBaseAmount(e.target.value)}
            />
          ) : (
            <div className="space-y-2.5">
              <span className="text-[10px] text-ink-soft block uppercase tracking-wider font-semibold">Сдельные тарифы за литр по маркам</span>
              <div className="grid grid-cols-2 gap-3">
                <Input label="АИ-92, сом/л" type="number" step="0.01" value={ratesJson['АИ-92']} onChange={(e) => setRatesJson({ ...ratesJson, 'АИ-92': e.target.value })} />
                <Input label="АИ-95, сом/л" type="number" step="0.01" value={ratesJson['АИ-95']} onChange={(e) => setRatesJson({ ...ratesJson, 'АИ-95': e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="АИ-98, сом/л" type="number" step="0.01" value={ratesJson['АИ-98']} onChange={(e) => setRatesJson({ ...ratesJson, 'АИ-98': e.target.value })} />
                <Input label="ДТ, сом/л" type="number" step="0.01" value={ratesJson['ДТ']} onChange={(e) => setRatesJson({ ...ratesJson, 'ДТ': e.target.value })} />
              </div>
              <Input label="Газ, сом/л" type="number" step="0.01" value={ratesJson['Газ']} onChange={(e) => setRatesJson({ ...ratesJson, 'Газ': e.target.value })} />
            </div>
          )}

          <Button type="button" variant="brand" className="w-full h-8 text-[11px] font-bold rounded-xl" onClick={handleSaveRate} loading={savingRate}>
            Сохранить тарифную ставку
          </Button>
        </div>

        {/* SECTION 2: PAYROLL PERIODIC SUMMARY & PAYOUT */}
        <div className="rounded-2xl border border-line/40 bg-bg-elevated/40 p-3.5 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-bold">Расчет заработка за период</div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="С даты" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input label="По дату" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>

          {summary ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-bg-card p-2 rounded-xl border border-line/40 text-center">
                  <span className="text-[9px] block text-ink-soft">Смен отработано</span>
                  <span className="text-sm font-bold text-ink">{summary.totalShifts}</span>
                </div>
                <div className="bg-bg-card p-2 rounded-xl border border-line/40 text-center">
                  <span className="text-[9px] block text-ink-soft">Объем продаж</span>
                  <span className="text-sm font-bold text-ink">{Math.round(summary.totalLiters)} л</span>
                </div>
                <div className="bg-bg-card p-2 rounded-xl border border-line/40 text-center">
                  <span className="text-[9px] block text-ink-soft">Начислено</span>
                  <span className="text-sm font-bold text-ink">{formatMoney(summary.totalAccrued)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-card p-2 rounded-xl border border-line/40 text-center">
                  <span className="text-[9px] block text-ink-soft">Недостачи (удержание)</span>
                  <span className="text-sm font-bold text-danger">−{formatMoney(summary.totalDiscrepancy)}</span>
                </div>
                <div className="bg-bg-card p-2 rounded-xl border border-line/40 text-center">
                  <span className="text-[9px] block text-ink-soft">Выплачено ранее</span>
                  <span className="text-sm font-bold text-ink">{formatMoney(summary.totalPaid)}</span>
                </div>
              </div>

              <div className="p-3 bg-bg-card/90 rounded-2xl border border-brand-500/20 flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-[10px] text-ink-muted uppercase block">Итого к выплате (с учетом удержаний):</span>
                  <span className={`text-base font-extrabold block mt-0.5 ${summary.netSalary > 0 ? 'text-success' : summary.netSalary < 0 ? 'text-danger' : 'text-ink'}`}>
                    {formatMoney(summary.netSalary)}
                  </span>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping" />
              </div>

              {summary.netSalary > 0 && (
                <div className="p-3 border border-line/40 rounded-2xl bg-bg-card/40 space-y-3">
                  <span className="text-[10px] text-ink-soft uppercase block tracking-wider font-semibold">Оформить выплату зарплаты кассиру</span>
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Выдать из кошелька"
                      value={selectedWallet}
                      onChange={(e) => setSelectedWallet(e.target.value)}
                      className="h-8 text-xs"
                    >
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </Select>
                    <Input
                      label="Сумма к выплате"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button type="button" variant="success" className="w-full h-8 text-[11px] font-bold rounded-xl" onClick={handlePayout} loading={savingPayout}>
                    <Check className="w-3.5 h-3.5 mr-0.5" /> Выдать из кассы и провести
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="h-20 flex items-center justify-center text-xs text-ink-soft bg-bg-card border border-line/30 rounded-xl animate-pulse">
              Рассчитываем финансовые показатели...
            </div>
          )}
        </div>

        {err && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-2">{err}</div>
        )}
        {success && (
          <div className="text-xs text-success bg-success/10 border border-success/30 rounded-xl px-3 py-2">{success}</div>
        )}
      </div>
    </FormSheet>
  );
}
