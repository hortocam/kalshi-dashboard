/**
 * hitrate.ts — FR-009, D2: the recommendation hit-rate scoreboard
 * (contracts/data-layer.md, data-model.md ScoreboardEntry — normative).
 *
 * The per-prediction classification is copied from the store's own scoring
 * semantics (research_store.py digest §1 / resolve-predictions), first match
 * wins:
 *   1. resolved_at IS NULL OR outcome IS NULL        -> pending
 *   2. point_forecast NOT NULL AND forecast_sd > 0   -> success iff |error| <= forecast_sd
 *   3. outcome IN ('yes','no')                       -> success iff outcome == direction
 *   4. otherwise                                     -> unscored (shown, never dropped)
 *
 * Family attribution (first match wins): the longest series.family that is a
 * prefix of market_ticker; fallback to the linked series_id's family; else
 * unattributed. Position linkage is irrelevant to scoring (D2 rule 5) — the
 * product owner's hard requirement.
 *
 * Pure read over an OpenedStore; SELECT only.
 */
import type { OpenedStore } from "@/lib/store/open";

export interface ScoreCounts {
  readonly success: number;
  readonly fail: number;
  readonly pending: number;
  readonly unscored: number;
}

export interface ScoreboardEntry extends ScoreCounts {
  readonly family: string;
  /** success / (success + fail); null while nothing is scored. */
  readonly hitRate: number | null;
}

export interface Scoreboard {
  readonly families: ScoreboardEntry[];
  readonly unattributed: ScoreCounts;
}

interface PredictionRow {
  id: number;
  market_ticker: string | null;
  series_id: number | null;
  resolved_at: string | null;
  outcome: string | null;
  direction: string | null;
  point_forecast: number | null;
  forecast_sd: number | null;
  error: number | null;
}

interface SeriesRow {
  id: number;
  family: string;
}

export type Verdict = "success" | "fail" | "pending" | "unscored";

/** The pinned classification, first match wins (D2). */
export function classifyPrediction(p: {
  resolved_at: string | null;
  outcome: string | null;
  point_forecast: number | null;
  forecast_sd: number | null;
  error: number | null;
  direction: string | null;
}): Verdict {
  if (p.resolved_at === null || p.outcome === null) return "pending";
  if (p.point_forecast !== null && p.forecast_sd !== null && p.forecast_sd > 0) {
    return p.error !== null && Math.abs(p.error) <= p.forecast_sd ? "success" : "fail";
  }
  if (p.outcome === "yes" || p.outcome === "no") {
    return p.outcome === p.direction ? "success" : "fail";
  }
  return "unscored";
}

const EMPTY_COUNTS = (): {
  success: number;
  fail: number;
  pending: number;
  unscored: number;
} => ({ success: 0, fail: 0, pending: 0, unscored: 0 });

function hitRateOf(counts: {
  success: number;
  fail: number;
  pending: number;
  unscored: number;
}): number | null {
  const scored = counts.success + counts.fail;
  return scored > 0 ? counts.success / scored : null;
}

export async function getScoreboard(
  store: OpenedStore,
  family?: string
): Promise<Scoreboard> {
  const series = store.db.prepare("SELECT id, family FROM series").all() as unknown as SeriesRow[];
  const predictions = store.db
    .prepare("SELECT id, market_ticker, series_id, resolved_at, outcome, direction, point_forecast, forecast_sd, error FROM predictions")
    .all() as unknown as PredictionRow[];

  // Longest family prefix wins (D2 rule 6): sort by descending name length
  // so KXAAAGASM is tested before KXAAAGASD when both could match.
  const familiesByName = [...series].sort((a, b) => b.family.length - a.family.length);

  const byFamily = new Map<string, ReturnType<EMPTY_COUNTS>>();
  for (const s of series) byFamily.set(s.family, EMPTY_COUNTS());
  const unattributed = EMPTY_COUNTS();

  const countsFor = (family: string): ReturnType<EMPTY_COUNTS> => {
    let c = byFamily.get(family);
    if (!c) {
      c = EMPTY_COUNTS();
      byFamily.set(family, c);
    }
    return c;
  };

  for (const p of predictions) {
    let family: string | null = null;
    const ticker = p.market_ticker;
    if (ticker) {
      const match = familiesByName.find(
        (s) => ticker === s.family || ticker.startsWith(`${s.family}-`)
      );
      if (match) family = match.family;
    }
    if (family === null && p.series_id !== null) {
      const linked = series.find((s) => s.id === p.series_id);
      if (linked) family = linked.family;
    }

    const verdict = classifyPrediction(p);
    const target = family === null ? unattributed : countsFor(family);
    target[verdict] += 1;
  }

  let entries = [...byFamily.entries()].map(([fam, counts]) => ({
    family: fam,
    ...counts,
    hitRate: hitRateOf(counts),
  }));
  if (family !== undefined) {
    entries = entries.filter((e) => e.family === family);
  }
  entries.sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0));

  return { families: entries, unattributed };
}

type EMPTY_COUNTS = typeof EMPTY_COUNTS;