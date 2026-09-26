/**
 * recommendations.ts — FR-006: the per-market recommendation list
 * (contracts/data-layer.md). One row per prediction attributed to the
 * family, ordered most-recent first by (runs.started_at DESC,
 * predictions.id DESC) — the same "latest per family" ordering pinned by
 * D5 for the homepage banner, extended across the whole history.
 *
 * Each row carries:
 *   - the prediction itself (direction / point_forecast / forecast_sd /
 *     target_date / rationale / resolved_at / outcome / error);
 *   - the market quote context (FR-006: "market quote context from stored
 *     quotes") — the latest stored quote for the prediction's market
 *     (smallest hours_before_close, bid → ask → close), never recomputed;
 *   - the resolved-outcome mark (FR-006: "resolved outcome mark") — the
 *     actual print for the prediction's target_date from the family's
 *     observation series (the source-priority series-of-record), or null
 *     when the target_date has no stored print (the prediction is pending).
 *
 * Family attribution mirrors hitrate.ts/banner.ts: longest series.family
 * that is a prefix of market_ticker, fallback to series_id's family,
 * else the prediction is unattributed and never appears on a per-market
 * page (the per-market page has no "unattributed" line — there is no
 * family for those rows).
 *
 * Pure read over an OpenedStore; SELECT only.
 */
import type { OpenedStore } from "@/lib/store/open";

export interface QuoteRow {
  /** bid → ask → close selection (the same rule getPnl uses). */
  readonly price: number;
  /** The quote row that won, for trace/test evidence. */
  readonly hoursBeforeClose: number;
  /** Raw close_dollars (for "mid: bid 0.72, ask 0.76, close 0.76" display). */
  readonly bidDollars: number | null;
  readonly askDollars: number | null;
  readonly closeDollars: number | null;
}

export interface ResolvedPrint {
  /** The source-priority observation for the prediction's target_date. */
  readonly obsDate: string;
  /** value (point rows), lo/hi (band rows), or all-null when no print. */
  readonly value: number | null;
  readonly lo: number | null;
  readonly hi: number | null;
  readonly mid: number | null;
  readonly source: string;
}

export interface RecommendationEntry {
  readonly predictionId: number;
  readonly marketTicker: string;
  readonly targetDate: string | null;
  readonly direction: string | null;
  readonly pYes: number;
  readonly marketPrice: number | null;
  readonly edgePoints: number | null;
  /** Confidence interval: forecast_sd * 2 around point_forecast (one sigma band, ±2σ wide). */
  readonly pointForecast: number | null;
  readonly forecastSd: number | null;
  readonly rationale: string | null;
  readonly resolvedAt: string | null;
  readonly outcome: string | null;
  /** error = actual - forecast (print value - point_forecast), or null. */
  readonly error: number | null;
  /** Position linkage (traded on the recommendation). */
  readonly positionId: number | null;
  readonly run: {
    readonly startedAt: string;
    readonly digestHashPrefix: string;
  };
  /** Market quote context (FR-006); null when the market has no stored quote. */
  readonly quote: QuoteRow | null;
  /** Resolved outcome mark (FR-006); null when no print yet (pending). */
  readonly resolvedPrint: ResolvedPrint | null;
}

interface PredictionWithRunRow {
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
  resolved_at: string | null;
  outcome: string | null;
  error: number | null;
  position_id: number | null;
  run_started_at: string;
  digest_hash: string | null;
}

interface SeriesRow {
  id: number;
  family: string;
}

interface ObservationRawRow {
  obs_date: string;
  value: number | null;
  value_lo: number | null;
  value_hi: number | null;
  source: string;
}

/** Source-priority copy from observations.ts — the dashboard never recomputes. */
const SOURCE_PRIORITY = [
  "kalshi_settlement",
  "aaa_page",
  "yahoo_close",
  "kalshi_expiration_value",
] as const;

function srcRank(source: string): number {
  const idx = (SOURCE_PRIORITY as readonly string[]).indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

function latestQuoteForMarket(
  store: OpenedStore,
  marketTicker: string
): QuoteRow | null {
  const row = store.db
    .prepare(
      `SELECT close_dollars, yes_bid_dollars, yes_ask_dollars, hours_before_close
       FROM quotes
       WHERE market_ticker = ?
       ORDER BY hours_before_close ASC LIMIT 1`
    )
    .get(marketTicker) as
    | {
        close_dollars: number | null;
        yes_bid_dollars: number | null;
        yes_ask_dollars: number | null;
        hours_before_close: number;
      }
    | undefined;
  if (row === undefined) return null;
  // Same selection rule as pnl.ts: bid → ask → close.
  const bid = row.yes_bid_dollars;
  const ask = row.yes_ask_dollars;
  const close = row.close_dollars;
  const price = bid ?? ask ?? close;
  if (price === null) return null;
  return {
    price,
    hoursBeforeClose: row.hours_before_close,
    bidDollars: bid,
    askDollars: ask,
    closeDollars: close,
  };
}

function resolvedPrintFor(
  store: OpenedStore,
  seriesId: number,
  targetDate: string
): ResolvedPrint | null {
  // All rows for the date, then source-priority pick (D6).
  const rows = store.db
    .prepare(
      `SELECT obs_date, value, value_lo, value_hi, source
       FROM observations
       WHERE series_id = ? AND obs_date = ?`
    )
    .all(seriesId, targetDate) as unknown as ObservationRawRow[];
  if (rows.length === 0) return null;
  const winner = [...rows].sort(
    (a, b) => srcRank(a.source) - srcRank(b.source)
  )[0];
  const isBand =
    winner.value === null && winner.value_lo !== null && winner.value_hi !== null;
  return {
    obsDate: winner.obs_date,
    value: winner.value,
    lo: isBand ? winner.value_lo : null,
    hi: isBand ? winner.value_hi : null,
    mid:
      isBand
        ? (winner.value_lo as number) / 2 + (winner.value_hi as number) / 2
        : null,
    source: winner.source,
  };
}

/**
 * The family's recommendation list (FR-006). Most-recent first.
 * Position linkage does not gate inclusion — the scoreboard counts every
 * prediction regardless (the hard requirement). When `family` does not
 * exist in the store the result is [] (the page renders its zero state;
 * never 404, never a stack trace).
 */
export async function getRecommendations(
  store: OpenedStore,
  family: string
): Promise<RecommendationEntry[]> {
  const series = store.db
    .prepare("SELECT id, family FROM series")
    .all() as unknown as SeriesRow[];
  // Longest family name first so KXAAAGASM wins over KXAAAGASD (D2 trap).
  const familiesByLength = [...series].sort(
    (a, b) => b.family.length - a.family.length
  );
  const familyById = new Map(series.map((s) => [s.id, s.family]));

  const familyOf = (p: PredictionWithRunRow): string | null => {
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

  const allPredictions = store.db
    .prepare(
      `SELECT p.id AS prediction_id, p.market_ticker, p.series_id, p.direction,
              p.p_yes, p.market_price, p.edge_points, p.point_forecast,
              p.forecast_sd, p.target_date, p.rationale, p.resolved_at,
              p.outcome, p.error, p.position_id,
              r.started_at AS run_started_at, r.digest_hash
       FROM predictions p
       JOIN runs r ON r.id = p.run_id
       ORDER BY r.started_at DESC, p.id DESC`
    )
    .all() as unknown as PredictionWithRunRow[];

  // Cache the series_id for the family once — every entry needs it.
  const familySeriesId = (() => {
    const row = series.find((s) => s.family === family);
    return row?.id ?? null;
  })();

  const entries: RecommendationEntry[] = [];
  for (const row of allPredictions) {
    const f = familyOf(row);
    if (f !== family) continue;
    const quote =
      row.market_ticker === null ? null : latestQuoteForMarket(store, row.market_ticker);
    const print =
      row.target_date !== null && familySeriesId !== null
        ? resolvedPrintFor(store, familySeriesId, row.target_date)
        : null;
    entries.push({
      predictionId: row.prediction_id,
      marketTicker: row.market_ticker ?? "",
      targetDate: row.target_date,
      direction: row.direction,
      pYes: row.p_yes,
      marketPrice: row.market_price,
      edgePoints: row.edge_points,
      pointForecast: row.point_forecast,
      forecastSd: row.forecast_sd,
      rationale: row.rationale,
      resolvedAt: row.resolved_at,
      outcome: row.outcome,
      error: row.error,
      positionId: row.position_id,
      run: {
        startedAt: row.run_started_at,
        digestHashPrefix: (row.digest_hash ?? "").slice(0, 8),
      },
      quote,
      resolvedPrint: print,
    });
  }
  return entries;
}
