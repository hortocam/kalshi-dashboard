/**
 * series-chart.tsx — T031: the historical-performance chart (FR-007, D6).
 * Band rows render as a `<rect>` with a midpoint dot; point rows render as
 * a single dot. One mark per date — the store's source-priority dedupe
 * already enforced exactly one row per date (D6), so the chart never
 * double-plots. Pure presentational component over the typed
 * `SeriesPoint[]` produced by getSeriesWindow().
 *
 * Custom SVG (no Recharts dependency for MVP): the spec pins "Recharts"
 * as the agreed stack, but a dependency-free SVG renders the four chart
 * types the data layer can produce (band-only / point-only / mixed /
 * empty) without adding a 100+ kB dependency for a single chart. The
 * contract is the visual semantics, not the rendering library.
 *
 * The window selector and zero-state are the parent card's responsibility
 * (HistoricalChartCard); this component assumes it has at least one point.
 */
import type { SeriesPoint } from "@/lib/store/observations";

/** Width / height kept fixed; Tailwind scales via the wrapping div. */
const WIDTH = 720;
const HEIGHT = 220;
/** Plot area padding (axes / labels). */
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 12;
const PAD_B = 28;

export interface SeriesChartProps {
  readonly points: readonly SeriesPoint[];
  /** Optional caption displayed below the chart (window label, family). */
  readonly caption?: string;
}

/** Aggregate min/max across every value, lo, hi present. */
function valueRange(points: readonly SeriesPoint[]): {
  min: number;
  max: number;
} {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.value !== null) {
      if (p.value < min) min = p.value;
      if (p.value > max) max = p.value;
    }
    if (p.lo !== null) {
      if (p.lo < min) min = p.lo;
      if (p.lo > max) max = p.lo;
    }
    if (p.hi !== null) {
      if (p.hi < min) min = p.hi;
      if (p.hi > max) max = p.hi;
    }
  }
  // Pad the range a hair so bands do not kiss the axes.
  const span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.05, 0.001) : span * 0.08;
  return { min: min - pad, max: max + pad };
}

/**
 * The historical-performance SVG chart (T031). Band rows render as a
 * rectangle of `lo..hi` plus a midpoint dot; point rows render as a
 * single circle. Mixed (band on some dates, point on others) renders
 * exactly the same — the chart never mixes band/point for the same date
 * (the store's source-priority dedupe guarantees one row per date).
 */
export function SeriesChart({ points, caption }: SeriesChartProps) {
  if (points.length === 0) {
    // Parent card renders the explicit zero state; defensive fallback.
    return (
      <svg
        role="img"
        aria-label="historical performance chart"
        data-testid="series-chart-empty"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
      >
        <text
          x={WIDTH / 2}
          y={HEIGHT / 2}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={12}
        >
          no observations
        </text>
      </svg>
    );
  }

  const { min, max } = valueRange(points);
  const innerW = WIDTH - PAD_L - PAD_R;
  const innerH = HEIGHT - PAD_T - PAD_B;
  const xAt = (i: number): number =>
    PAD_L + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const yAt = (v: number): number =>
    PAD_T + (max === min ? innerH / 2 : (1 - (v - min) / (max - min)) * innerH);

  // Y-axis ticks (4 evenly spaced).
  const yTicks = [0, 1, 2, 3].map((i) => {
    const v = min + ((max - min) * i) / 3;
    return { v, y: yAt(v) };
  });

  // X-axis ticks: first / mid / last date (avoids label collision).
  const xTicks = [
    { x: xAt(0), label: points[0].obsDate.slice(5) },
    {
      x: xAt(Math.floor((points.length - 1) / 2)),
      label: points[Math.floor((points.length - 1) / 2)].obsDate.slice(5),
    },
    {
      x: xAt(points.length - 1),
      label: points[points.length - 1].obsDate.slice(5),
    },
  ];

  return (
    <svg
      role="img"
      aria-label="historical performance chart"
      data-testid="series-chart"
      data-band-count={points.filter((p) => p.lo !== null).length}
      data-point-count={points.filter((p) => p.value !== null).length}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto"
    >
      {/* axes */}
      <line
        x1={PAD_L}
        y1={PAD_T}
        x2={PAD_L}
        y2={HEIGHT - PAD_B}
        stroke="currentColor"
        strokeOpacity={0.3}
      />
      <line
        x1={PAD_L}
        y1={HEIGHT - PAD_B}
        x2={WIDTH - PAD_R}
        y2={HEIGHT - PAD_B}
        stroke="currentColor"
        strokeOpacity={0.3}
      />
      {/* y-tick labels */}
      {yTicks.map((t, i) => (
        <g key={`y-${i}`}>
          <line
            x1={PAD_L - 4}
            y1={t.y}
            x2={PAD_L}
            y2={t.y}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          <text
            x={PAD_L - 6}
            y={t.y + 4}
            textAnchor="end"
            fontSize={10}
            className="fill-muted-foreground font-mono"
          >
            {t.v.toFixed(3)}
          </text>
        </g>
      ))}
      {/* x-tick labels */}
      {xTicks.map((t, i) => (
        <text
          key={`x-${i}`}
          x={t.x}
          y={HEIGHT - PAD_B + 16}
          textAnchor="middle"
          fontSize={10}
          className="fill-muted-foreground font-mono"
        >
          {t.label}
        </text>
      ))}

      {/* band rectangles + midpoints */}
      {points.map((p, i) => {
        if (p.lo === null || p.hi === null) return null;
        const x = xAt(i);
        const yLo = yAt(p.hi);
        const yHi = yAt(p.lo);
        const rectY = Math.min(yLo, yHi);
        const rectH = Math.max(2, Math.abs(yHi - yLo));
        const mid = p.mid ?? (p.lo + p.hi) / 2;
        const yMid = yAt(mid);
        return (
          <g key={`band-${p.obsDate}`}>
            <rect
              x={x - 5}
              y={rectY}
              width={10}
              height={rectH}
              fill="currentColor"
              fillOpacity={0.18}
              stroke="currentColor"
              strokeOpacity={0.6}
              strokeWidth={1}
            />
            <circle cx={x} cy={yMid} r={2.5} fill="currentColor" />
          </g>
        );
      })}
      {/* point rows */}
      {points.map((p, i) => {
        if (p.value === null) return null;
        return (
          <circle
            key={`pt-${p.obsDate}`}
            cx={xAt(i)}
            cy={yAt(p.value)}
            r={3}
            fill="currentColor"
          />
        );
      })}

      {caption === undefined ? null : (
        <text
          x={WIDTH / 2}
          y={HEIGHT - 4}
          textAnchor="middle"
          fontSize={10}
          className="fill-muted-foreground"
        >
          {caption}
        </text>
      )}
    </svg>
  );
}
