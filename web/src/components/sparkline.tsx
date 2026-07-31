// 30-Tage-Mini-Chart in Tabellenzellen — mit sanftem Flächen-Verlauf
export function Sparkline({
  values,
  width = 92,
  height = 28,
}: {
  values: number[] | undefined;
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) return <span className="text-ink3">–</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pt = (v: number, i: number) =>
    `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`;
  const pts = values.map(pt).join(' ');
  const up = values[values.length - 1] >= values[0];
  const farbe = up ? 'var(--color-up)' : 'var(--color-down)';
  const id = `sg-${up ? 'u' : 'd'}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={farbe} stopOpacity="0.22" />
          <stop offset="100%" stopColor={farbe} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={farbe} strokeWidth="1.6" />
    </svg>
  );
}
