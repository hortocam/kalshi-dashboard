/**
 * observations.ts — FR-007, FR-002, D6 (contracts/data-layer.md).
 *
 * One row per obs_date, selected by the store's series-of-record source
 * priority, copied verbatim from research_store.py (SOURCE_PRIORITY /
 * _src_rank / series_observations): the reconstructed band is the series of
 * record; a band and a point never both render for a date. Band rows carry
 * value null with lo/hi set and mid = (lo + hi) / 2 (the store digest's
 * midpoint convention); point rows carry value with lo/hi null.
 *
 * Pure read over an OpenedStore; SELECT only.
 */
import type { OpenedStore } from "@/lib/store/open";

export type Window = "7d" | "30d" | "90d" | "all";

/** Copy of research_store.py SOURCE_PRIORITY — the store owns the semantics. */
export const SOURCE_PRIORITY = [
  "kalshi_settlement",
  "aaa_page",
  "yahoo_close",
  "kalshi_expiration_value",
] as const;

/** Copy of research_store.py _src_rank: unknown sources rank last, stable. */
function srcRank(source: string): number {
  const idx = (SOURCE_PRIORITY as readonly string[]).indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

export interface SeriesPoint {
  readonly obsDate: string;
  /** Point value when the winning row is a point; null for band rows. */
  readonly value: number | null;
  /** Band lower bound when the winning row is interval-only, else null. */
  readonly lo: number | null;
  /** Band upper bound when the winning row is a band, else null. */
  readonly hi: number | null;
  /** Band midpoint (lo + hi) / 2; null for point rows. */
  readonly mid: number | null;
  readonly source: string;
  readonly quality: string;
  readonly unit: string | null;
}

/** Millisecond lengths of the named windows (D4). */
const WINDOW_MS: Record<Exclude<Window, "all">, number> = {
  "7d": 7 * 86400000,
  "30d": 30 * 86400000,
  "90d": 90 * 86400000,
};

interface RawObservation {
  obs_date: string;
  value: number | null;
  value_lo: number | null;
  value_hi: number | null;
  source: string;
  quality: string;
  unit: string | null;
}

export interface SeriesWindowOptions {
  /**
   * Anchor for window arithmetic (ms epoch). Defaults to the current time;
   * tests inject a fixed anchor to stay deterministic.
   */
  readonly now?: number;
}

/**
 * The family's observation series over `window`, ascending by obs_date, one
 * row per date: the highest-priority source's row wins, bands render as
 * lo/hi + midpoint, point rows as values.
 */
export async function getSeriesWindow(
  store: OpenedStore,
  family: string,
  window: Window,
  options: SeriesWindowOptions = {}
): Promise<SeriesPoint[]> {
  const rows = store.db
    .prepare(
      `SELECT o.obs_date, o.value, o.value_lo, o.value_hi, o.source, o.quality, o.unit
       FROM observations o
       JOIN series s ON s.id = o.series_id
       WHERE s.family = ?
       ORDER BY o.obs_date ASC, o.id ASC`
    )
    .all(family) as unknown as RawObservation[];

  const minDate =
    window === "all" || !options.now
      ? null
      : new Date(options.now - WINDOW_MS[window]).toISOString().slice(0, 10);

  // Source-priority dedupe: exactly one row per date, mirroring the store's
  // series_observations() deterministic pick.
  const byDate = new Map<string, RawObservation>();
  for (const row of rows) {
    if (minDate !== null && row.obs_date < minDate) continue;
    const cur = byDate.get(row.obs_date);
    if (cur === undefined || srcRank(row.source) < srcRank(cur.source)) {
      byDate.set(row.obs_date, row);
    }
  }

  return [...byDate.values()]
    .sort((a, b) => (a.obs_date < b.obs_date ? -1 : a.obs_date > b.obs_date ? 1 : 0))
    .map((row) => {
      const isBand =
        row.value === null && row.value_lo !== null && row.value_hi !== null;
      return {
        obsDate: row.obs_date,
        value: row.value,
        lo: isBand ? row.value_lo : null,
        hi: isBand ? row.value_hi : null,
        mid: isBand ? (row.value_lo as number) / 2 + (row.value_hi as number) / 2 : null,
        source: row.source,
        quality: row.quality,
        unit: row.unit,
      };
    });
}