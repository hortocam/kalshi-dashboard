/**
 * freshness.ts — FR-016, FR-017: StoreStatus (contracts/data-layer.md,
 * data-model.md). staleCount counts the store's own stale-rule violations,
 * copied from research_store.py find_stale (the freshness contract):
 *
 *   1. open ladders (close_ts > now) with fetched_at older than 15 min
 *   2. quote samples for open markets older than 15 min
 *   3. price_series whose newest bar is behind the session date or fetched
 *      more than 30 min ago
 *   4. settlements with status != 'finalized' (revalidation)
 *   5. models with observations fetched after fit_date (DERIVED invalidated)
 *   6. cache_meta rows with expires_at in the past
 *
 * storeRev comes from cache_meta.store_rev (n_rows), lastRunAt from
 * MAX(runs.started_at). Pure read over an OpenedStore; SELECT only.
 */
import type { OpenedStore } from "@/lib/store/open";

/** Copy of research_store.py QUOTE_REFETCH_MIN / CLOSE_REFETCH_MIN (§3). */
const QUOTE_REFETCH_MIN = 15;
const CLOSE_REFETCH_MIN = 30;

export interface StoreStatus {
  readonly reachable: boolean;
  readonly schemaVersion: number;
  readonly storeRev: number | null;
  readonly staleCount: number;
  readonly lastRunAt: string | null;
}

function parseTs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export async function getStoreStatus(
  store: OpenedStore,
  options: { now?: number } = {}
): Promise<StoreStatus> {
  const now = options.now ?? Date.now();
  const nowTs = Math.floor(now / 1000);
  const nowIso = new Date(now).toISOString().replace("Z", "");
  const today = new Date(now).toISOString().slice(0, 10);

  let staleCount = 0;

  const ageMin = (iso: string | null): number | null => {
    const ts = parseTs(iso);
    if (ts === null) return null;
    return Math.round((now - ts) / 60000.0);
  };

  // 1. open ladder / live quotes: refetch within 15 min.
  const openLadders = store.db
    .prepare(
      `SELECT event_ticker, MAX(fetched_at) f FROM markets
       WHERE close_ts > ? GROUP BY event_ticker`
    )
    .all(nowTs) as unknown as { event_ticker: string; f: string | null }[];
  for (const r of openLadders) {
    const a = ageMin(r.f);
    if (a === null || a > QUOTE_REFETCH_MIN) staleCount += 1;
  }

  // 2. quote samples for open markets: 15 min.
  const openQuotes = store.db
    .prepare(
      `SELECT q.market_ticker, MAX(q.fetched_at) f
       FROM quotes q JOIN markets m ON m.market_ticker = q.market_ticker
       WHERE m.close_ts > ? GROUP BY q.market_ticker`
    )
    .all(nowTs) as unknown as { market_ticker: string; f: string | null }[];
  for (const r of openQuotes) {
    const a = ageMin(r.f);
    if (a === null || a > QUOTE_REFETCH_MIN) staleCount += 1;
  }

  // 3. today's partial close: newest bar behind the session date or > 30 min.
  const priceSeries = store.db
    .prepare(`SELECT id, series_ticker FROM series WHERE kind = 'price_series'`)
    .all() as unknown as { id: number; series_ticker: string }[];
  for (const s of priceSeries) {
    const row = store.db
      .prepare(
        `SELECT obs_date, fetched_at FROM observations WHERE series_id = ?
         ORDER BY obs_date DESC LIMIT 1`
      )
      .get(s.id) as unknown as
      | { obs_date: string; fetched_at: string }
      | undefined;
    if (row === undefined) {
      staleCount += 1;
      continue;
    }
    const a = ageMin(row.fetched_at);
    if (row.obs_date < today || a === null || a > CLOSE_REFETCH_MIN) {
      staleCount += 1;
    }
  }

  // 4. settlements that are not final: revalidate.
  const unsettled = store.db
    .prepare(`SELECT COUNT(*) n FROM settlements WHERE status != 'finalized'`)
    .get() as unknown as { n: number };
  staleCount += unsettled.n;

  // 5. models invalidated by any input row fetched after the fit date.
  const models = store.db
    .prepare(
      `SELECT mo.series_id, mo.model_name, mo.fit_date FROM models mo`
    )
    .all() as unknown as { series_id: number; model_name: string; fit_date: string }[];
  for (const m of models) {
    const newest = store.db
      .prepare(
        `SELECT MAX(date(fetched_at)) d FROM observations WHERE series_id = ?
         AND date(fetched_at) IS NOT NULL`
      )
      .get(m.series_id) as unknown as { d: string | null };
    if (newest.d !== null && newest.d > m.fit_date) staleCount += 1;
  }

  // 6. cached artifacts with an explicit expiry that has passed.
  const expired = store.db
    .prepare(
      `SELECT COUNT(*) n FROM cache_meta
       WHERE expires_at IS NOT NULL AND expires_at < ?`
    )
    .get(nowIso) as unknown as { n: number };
  staleCount += expired.n;

  const revRow = store.db
    .prepare(`SELECT n_rows FROM cache_meta WHERE key = 'store_rev'`)
    .get() as unknown as { n_rows: number | null } | undefined;

  const lastRun = store.db
    .prepare(`SELECT MAX(started_at) m FROM runs`)
    .get() as unknown as { m: string | null };

  return {
    reachable: true,
    schemaVersion: store.schemaVersion,
    storeRev: revRow?.n_rows ?? null,
    staleCount,
    lastRunAt: lastRun.m ?? null,
  };
}