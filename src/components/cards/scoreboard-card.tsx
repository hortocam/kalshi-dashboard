/**
 * scoreboard-card.tsx — T032: the hit-rate scoreboard card (FR-009, SC-003).
 * Counts: success / fail / pending / unscored + hit rate (success / scored).
 * Renders a per-family board — the page is per-market, so there is only
 * one family's numbers visible. Hit rate is null while no prediction is
 * scored (never NaN, never a misleading 0%).
 *
 * The hard requirement: position linkage never affects scoring — predictions
 * with no position are counted identically to predictions with one. The
 * store module (hitrate.ts) owns that; this card is presentation only.
 */
import { formatPercent } from "@/lib/format";
import type { ScoreboardEntry } from "@/lib/store/hitrate";

export function ScoreboardCard({
  family,
  board,
}: {
  readonly family: string;
  readonly board: ScoreboardEntry;
}) {
  const total = board.success + board.fail + board.pending + board.unscored;
  return (
    <section
      data-testid={`scoreboard-card-${family}`}
      data-success={board.success}
      data-fail={board.fail}
      data-pending={board.pending}
      data-unscored={board.unscored}
      data-hit-rate={board.hitRate === null ? "" : board.hitRate.toFixed(4)}
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-3"
    >
      <h2 className="text-sm font-semibold">hit-rate scoreboard</h2>
      {total === 0 ? (
        <p
          data-testid={`scoreboard-empty-${family}`}
          className="text-xs text-muted-foreground"
        >
          no predictions yet
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            data-testid={`scoreboard-counts-${family}`}
            className="font-mono text-sm grid grid-cols-2 gap-y-0.5 gap-x-4"
          >
            <span className="text-muted-foreground">success</span>
            <span>{board.success}</span>
            <span className="text-muted-foreground">fail</span>
            <span>{board.fail}</span>
            <span className="text-muted-foreground">pending</span>
            <span>{board.pending}</span>
            <span className="text-muted-foreground">unscored</span>
            <span>{board.unscored}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">hit rate</span>
            <span
              data-testid={`scoreboard-hit-rate-${family}`}
              className="font-mono text-2xl font-semibold"
            >
              {board.hitRate === null ? "—" : formatPercent(board.hitRate)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            counted regardless of position linkage (no-position predictions
            score the same as predicted ones — see FR-009).
          </p>
        </div>
      )}
    </section>
  );
}
