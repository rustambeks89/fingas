// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Employees screen with 4 tabs: Заявки / Активные / Доступы / Заблокированные.
// "Одобрить" opens ApproveSheet with role + station + template controls.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import {
  blockEmployee,
  listEmployees,
  rejectEmployee,
  unblockEmployee,
} from '@/services/profileService';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/status/EmptyState';
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
  const [tab, setTab] = useState('requests');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [counts, setCounts] = useState({ requests: 0, active: 0, blocked: 0 });
  const [approveFor, setApproveFor] = useState(null);

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
        subtitle="Заявки, активные, доступы, блок"
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Команда</div>
          <div className="mt-1 text-xl font-bold text-ink">{counts.active + counts.requests + counts.blocked}</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {counts.requests} заявок · {counts.active} активных · {counts.blocked} заблокированных
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <MetricCard label="Заявки" value={counts.requests} />
            <MetricCard label="Активные" value={counts.active} />
            <MetricCard label="Блок" value={counts.blocked} />
          </div>
        </div>
      </motion.div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1.5 -mx-4 px-4">
        {TABS.map((t) => (
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
        ))}
      </div>

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
              {tab === 'active' && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Link to={`/employees/${p.user_id}/permissions`}>
                    <Button size="sm" variant="secondary" className="w-full">Доступы</Button>
                  </Link>
                  <Button size="sm" variant="danger" onClick={() => block(p)}>Заблокировать</Button>
                </div>
              )}
              {tab === 'permissions' && (
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

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl bg-bg-card/75 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className="mt-0.5 text-xs font-bold text-ink truncate">{value}</div>
    </div>
  );
}
