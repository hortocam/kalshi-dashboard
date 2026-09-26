/**
 * positions-history-card.tsx — T034: per-family position P&L history
 * (FR-008). For each position: entry details (side / contracts / fill /
 * fee), realized P&L for settled ones, and the unrealized mark from the
 * store's stored quotes for open ones. An open position with no stored
 * quote shows "mark unavailable" — store convention, never zero.
 *
 * Pure presentational over the existing PnlView from getFamilyPnl —
 * settlement math is owned by the store and never re-derived here.
 */
import { formatPrice, formatSignedUsd3, formatUsd3 } from "@/lib/format";
import type { PnlView } from "@/lib/store/pnl";

export function PositionsHistoryCard({
  family,
  pnl,
}: {
  readonly family: string;
  readonly pnl: PnlView;
}) {
  const empty =
    pnl.realized.length === 0 && pnl.open.length === 0;
  return (
    <section
      data-testid={`positions-history-card-${family}`}
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold">position history</h2>
        <span
          data-testid={`positions-total-${family}`}
          className="font-mono text-sm"
        >
          realized {formatSignedUsd3(pnl.totalRealized)}
        </span>
      </div>
      {empty ? (
        <p
          data-testid={`positions-empty-${family}`}
          className="text-xs text-muted-foreground"
        >
          no positions for {family}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pnl.realized.length > 0 ? (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-1">
                realized
              </h3>
              <div className="flex flex-col gap-1">
                {pnl.realized.map((p) => (
                  <div
                    key={p.id}
                    data-testid={`position-realized-${p.id}`}
                    className="font-mono text-xs"
                  >
                    {p.marketTicker} {p.side} ×{formatPrice(p.contracts)}{" "}
                    @ {formatPrice(p.fillPrice)} fee {formatPrice(p.fee)} ={" "}
                    {formatSignedUsd3(p.realizedPnl)} (settled{" "}
                    {p.settledAt.slice(0, 19)}Z)
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {pnl.open.length > 0 ? (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-1">
                open (unrealized)
              </h3>
              <div className="flex flex-col gap-1">
                {pnl.open.map((p) => (
                  <div
                    key={p.id}
                    data-testid={`position-open-${p.id}`}
                    className="font-mono text-xs"
                  >
                    {p.marketTicker} {p.side} ×{formatPrice(p.contracts)}{" "}
                    @ {formatPrice(p.fillPrice)}{" "}
                    {p.mark === null
                      ? `mark unavailable (${p.markNote ?? "unavailable"})`
                      : `mark ${formatSignedUsd3(p.mark)} (quote ${formatUsd3(
                          p.markQuote as number
                        )})`}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
