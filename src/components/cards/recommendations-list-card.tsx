/**
 * recommendations-list-card.tsx — T033: the family's recommendation
 * history list (FR-006). One entry per recorded prediction attributed to
 * the family, most recent first. Each entry shows its per-recommendation
 * graph (forecast sd band, market quote context, resolved outcome mark)
 * and the recorded rationale.
 *
 * Pure presentational over `RecommendationEntry[]`; never re-derives
 * settlement math.
 */
import { RecommendationGraph } from "@/components/charts/recommendation-graph";
import { directionLabel, edgeLabel } from "@/lib/banner-view";
import { formatPrice, formatPercent, formatSignedUsd3 } from "@/lib/format";
import type { RecommendationEntry } from "@/lib/store/recommendations";

function ResolvedBadge({ entry }: { readonly entry: RecommendationEntry }) {
  if (entry.resolvedAt === null || entry.outcome === null) {
    return (
      <span className="rounded border px-1.5 py-0.5 text-xs">pending</span>
    );
  }
  if (
    entry.pointForecast !== null &&
    entry.forecastSd !== null &&
    entry.forecastSd > 0
  ) {
    if (entry.error !== null && Math.abs(entry.error) <= entry.forecastSd) {
      return (
        <span
          data-testid={`rec-success-${entry.predictionId}`}
          className="rounded border px-1.5 py-0.5 text-xs"
        >
          success
        </span>
      );
    }
    return (
      <span
        data-testid={`rec-fail-${entry.predictionId}`}
        className="rounded border px-1.5 py-0.5 text-xs"
      >
        fail
      </span>
    );
  }
  if (entry.outcome === "yes" || entry.outcome === "no") {
    if (entry.outcome === entry.direction) {
      return (
        <span
          data-testid={`rec-success-${entry.predictionId}`}
          className="rounded border px-1.5 py-0.5 text-xs"
        >
          success
        </span>
      );
    }
    return (
      <span
        data-testid={`rec-fail-${entry.predictionId}`}
        className="rounded border px-1.5 py-0.5 text-xs"
      >
        fail
      </span>
    );
  }
  return (
    <span className="rounded border px-1.5 py-0.5 text-xs">unscored</span>
  );
}

export function RecommendationsListCard({
  family,
  entries,
}: {
  readonly family: string;
  readonly entries: readonly RecommendationEntry[];
}) {
  return (
    <section
      data-testid={`recommendations-list-card-${family}`}
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-3"
    >
      <h2 className="text-sm font-semibold">recommendations</h2>
      {entries.length === 0 ? (
        <p
          data-testid={`recommendations-empty-${family}`}
          className="text-xs text-muted-foreground"
        >
          no recommendations yet for {family}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => {
            const edge = edgeLabel(entry.edgePoints, entry.direction);
            return (
              <article
                key={entry.predictionId}
                data-testid={`recommendation-${entry.predictionId}`}
                className="rounded border p-3 flex flex-col gap-2"
              >
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-xs font-mono">
                    #{entry.predictionId} · {entry.marketTicker}
                    {entry.targetDate === null ? null : (
                      <span> · target {entry.targetDate}</span>
                    )}
                    <span> · run {entry.run.startedAt.slice(0, 19)}Z</span>
                    <span> · p_yes {formatPercent(entry.pYes)}</span>
                    {entry.marketPrice === null ? null : (
                      <span> · market {formatPercent(entry.marketPrice)}</span>
                    )}
                  </div>
                  <ResolvedBadge entry={entry} />
                </header>
                <div className="text-xs">
                  {directionLabel(
                    entry.direction,
                    entry.pYes,
                    entry.pointForecast
                  )}
                  {edge === null ? null : <span>, {edge}</span>}
                </div>
                {entry.positionId !== null ? (
                  <div className="text-xs text-primary">traded (position #{entry.positionId})</div>
                ) : null}
                <RecommendationGraph entry={entry} />
                {entry.rationale === null ? null : (
                  <p className="text-xs text-muted-foreground">
                    {entry.rationale}
                  </p>
                )}
                {entry.error !== null ? (
                  <p className="font-mono text-xs">
                    error {formatSignedUsd3(entry.error)}{" "}
                    {entry.forecastSd === null ? null : (
                      <span className="text-muted-foreground">
                        (sd {formatPrice(entry.forecastSd)})
                      </span>
                    )}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
