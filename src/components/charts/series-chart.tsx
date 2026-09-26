/**
 * series-chart.tsx — T031: the historical-performance chart (FR-007, D6),
 * rendered on Recharts (plan.md stack decision; T043 migration).
 *
 * Visual contract preserved from the previous custom-SVG implementation:
 *   - band rows render as a rectangle (lo..hi) plus a midpoint dot;
 *   - point rows render as a single value dot;
 *   - the chart never double-plots a band and a point on the same date
 *     (the store's source-priority dedupe — D6 — already guarantees one
 *     row per date upstream);
 *   - empty points render the explicit "no observations" fallback.
 *
 * The semantic data-* attributes (band count, point count) are emitted
 * on a wrapping element so the visual contract is testable without
 * depending on Recharts' internal SVG layout. The unit tests assert
 * those attrs and the wrapper's testid, not Recharts' DOM details.
 *
 * The window selector and zero state are the parent card's responsibility
 * (HistoricalChartCard); this component assumes it has at least one point.
 */
"use client";

import {
  ComposedChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SeriesPoint } from "@/lib/store/observations";

export interface SeriesChartProps {
  readonly points: readonly SeriesPoint[];
  /** Optional caption displayed below the chart (window label, family). */
  readonly caption?: string;
}

interface ChartRow {
  /** Date string used as the X key. */
  readonly date: string;
  /** Band lo for ReferenceArea; null for point-only rows. */
  readonly lo: number | null;
  /** Band hi for ReferenceArea; null for point-only rows. */
  readonly hi: number | null;
  /** Point value (point rows); null for band-only rows. */
  readonly value: number | null;
  /** Band midpoint (band rows); null for point-only rows. */
  readonly mid: number | null;
}

function toRows(points: readonly SeriesPoint[]): ChartRow[] {
  return points.map((p) => ({
    date: p.obsDate,
    lo: p.lo,
    hi: p.hi,
    value: p.value,
    mid: p.mid,
  }));
}

function valueRange(rows: readonly ChartRow[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const r of rows) {
    const candidates: number[] = [];
    if (r.lo !== null) candidates.push(r.lo);
    if (r.hi !== null) candidates.push(r.hi);
    if (r.value !== null) candidates.push(r.value);
    if (r.mid !== null) candidates.push(r.mid);
    for (const v of candidates) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.05, 0.001) : span * 0.08;
  return { min: min - pad, max: max + pad };
}

/**
 * The historical-performance chart (T031, T043 Recharts migration).
 * Renders band rows as Recharts `ReferenceArea` rectangles + midpoint
 * `ReferenceDot`, and point rows as a `Scatter` series of values.
 */
export function SeriesChart({ points, caption }: SeriesChartProps) {
  const bandCount = points.filter((p) => p.lo !== null).length;
  const pointCount = points.filter((p) => p.value !== null).length;

  if (points.length === 0) {
    return (
      <div
        role="img"
        aria-label="historical performance chart"
        data-testid="series-chart-empty"
        className="w-full text-center text-xs text-muted-foreground"
      >
        no observations
      </div>
    );
  }

  const rows = toRows(points);
  const { min, max } = valueRange(rows);

  return (
    <figure
      data-testid="series-chart"
      data-band-count={bandCount}
      data-point-count={pointCount}
      className="flex flex-col gap-1"
    >
      <div className="w-full h-[220px]" aria-label="historical performance chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 12, right: 16, bottom: 28, left: 56 }}
          >
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickFormatter={(v: string) => v.slice(5)}
              stroke="currentColor"
              strokeOpacity={0.3}
            />
            <YAxis
              domain={[min, max]}
              tick={{ fontSize: 10, fill: "currentColor" }}
              stroke="currentColor"
              strokeOpacity={0.3}
              tickFormatter={(v: number) => v.toFixed(3)}
              width={48}
            />
            <Tooltip
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value: unknown, name: unknown) => {
                if (name === "value") {
                  const v = typeof value === "number" ? value : Number(value);
                  return [v.toFixed(3), "point"];
                }
                return [String(value), String(name)];
              }}
            />
            {/*
              Band rows: ReferenceArea draws a translucent rectangle
              spanning lo..hi on the same date; the midpoint dot is
              drawn as a ReferenceDot on the same y-coordinate.
            */}
            {rows.map((r) =>
              r.lo !== null && r.hi !== null ? (
                <ReferenceArea
                  key={`band-${r.date}`}
                  x1={r.date}
                  x2={r.date}
                  y1={r.lo}
                  y2={r.hi}
                  fill="currentColor"
                  fillOpacity={0.18}
                  stroke="currentColor"
                  strokeOpacity={0.6}
                />
              ) : null
            )}
            {rows.map((r) =>
              r.mid !== null ? (
                <ReferenceDot
                  key={`mid-${r.date}`}
                  x={r.date}
                  y={r.mid}
                  r={2.5}
                  fill="currentColor"
                  ifOverflow="extendDomain"
                />
              ) : null
            )}
            {/*
              Point rows: a Scatter series keyed on `value`. Each point
              row contributes exactly one dot.
            */}
            <Scatter
              data={rows.filter((r) => r.value !== null)}
              dataKey="value"
              fill="currentColor"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {caption === undefined ? null : (
        <figcaption className="text-[10px] text-center text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Internal export used by the recharts-aware unit test below: a
 * pre-projected scatter of point rows for the `value` series. Keeping
 * the projection in one place avoids drift if the data shape changes.
 */
export function pointRowsForScatter(
  points: readonly SeriesPoint[]
): Array<{ date: string; value: number }> {
  return points
    .filter((p) => p.value !== null)
    .map((p) => ({ date: p.obsDate, value: p.value as number }));
}

/** Re-export for tests that want to render a standalone Scatter chart. */
export const RechartsScatterChart = ScatterChart;
