/**
 * recommendation-graph.tsx — T033: the per-recommendation SVG graph
 * (FR-006). For one prediction, plot:
 *
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
 * Pure presentational component over `RecommendationEntry`; pure math, no
 * store access.
 */
import type { RecommendationEntry } from "@/lib/store/recommendations";

const WIDTH = 240;
const HEIGHT = 90;
const PAD_L = 32;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

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

  // Range: band (forecast ± 2*sd) and print value, padded.
  const candidates: number[] = [];
  if (pf !== null) candidates.push(pf);
  if (pf !== null && sd !== null && sd > 0) {
    candidates.push(pf - 2 * sd);
    candidates.push(pf + 2 * sd);
  }
  if (printValue !== null) candidates.push(printValue);
  if (entry.quote !== null) candidates.push(entry.quote.price);

  if (candidates.length === 0) {
    // No numeric anchors at all (pure yes/no direction with no print).
    return (
      <svg
        role="img"
        aria-label="recommendation graph"
        data-testid="rec-graph-empty"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
      >
        <text
          x={WIDTH / 2}
          y={HEIGHT / 2}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={11}
        >
          no numeric anchors
        </text>
      </svg>
    );
  }

  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.05, 0.001) : span * 0.15;
  const lo = min - pad;
  const hi = max + pad;

  const innerW = WIDTH - PAD_L - PAD_R;
  const innerH = HEIGHT - PAD_T - PAD_B;
  const yAt = (v: number): number =>
    PAD_T + (hi === lo ? innerH / 2 : (1 - (v - lo) / (hi - lo)) * innerH);

  const xMid = PAD_L + innerW / 2;
  const xPrint = PAD_L + (innerW * 5) / 6;
  const xQuote = PAD_L + innerW / 6;

  return (
    <svg
      role="img"
      aria-label="recommendation graph"
      data-testid="rec-graph"
      data-band={pf !== null && sd !== null && sd > 0 ? "1" : "0"}
      data-resolved={print !== null ? print.source : "pending"}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto"
    >
      {/* baseline */}
      <line
        x1={PAD_L}
        y1={HEIGHT - PAD_B}
        x2={WIDTH - PAD_R}
        y2={HEIGHT - PAD_B}
        stroke="currentColor"
        strokeOpacity={0.2}
      />
      {/* forecast confidence band (when sd available) */}
      {pf !== null && sd !== null && sd > 0 ? (
        <g>
          <rect
            x={PAD_L}
            y={yAt(pf + 2 * sd)}
            width={innerW}
            height={Math.max(2, yAt(pf - 2 * sd) - yAt(pf + 2 * sd))}
            fill="currentColor"
            fillOpacity={0.15}
            stroke="currentColor"
            strokeOpacity={0.5}
            strokeDasharray="3 2"
          />
          <line
            x1={PAD_L}
            y1={yAt(pf)}
            x2={WIDTH - PAD_R}
            y2={yAt(pf)}
            stroke="currentColor"
            strokeOpacity={0.7}
            strokeWidth={1}
          />
          <text
            x={xMid}
            y={yAt(pf) - 4}
            textAnchor="middle"
            fontSize={9}
            className="fill-muted-foreground font-mono"
          >
            pf {pf.toFixed(3)}
          </text>
        </g>
      ) : null}

      {/* market quote context */}
      {entry.quote !== null ? (
        <g>
          <line
            x1={xQuote}
            y1={yAt(entry.quote.price) - 6}
            x2={xQuote}
            y2={yAt(entry.quote.price) + 6}
            stroke="currentColor"
            strokeOpacity={0.7}
            strokeWidth={2}
          />
          <text
            x={xQuote}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={9}
            className="fill-muted-foreground font-mono"
          >
            quote {entry.quote.price.toFixed(3)}
          </text>
        </g>
      ) : null}

      {/* resolved outcome mark */}
      {print !== null && printValue !== null ? (
        <g>
          {print.lo !== null && print.hi !== null ? (
            <rect
              x={xPrint - 6}
              y={yAt(print.hi)}
              width={12}
              height={Math.max(2, yAt(print.lo) - yAt(print.hi))}
              fill="currentColor"
              fillOpacity={0.4}
              stroke="currentColor"
              strokeOpacity={0.8}
            />
          ) : (
            <circle
              cx={xPrint}
              cy={yAt(printValue)}
              r={4}
              fill="currentColor"
            />
          )}
          <text
            x={xPrint}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={9}
            className="fill-muted-foreground font-mono"
          >
            {print.lo !== null && print.hi !== null
              ? `print ${print.lo.toFixed(3)}–${print.hi.toFixed(3)}`
              : `print ${printValue.toFixed(3)}`}
          </text>
        </g>
      ) : (
        <text
          x={WIDTH - PAD_R - 4}
          y={HEIGHT - PAD_B + 2}
          textAnchor="end"
          fontSize={9}
          className="fill-muted-foreground"
        >
          pending
        </text>
      )}
    </svg>
  );
}
