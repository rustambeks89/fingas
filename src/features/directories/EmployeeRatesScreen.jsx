// [CREATED BY CLAUDE CLI - 2026-05-27]
// Project: Fingas
// Purpose: Справочник ставок сотрудников. Для каждого сотрудника задаётся
// либо фиксированная ставка за смену, либо сдельная (литры × ставка по
// маркам топлива). Эта ставка автоматически начисляется в payroll при
// утверждении сменного отчёта (триггер из миграции 0028).

import { useCallback, useEffect, useState } from 'react';
import { Banknote, Pencil, UserCircle2 } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/status/EmptyState';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES, PROFILE_STATUS } from '@/lib/constants';
import { listEmployees } from '@/services/profileService';
import { getEmployeePayRate, saveEmployeePayRate } from '@/services/payrollService';
import { formatMoney } from '@/lib/formatters';

const FUELS = ['АИ-92', 'АИ-95', 'АИ-98', 'ДТ', 'Газ'];

export default function EmployeeRatesScreen() {
  const { user } = useAuth();
  const { canEdit, canCreate } = usePermissions();
  const organizationId = user?.profile?.organization_id;
  const canManage = canCreate(MODULES.SETTINGS) || canEdit(MODULES.SETTINGS)
                  || canCreate(MODULES.PAYROLL) || canEdit(MODULES.PAYROLL);

  const [employees, setEmployees] = useState([]);
  const [rates, setRates] = useState({}); // user_id -> rate
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);

  const reload = useCallback(async () => {
    if (!organizationId) { setEmployees([]); setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const list = await listEmployees({ organizationId, status: PROFILE_STATUS.ACTIVE });
      setEmployees(list);
      const map = {};
      await Promise.all(list.map(async (p) => {
        if (!p.user_id) return;
        const r = await getEmployeePayRate(p.user_id).catch(() => null);
        if (r) map[p.user_id] = r;
      }));
      setRates(map);
    } catch (e) {
      setErr(e?.message ?? 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="space-y-3 pb-2">
      <ScreenHeader
        title="Ставки сотрудников"
        subtitle="Фикс за смену или сдельная по литрам. Начисляется автоматически при утверждении отчёта смены."
      />

      {err && (
        <Card className="text-sm text-danger">{err}</Card>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-bg-card animate-pulse" />)}
        </div>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={UserCircle2}
          title="Нет активных сотрудников"
          description="Добавьте сотрудников в разделе «Сотрудники», после этого здесь можно задать им ставки."
        />
      ) : (
        <div className="space-y-2">
          {employees.map((emp) => {
            const rate = rates[emp.user_id];
            return (
              <Card key={emp.id} className="!p-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                    <UserCircle2 className="w-4 h-4 text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {emp.full_name || emp.email || '—'}
                    </div>
                    <div className="text-[11px] text-ink-muted truncate">
                      {emp.station?.name ? `АЗС: ${emp.station.name}` : 'Без привязки к АЗС'}
                    </div>
                    {rate ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={rate.kind === 'fixed' ? 'info' : 'success'}>
                          {rate.kind === 'fixed' ? 'Фикс' : 'Сдельная'}
                        </Badge>
                        {rate.kind === 'fixed' ? (
                          <span className="text-xs font-semibold text-ink">
                            {formatMoney(rate.base_amount)} / смена
                          </span>
                        ) : rate.rates_json ? (
                          <span className="text-[10px] text-ink-muted">
                            {Object.entries(rate.rates_json)
                              .filter(([, v]) => Number(v) > 0)
                              .map(([f, v]) => `${f}:${v}`)
                              .join(' · ')}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[10px] text-warning">Ставка не задана</div>
                    )}
                  </div>
                  {canManage && (
                    <Button size="sm" variant="secondary" className="h-8 px-2.5" onClick={() => setEditing({ employee: emp, rate })}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RateSheet
        open={!!editing}
        employee={editing?.employee ?? null}
        rate={editing?.rate ?? null}
        organizationId={organizationId}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await reload(); }}
      />
    </div>
  );
}

function RateSheet({ open, employee, rate, organizationId, onClose, onSaved }) {
  const [kind, setKind] = useState('fixed');
  const [baseAmount, setBaseAmount] = useState('0');
  const [ratesJson, setRatesJson] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    if (rate) {
      setKind(rate.kind || 'fixed');
      setBaseAmount(String(rate.base_amount ?? 0));
      const r = rate.rates_json ?? {};
      setRatesJson(Object.fromEntries(FUELS.map((f) => [f, String(r[f] ?? 0)])));
    } else {
      setKind('fixed');
      setBaseAmount('0');
      setRatesJson(Object.fromEntries(FUELS.map((f) => [f, '0'])));
    }
  }, [open, rate]);

  async function submit() {
    if (!employee?.user_id) { setErr('Нет user_id у сотрудника'); return; }
    setSaving(true); setErr('');
    try {
      const parsedRates = {};
      for (const [f, v] of Object.entries(ratesJson)) {
        parsedRates[f] = Number(v) || 0;
      }
      await saveEmployeePayRate(employee.user_id, organizationId, {
        kind,
        base_amount: Number(baseAmount) || 0,
        rates_json: kind === 'piecework' ? parsedRates : null,
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
      title={employee ? `Ставка · ${employee.full_name || employee.email}` : 'Ставка'}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Сохранить"
    >
      <Select label="Тип ставки" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="fixed">Фикс — фиксированная сумма за смену</option>
        <option value="piecework">Сдельная — литры × ставка по марке</option>
      </Select>

      {kind === 'fixed' ? (
        <Input
          label="Сумма за смену, сом"
          type="number" step="0.01" min="0"
          value={baseAmount}
          onChange={(e) => setBaseAmount(e.target.value)}
          hint="Будет начислено каждый раз когда владелец утвердит отчёт смены этого сотрудника."
        />
      ) : (
        <div className="rounded-2xl border border-line/40 bg-bg-elevated/40 p-3 space-y-2">
          <div className="text-[11px] text-ink-soft">
            Ставка за литр по каждой марке. Начисление = сумма по реализованным литрам за смену.
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FUELS.map((f) => (
              <Input
                key={f}
                label={`${f}, сом/л`}
                type="number" step="0.01" min="0"
                value={ratesJson[f] ?? '0'}
                onChange={(e) => setRatesJson({ ...ratesJson, [f]: e.target.value })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="text-[11px] text-ink-soft flex items-start gap-1.5">
        <Banknote className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-brand-400" />
        Изменения вступают в силу с сегодняшнего дня. Уже начисленные смены не пересчитываются.
      </div>
    </FormSheet>
  );
}
