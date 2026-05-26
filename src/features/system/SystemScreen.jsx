// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: System status — sync freshness for azs_selling / azs_balance,
// Supabase URL, app version. Quick way to debug "почему нет данных".

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, RefreshCw, Server, XCircle } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabaseClient';
import { formatDateTime, formatRelative } from '@/lib/formatters';

const APP_VERSION = '0.1.0';

export default function SystemScreen() {
  const [state, setState] = useState({
    selling: null,    // { exists, lastAt, total }
    balance: null,
    profiles: null,
    loading: true,
  });

  async function load() {
    setState((s) => ({ ...s, loading: true }));
    const [sel, bal, prof] = await Promise.all([
      probe('azs_selling', 'TransactionDatetime'),
      probe('azs_balance', 'measured_at'),
      probe('profiles', 'updated_at'),
    ]);
    setState({ selling: sel, balance: bal, profiles: prof, loading: false });
  }

  async function probe(table, dateCol) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: false })
        .order(dateCol, { ascending: false })
        .limit(1);
      if (error) {
        return { exists: false, error: error.message };
      }
      return {
        exists: true,
        total: count ?? 0,
        lastAt: data?.[0]?.[dateCol] ?? null,
      };
    } catch (e) {
      return { exists: false, error: e?.message ?? String(e) };
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const env = import.meta.env;
  const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').replace(/^https?:\/\//, '');

  return (
    <div>
      <ScreenHeader
        title="Система"
        subtitle="Статус синхронизации и подключения"
        right={(
          <Button size="sm" variant="secondary" onClick={load}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      />

      {!state.loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">Состояние</div>
            <div className="mt-1 text-xl font-bold text-ink">
              {state.selling?.exists && state.balance?.exists && state.profiles?.exists ? 'В норме' : 'Проверка'}
            </div>
            <div className="mt-0.5 text-xs text-ink-muted">Быстрая диагностика таблиц и подключения Supabase</div>
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              <MetricCard label="Продажи" ok={state.selling?.exists} />
              <MetricCard label="Балансы" ok={state.balance?.exists} />
              <MetricCard label="Профили" ok={state.profiles?.exists} />
            </div>
          </div>
        </motion.div>
      )}

      {/* CONNECTION */}
      <Card className="!p-3.5 rounded-xl bg-bg-card border border-line/30 backdrop-blur-xl shadow-sm mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-bg-elevated border border-line/30 flex items-center justify-center text-ink-muted flex-shrink-0">
            <Server className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-ink">Supabase</div>
            <div className="text-[10px] text-ink-muted truncate">{supabaseUrl || '—'}</div>
          </div>
          <Badge tone={supabaseUrl ? 'success' : 'danger'}>
            {supabaseUrl ? 'connected' : 'no env'}
          </Badge>
        </div>
      </Card>

      {/* MYSQL SYNC */}
      <div className="text-[11px] uppercase tracking-wider text-ink-soft mt-4 mb-1.5 px-1">
        MySQL → Supabase
      </div>
      <Card className="!p-1 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
        <ul className="divide-y divide-line/50">
          <Row
            label="Продажи (azs_selling)"
            hint="Продажи из АСУ АЗС"
            data={state.selling}
            loading={state.loading}
          />
          <Row
            label="Балансы (azs_balance)"
            hint="Остатки по резервуарам"
            data={state.balance}
            loading={state.loading}
          />
        </ul>
      </Card>

      {/* APP TABLES */}
      <div className="text-[11px] uppercase tracking-wider text-ink-soft mt-4 mb-1.5 px-1">
        Приложение
      </div>
      <Card className="!p-1 rounded-[1.4rem] bg-bg-card/75 border-line/70 backdrop-blur-xl">
        <ul className="divide-y divide-line/50">
          <Row
            label="Профили (profiles)"
            hint="Пользователи + роли"
            data={state.profiles}
            loading={state.loading}
          />
        </ul>
      </Card>

      <div className="mt-6 text-center text-xs text-ink-soft">
        fingas v{APP_VERSION}
      </div>
    </div>
  );
}

function MetricCard({ label, ok }) {
  return (
    <div className={`rounded-xl border p-2.5 backdrop-blur-xl ${ok ? 'bg-success/10 border-success/20' : 'bg-danger/10 border-danger/20'}`}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className={`mt-0.5 text-xs font-bold ${ok ? 'text-success' : 'text-danger'}`}>{ok ? 'OK' : '—'}</div>
    </div>
  );
}

function Row({ label, hint, data, loading }) {
  const ok = data?.exists;
  return (
    <li className="px-3 py-3 flex items-center gap-3 min-w-0">
      <div className={
        'w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ' +
        (loading ? 'bg-bg-elevated border-line text-ink-muted'
         : ok ? 'bg-success/15 border-success/30 text-success'
              : 'bg-danger/15 border-danger/30 text-danger')
      }>
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> :
         ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink truncate">{label}</div>
        <div className="text-[11px] text-ink-muted truncate">
          {loading ? 'проверяю…' :
           ok ? (data.lastAt
                  ? `последняя запись ${formatRelative(data.lastAt)} · ${formatDateTime(data.lastAt)}`
                  : 'таблица пуста')
              : (data?.error ?? hint)}
        </div>
      </div>
      {!loading && ok && (
        <Badge>{(data.total ?? 0).toLocaleString('ru-RU')}</Badge>
      )}
    </li>
  );
}
