import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface AnalyticsChartProps {
  data: Array<{
    subjectName: string;
    percent: number;
  }>;
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload: {
      subjectName: string;
      percent: number;
    };
    value: number;
  }>;
};

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0]?.payload;

  if (!row) {
    return null;
  }

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        boxShadow: '0 10px 24px rgba(10, 15, 30, 0.12)',
        color: 'var(--color-navy)',
        padding: '10px 12px',
      }}
    >
      <p
        style={{
          fontSize: '0.9rem',
          fontWeight: 700,
          margin: 0,
        }}
      >
        {row.subjectName}
      </p>
      <p
        style={{
          fontSize: '0.85rem',
          margin: '0.25rem 0 0',
        }}
      >
        {row.percent}%
      </p>
    </div>
  );
}

export default function AnalyticsChart({ data }: AnalyticsChartProps) {
  if (!data.length) {
    return <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>No submitted subject data yet.</p>;
  }

  return (
    <div style={{ height: '240px', width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="subjectName"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
          />
          <YAxis
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: 'rgba(245, 197, 24, 0.08)' }} content={<CustomTooltip />} />
          <Bar
            dataKey="percent"
            radius={[8, 8, 0, 0]}
            activeBar={{
              fill: 'var(--color-yellow)',
            }}
          >
            {data.map((row) => (
              <Cell key={row.subjectName} fill="var(--color-navy)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
