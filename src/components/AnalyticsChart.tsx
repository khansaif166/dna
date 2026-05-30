interface AnalyticsChartProps {
  data: Array<{
    subjectName: string;
    percent: number;
  }>;
}

export default function AnalyticsChart({ data }: AnalyticsChartProps) {
  if (!data.length) {
    return <p>No submitted subject data yet.</p>;
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: '0.875rem',
      }}
    >
      {data.map((row) => (
        <div
          key={row.subjectName}
          style={{
            display: 'grid',
            gap: '0.375rem',
          }}
        >
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              fontSize: '0.95rem',
              fontWeight: 600,
              gap: '0.75rem',
              justifyContent: 'space-between',
            }}
          >
            <span>{row.subjectName}</span>
            <span>{row.percent}%</span>
          </div>

          <div
            aria-hidden="true"
            style={{
              backgroundColor: '#e5e7eb',
              borderRadius: '999px',
              height: '0.85rem',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(90deg, #0b693d, #f9dd17)',
                borderRadius: '999px',
                height: '100%',
                transition: 'width 400ms ease',
                width: `${Math.max(0, Math.min(100, row.percent))}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
