/**
 * historical-chart-card.tsx — T031: the historical-performance card
 * (FR-007, D6). Default window 30d; window selector renders 7d / 30d /
 * 90d / all. The chart itself is a separate component (charts/series-chart);
 * this card owns the selector, the zero state, and the caption.
 *
 * Window selection is via search params (?window=7d|30d|90d|all) so the
 * selection survives reload and is reachable through deep links; the
 * default is 30d (the spec's pinned default).
 */
import Link from "next/link";

import { SeriesChart } from "@/components/charts/series-chart";
import type { SeriesPoint } from "@/lib/store/observations";
import {
  WINDOW_LABELS,
  WINDOW_OPTIONS,
  type Window,
} from "@/lib/windows";

export function HistoricalChartCard({
  family,
  window,
  points,
}: {
  readonly family: string;
  readonly window: Window;
  readonly points: readonly SeriesPoint[];
}) {
  const bandCount = points.filter((p) => p.lo !== null).length;
  const pointCount = points.filter((p) => p.value !== null).length;
  return (
    <section
      data-testid={`historical-chart-card-${family}`}
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold">historical performance</h2>
        <nav aria-label="chart window" className="flex gap-1">
          {WINDOW_OPTIONS.map((w) => (
            <Link
              key={w}
              href={`/markets/${encodeURIComponent(family)}?window=${w}`}
              data-window={w}
              data-window-selected={w === window ? w : undefined}
              className={
                w === window
                  ? "rounded border px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground"
                  : "rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              }
            >
              {WINDOW_LABELS[w]}
            </Link>
          ))}
        </nav>
      </div>
      {points.length === 0 ? (
        <p
          data-testid={`historical-chart-empty-${family}`}
          className="text-xs text-muted-foreground"
        >
          no observations in the {WINDOW_LABELS[window]} window
        </p>
      ) : (
        <SeriesChart
          points={points}
          caption={`${family} • ${WINDOW_LABELS[window]} • ${points.length} dates (${bandCount} band, ${pointCount} point)`}
        />
      )}
    </section>
  );
}
