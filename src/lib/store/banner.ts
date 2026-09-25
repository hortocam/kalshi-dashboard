/**
 * banner.ts — FR-004, D5: the latest-recommendations banner
 * (contracts/data-layer.md). One entry per family with at least one
 * attributed prediction; the latest prediction per family ordered by
 * runs.started_at DESC, then predictions.id DESC. traded derives from
 * position linkage (position_id NOT NULL) — never guessed from p_yes.
 *
 * Family attribution matches the scoreboard (hitrate.ts): longest
 * series.family that is a prefix of market_ticker, fallback to series_id's
 * family, else the prediction is unattributed and appears on no banner line.
 *
 * Pure read over an OpenedStore; SELECT only.
 */
import type { OpenedStore } from "@/lib/store/open";

export interface BannerEntry {
  readonly family: string;
  readonly predictionId: number;
  readonly direction: string | null;
  readonly pYes: number;
  readonly marketPrice: number | null;
  readonly edgePoints: number | null;
  readonly pointForecast: number | null;
  readonly forecastSd: number | null;
  readonly targetDate: string | null;
  readonly rationale: string | null;
  readonly traded: boolean;
  readonly run: {
    readonly startedAt: string;
    readonly digestHashPrefix: string;
  };
}

interface PredictionWithRun {
  prediction_id: number;
  market_ticker: string | null;
  series_id: number | null;
  direction: string | null;
  p_yes: number;
  market_price: number | null;
  edge_points: number | null;
  point_forecast: number | null;
  forecast_sd: number | null;
  target_date: string | null;
  rationale: string | null;
  position_id: number | null;
  run_started_at: string;
  digest_hash: string | null;
}

interface SeriesRow {
  id: number;
  family: string;
}

export async function getLatestRecommendations(
  store: OpenedStore
): Promise<BannerEntry[]> {
  const rows = store.db
    .prepare(
      `SELECT p.id AS prediction_id, p.market_ticker, p.series_id, p.direction,
              p.p_yes, p.market_price, p.edge_points, p.point_forecast,
              p.forecast_sd, p.target_date, p.rationale, p.position_id,
              r.started_at AS run_started_at, r.digest_hash
       FROM predictions p
       JOIN runs r ON r.id = p.run_id
       ORDER BY r.started_at DESC, p.id DESC`
    )
    .all() as unknown as PredictionWithRun[];

  const series = store.db
    .prepare("SELECT id, family FROM series")
    .all() as unknown as SeriesRow[];
  const familyById = new Map(series.map((s) => [s.id, s.family]));
  // Longest family name first so KXAAAGASM wins over KXAAAGASD.
  const familiesByLength = [...series].sort(
    (a, b) => b.family.length - a.family.length
  );

  const familyOf = (p: PredictionWithRun): string | null => {
    const ticker = p.market_ticker;
    if (ticker) {
      const match = familiesByLength.find(
        (s) => ticker === s.family || ticker.startsWith(`${s.family}-`)
      );
      if (match) return match.family;
    }
    if (p.series_id !== null) return familyById.get(p.series_id) ?? null;
    return null;
  };

  // D5: one entry per family — the first row per family in the ordered set
  // is that family's latest prediction (runs.started_at DESC, id DESC).
  const seen = new Set<string>();
  const entries: BannerEntry[] = [];
  for (const row of rows) {
    const family = familyOf(row);
    if (family === null || seen.has(family)) continue;
    seen.add(family);
    entries.push({
      family,
      predictionId: row.prediction_id,
      direction: row.direction,
      pYes: row.p_yes,
      marketPrice: row.market_price,
      edgePoints: row.edge_points,
      pointForecast: row.point_forecast,
      forecastSd: row.forecast_sd,
      targetDate: row.target_date,
      rationale: row.rationale,
      traded: row.position_id !== null,
      run: {
        startedAt: row.run_started_at,
        digestHashPrefix: (row.digest_hash ?? "").slice(0, 8),
      },
    });
  }
  return entries;
}