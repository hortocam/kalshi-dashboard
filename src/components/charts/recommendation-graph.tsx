/**
 * recommendation-graph.tsx — T033: the per-recommendation graph (FR-006),
 * rendered on Recharts (plan.md stack decision; T043 migration).
 *
 * For one prediction, plot:
 *   - the forecast's confidence band — forecast_sd * 2 wide, centered on
 *     point_forecast (the canonical ±2σ band the skill communicates);
 *     band only when forecast_sd > 0 (no band for print-direction or
 *     yes/no market-outcome calls — those carry no sd);
 *   - the market quote context — the latest stored quote's price, with a
 *     thin marker; missing when no quote is stored (the market was never
 *     quoted, e.g. dead diesel ladder);
 *   - the resolved outcome mark — the source-priority print for the
 *     prediction's target_date (band or point, whichever won); pending
 *     when no print yet (the prediction's target_date is in the future
 *     or no observation was fetched).
 *
 * Visual contract (semantic testids/data-attrs preserved):
 *   - data-testid="rec-graph" / "rec-graph-empty"
 *   - data-band="1" when forecast_sd > 0, "0" otherwise
 *   - data-resolved=source when a print exists, "pending" otherwise
 *   - the band print label "lo.toFixed(3)–hi.toFixed(3)" appears verbatim
 *
 * Pure presentational component over `RecommendationEntry`; pure math, no
 * store access.
 */
"use client";

import {
  ComposedChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  YAxis,
} from "recharts";

import type { RecommendationEntry } from "@/lib/store/recommendations";

const WIDTH = 240;
const HEIGHT = 90;

export function RecommendationGraph({
  entry,
}: {
  readonly entry: RecommendationEntry;
}) {
  const pf = entry.pointForecast;
  const sd = entry.forecastSd;
  const print = entry.resolvedPrint;
  const printValue =
    print === null
      ? null
      : print.value !== null
      ? print.value
      : print.mid;

  // Anchors: forecast ± 2*sd, print value, quote price.
  const candidates: number[] = [];
  if (pf !== null) candidates.push(pf);
  if (pf !== null && sd !== null && sd > 0) {
    candidates.push(pf - 2 * sd);
    candidates.push(pf + 2 * sd);
  }
  if (printValue !== null) candidates.push(printValue);
  if (entry.quote !== null) candidates.push(entry.quote.price);

  const hasBand = pf !== null && sd !== null && sd > 0;

  if (candidates.length === 0) {
    return (
      <div
        role="img"
        aria-label="recommendation graph"
        data-testid="rec-graph-empty"
        data-band="0"
        data-resolved="pending"
        className="w-[240px] text-center text-[11px] text-muted-foreground"
      >
        no numeric anchors
      </div>
    );
  }

  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.05, 0.001) : span * 0.15;
  const lo = min - pad;
  const hi = max + pad;

  // Single-row chart: x is categorical, y is the numeric value.
  const data = [{ x: "pred", pf, lo: hasBand ? (pf as number) - 2 * (sd as number) : null, hi: hasBand ? (pf as number) + 2 * (sd as number) : null, print: printValue, quote: entry.quote?.price ?? null }];

  return (
    <figure
      data-testid="rec-graph"
      data-band={hasBand ? "1" : "0"}
      data-resolved={print !== null ? print.source : "pending"}
      className="flex flex-col gap-1 w-[240px]"
    >
      <div
        style={{ width: WIDTH, height: HEIGHT }}
        aria-label="recommendation graph"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 8, bottom: 22, left: 32 }}
          >
            <YAxis
              domain={[lo, hi]}
              hide
              width={32}
            />
            {/* Forecast sd band (when sd available). */}
            {hasBand ? (
              <ReferenceArea
                x1="pred"
                x2="pred"
                y1={pf - 2 * sd}
                y2={pf + 2 * sd}
                fill="currentColor"
                fillOpacity={0.15}
                stroke="currentColor"
                strokeOpacity={0.5}
                strokeDasharray="3 2"
              />
            ) : null}
            {/* Point forecast line. */}
            {pf !== null ? (
              <ReferenceLine
                y={pf}
                stroke="currentColor"
                strokeOpacity={0.7}
                strokeWidth={1}
                ifOverflow="extendDomain"
              />
            ) : null}
            {/* Market quote context. */}
            {entry.quote !== null ? (
              <ReferenceLine
                x="pred"
                stroke="currentColor"
                strokeOpacity={0.7}
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            ) : null}
            {/* Resolved outcome mark. */}
            {print !== null && printValue !== null ? (
              print.lo !== null && print.hi !== null ? (
                <ReferenceArea
                  x1="pred"
                  x2="pred"
                  y1={print.lo}
                  y2={print.hi}
                  fill="currentColor"
                  fillOpacity={0.4}
                  stroke="currentColor"
                  strokeOpacity={0.8}
                />
              ) : (
                <ReferenceDot
                  x="pred"
                  y={printValue}
                  r={4}
                  fill="currentColor"
                  ifOverflow="extendDomain"
                />
              )
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="flex justify-between text-[9px] font-mono text-muted-foreground">
        {entry.quote === null ? (
          <span aria-hidden="true">&nbsp;</span>
        ) : (
          <span>quote {entry.quote.price.toFixed(3)}</span>
        )}
        {print === null || printValue === null ? (
          <span>pending</span>
        ) : (
          <span>
            {print.lo !== null && print.hi !== null
              ? `print ${print.lo.toFixed(3)}–${print.hi.toFixed(3)}`
              : `print ${printValue.toFixed(3)}`}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
