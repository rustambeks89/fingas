// [CREATED BY CLAUDE CLI - 2026-05-26]
// Project: Fingas
// Purpose: Ленивый chunk с Recharts — отдельно от OwnerDashboard, чтобы
// сам дашборд рендерился без ожидания 411 КБ chart-бандла.

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '@/lib/formatters';

export default function TrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 0, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="ownerRevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#E11D48" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#E11D48" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(148,163,184,0.06)" vertical={false} />
        <XAxis
          dataKey="label"
          stroke="#94A3B8"
          fontSize={10}
          fontWeight={600}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#94A3B8"
          fontSize={10}
          fontWeight={600}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}к` : String(v))}
        />
        <Tooltip
          cursor={{ stroke: 'rgba(225,29,72,0.2)', strokeWidth: 1.5 }}
          contentStyle={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-brand-500)',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 'bold',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
          }}
          formatter={(v) => formatMoney(v)}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#E11D48"
          strokeWidth={2.5}
          fill="url(#ownerRevGrad)"
        />
        <Line
          type="monotone"
          dataKey="ma"
          stroke="#94A3B8"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
