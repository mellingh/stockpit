// Allokations-Donut mit 2px-Lücken — validierte Kategorien-Palette aus v1
export const CAT_COLORS = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
  text?: string;
}

export function Donut({
  slices,
  size = 172,
  stroke = 26,
}: {
  slices: DonutSlice[];
  size?: number;
  stroke?: number;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = -0.25 * circumference; // bei 12 Uhr beginnen
  const gap = 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((slice, i) => {
        const len = (slice.value / total) * circumference;
        const seg = (
          <circle
            key={slice.label}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={slice.color ?? CAT_COLORS[i % CAT_COLORS.length]}
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(len - gap, 0.5)} ${circumference - Math.max(len - gap, 0.5)}`}
            strokeDashoffset={-offset}
          >
            <title>{`${slice.label}: ${slice.text ?? ''}`}</title>
          </circle>
        );
        offset += len;
        return seg;
      })}
    </svg>
  );
}
