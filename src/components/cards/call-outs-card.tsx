/**
 * call-outs-card.tsx — T035: the family's change notes / call-outs card
 * (FR-010). The store has no dedicated call-outs table; the recorded
 * per-prediction rationale text IS the call-out (the skill's
 * human-meaningful note for that day's call). The card surfaces those
 * rationales most-recent first (same ordering the recommendations list
 * uses), with run context for traceability. Predictions with no
 * rationale produce no call-out line.
 *
 * Pure presentational over `CallOut[]`; no store access.
 */
import type { CallOut } from "@/lib/store/callouts";

export function CallOutsCard({
  family,
  callOuts,
}: {
  readonly family: string;
  readonly callOuts: readonly CallOut[];
}) {
  return (
    <section
      data-testid={`call-outs-card-${family}`}
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-3"
    >
      <h2 className="text-sm font-semibold">call-outs / change notes</h2>
      {callOuts.length === 0 ? (
        <p
          data-testid={`call-outs-empty-${family}`}
          className="text-xs text-muted-foreground"
        >
          no call-outs recorded for {family}
        </p>
      ) : (
        <ol className="flex flex-col gap-2 list-none">
          {callOuts.map((c) => (
            <li
              key={c.predictionId}
              data-testid={`call-out-${c.predictionId}`}
              className="rounded border p-2 flex flex-col gap-1"
            >
              <div className="text-xs font-mono text-muted-foreground">
                {c.run.startedAt.slice(0, 19)}Z · #{c.predictionId} ·{" "}
                {c.marketTicker}
                {c.targetDate === null ? null : (
                  <span> · target {c.targetDate}</span>
                )}
              </div>
              <p className="text-xs">{c.rationale}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
