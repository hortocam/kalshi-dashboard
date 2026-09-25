/**
 * Family summary card (FR-002, T021/T022): one card per tracked family with
 * its recent prints, open positions, and realized P&L. The data is assembled
 * server-side by getFamilySnapshot() — the store is only touched there, in
 * the same render process as the homepage server component. No family names
 * or kinds are special-cased anywhere: the card is generic over the store's
 * family list (FR-015).
 *
 * getFamilySnapshot composes the existing P2 query functions (getSeriesWindow,
 * getFamilyPnl) — it adds no SQL of its own.
 */
import {
  getFamilyPnl,
  type OpenPosition,
  type RealizedPosition,
} from "@/lib/store/pnl";
import {
  getSeriesWindow,
  type SeriesPoint,
  type Window,
} from "@/lib/store/observations";
import type { OpenedStore } from "@/lib/store/open";
import { formatPrice, formatSignedUsd3, formatUsd3 } from "@/lib/format";

export interface FamilySnapshot {
  readonly family: string;
  readonly recentPrints: SeriesPoint[];
  readonly realized: RealizedPosition[];
  readonly open: OpenPosition[];
  readonly totalRealized: number;
}

/** SeriesPoint re-exported for tests (the store type is the authority). */
export type { SeriesPoint };

/**
 * One family's summary data, read through the P2 data layer only.
 * `nowMs` anchors the window arithmetic (deterministic in tests).
 */
export async function getFamilySnapshot(
  store: OpenedStore,
  family: string,
  nowMs: number
): Promise<FamilySnapshot> {
  const window: Window = "30d";
  const [recentPrints, realized] = await Promise.all([
    getSeriesWindow(store, family, window, { now: nowMs }),
    getFamilyPnl(store, family, "all"),
  ]);
  return {
    family,
    recentPrints,
    realized: realized.realized,
    open: realized.open,
    totalRealized: realized.totalRealized,
  };
}

/** The three most recent prints, newest last (chart-ready ascending order). */
export function recentPrintsForDisplay(
  prints: SeriesPoint[],
  max = 3
): SeriesPoint[] {
  return prints.slice(-max);
}

function PrintRow({ point }: { point: SeriesPoint }) {
  let price: string;
  if (point.value !== null) {
    price = formatPrice(point.value);
  } else if (point.lo !== null && point.hi !== null) {
    price = `${formatPrice(point.lo)}–${formatPrice(point.hi)} (mid ${formatPrice(
      point.mid as number
    )})`;
  } else if (point.lo !== null) {
    price = `≥ ${formatPrice(point.lo)}`;
  } else if (point.hi !== null) {
    price = `≤ ${formatPrice(point.hi)}`;
  } else {
    price = "no value";
  }
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{point.obsDate}</span>
      <span className="font-mono">{price}</span>
    </div>
  );
}

export function FamilySummaryCard({
  snapshot,
}: {
  snapshot: FamilySnapshot;
}) {
  const { family, recentPrints, realized, open, totalRealized } = snapshot;
  const prints = recentPrintsForDisplay(recentPrints);
  return (
    <div
      data-testid={`family-card-${family}`}
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between">
        <a
          href={`/markets/${encodeURIComponent(family)}`}
          className="text-sm font-semibold hover:underline"
        >
          {family}
        </a>
        <span className="font-mono text-sm">
          {formatSignedUsd3(totalRealized)}
        </span>
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">
          recent prints (30d)
        </div>
        {prints.length === 0 ? (
          <p className="text-xs text-muted-foreground">no prints in window</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {prints.map((p) => (
              <PrintRow key={p.obsDate} point={p} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">
          positions
        </div>
        {open.length === 0 && realized.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            no open positions, no realized positions
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {open.length > 0 ? (
              <p className="text-xs">
                open positions: {open.length}
                {open.map((p) => (
                  <span key={p.id} className="block font-mono">
                    {p.marketTicker} {p.side} ×{formatPrice(p.contracts)} @{" "}
                    {formatPrice(p.fillPrice)}{" "}
                    {p.mark === null
                      ? `mark unavailable (${p.markNote ?? "unavailable"})`
                      : `unrealized mark ${formatSignedUsd3(p.mark)} (mark ${formatUsd3(
                          p.markQuote as number
                        )})`}
                  </span>
                ))}
              </p>
            ) : null}
            {realized.length > 0 ? (
              <p className="text-xs">
                realized positions: {realized.length}
                {realized.map((p) => (
                  <span key={p.id} className="block font-mono">
                    {p.marketTicker} {p.side} ×{formatPrice(p.contracts)} @{" "}
                    {formatPrice(p.fillPrice)} = {formatSignedUsd3(p.realizedPnl)}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** All-families grid, empty state included (T022). */
export function FamilyCardGrid({
  snapshots,
}: {
  snapshots: FamilySnapshot[];
}) {
  if (snapshots.length === 0) {
    return (
      <p data-testid="family-grid-empty" className="text-sm text-muted-foreground">
        no tracked families
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {snapshots.map((s) => (
        <FamilySummaryCard key={s.family} snapshot={s} />
      ))}
    </div>
  );
}

/**
 * Per-family failure state (T026): when one family's reads fail while the
 * store itself is fine, that card shows the failure explicitly — never a
 * hole in the grid.
 */
export function FamilyCardFailure({
  family,
  message,
}: {
  family: string;
  message: string;
}) {
  return (
    <div
      data-testid={`family-card-${family}`}
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4"
    >
      <div className="text-sm font-semibold">{family}</div>
      <p className="text-xs text-destructive">family data unavailable: {message}</p>
    </div>
  );
}