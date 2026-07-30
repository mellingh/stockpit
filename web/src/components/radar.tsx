// Snowflake-Radar (Pentagon, Simply-Wall-St-Stil).
// viewBox seitlich aufgeweitet + winkelabhängige Anker,
// damit lange Labels (ZUKUNFT, DIVIDENDE) nie abgeschnitten werden.
export function RadarChart({
  scores,
  size = 210,
}: {
  scores: { label: string; value: number }[];
  size?: number;
}) {
  const c = size / 2;
  const rMax = size / 2 - 34;
  const n = scores.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): [number, number] => [
    c + r * Math.cos(angle(i)),
    c + r * Math.sin(angle(i)),
  ];
  const rand = 38;
  return (
    <svg
      viewBox={`${-rand} 0 ${size + 2 * rand} ${size}`}
      width={size + 2 * rand}
      height={size}
    >
      {[1, 2, 3, 4, 5].map((ring) => (
        <polygon
          key={ring}
          points={scores.map((_, i) => pt(i, (rMax * ring) / 5).join(',')).join(' ')}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="1"
        />
      ))}
      {scores.map((_, i) => {
        const [x, y] = pt(i, rMax);
        return (
          <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--color-line)" strokeWidth="1" />
        );
      })}
      <polygon
        points={scores.map((s, i) => pt(i, (rMax * Math.max(s.value, 0.15)) / 5).join(',')).join(' ')}
        fill="rgba(94, 158, 255, 0.30)"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {scores.map((s, i) => {
        const [x, y] = pt(i, rMax + 14);
        const cos = Math.cos(angle(i));
        return (
          <text
            key={s.label}
            x={x}
            y={y}
            textAnchor={cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'}
            dominantBaseline="middle"
            fill="var(--color-ink3)"
            fontSize="9"
            fontWeight="600"
            letterSpacing="0.08em"
          >
            <title>{`${s.label}: ${s.value}/5`}</title>
            {s.label}
          </text>
        );
      })}
    </svg>
  );
}
