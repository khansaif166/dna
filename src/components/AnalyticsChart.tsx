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
    correct: number;
    total: number;
  }>;
}

export default function AnalyticsChart({ data }: AnalyticsChartProps) {
  if (!data.length) {
    return <p style={{ color: '#9AA5B4', margin: 0 }}>No submitted subject data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barSize={48}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F9" vertical={false} />
        <XAxis
          dataKey="subjectName"
          tick={{ fontSize: 12, fontWeight: 600, fill: '#9AA5B4' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#9AA5B4' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          cursor={{ fill: 'rgba(10,15,30,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as AnalyticsChartProps['data'][number];
            return (
              <div
                style={{
                  background: '#0A0F1E',
                  borderRadius: 10,
                  padding: '10px 14px',
                  boxShadow: '0 8px 24px rgba(10,15,30,0.2)',
                }}
              >
                <div
                  style={{
                    color: '#F5C518',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                  }}
                >
                  {d.percent.toFixed(1)}%
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                  {d.correct} / {d.total} correct
                </div>
                <div
                  style={{
                    color: 'rgba(255,255,255,0.3)',
                    fontSize: '0.72rem',
                    marginTop: 4,
                  }}
                >
                  {d.subjectName}
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey="percent" radius={[8, 8, 0, 0]} label={false}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.percent >= 70 ? '#10B981' : entry.percent >= 40 ? '#F59E0B' : '#EF4444'}
              opacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
