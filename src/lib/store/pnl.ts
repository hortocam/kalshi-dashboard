/**
 * pnl.ts — FR-001, FR-008, D4 (contracts/data-layer.md, data-model.md
 * PnlView). Realized P&L sums the store's own computed realized_pnl values —
 * settlement math is owned by the store, never re-derived here (spec
 * assumption). Open positions are marked from stored quotes only, with the
 * store's _latest_quote row/bid/ask/close selection copied verbatim from
 * research_store.py; a missing quote renders the mark unavailable, never
 * zero (store convention).
 *
 * Pure read over an OpenedStore; SELECT only.
 */
import type { OpenedStore } from "@/lib/store/open";
import type { Window } from "@/lib/store/observations";

const WINDOW_MS: Record<Exclude<Window, "all">, number> = {
  "7d": 7 * 86400000,
  "30d": 30 * 86400000,
  "90d": 90 * 86400000,
};

export interface PnlWindowOptions {
  /** Window anchor (ms epoch); defaults to the current time. */
  readonly now?: number;
}

export interface RealizedPosition {
  readonly id: number;
  readonly predictionId: number | null;
  readonly marketTicker: string;
  readonly side: "yes" | "no";
  readonly contracts: number;
  readonly fillPrice: number;
  readonly fee: number;
  readonly openedAt: string;
  readonly settledAt: string;
  readonly realizedPnl: number;
}

export interface OpenPosition {
  readonly id: number;
  readonly predictionId: number | null;
  readonly marketTicker: string;
  readonly side: "yes" | "no";
  readonly contracts: number;
  readonly fillPrice: number;
  readonly fee: number;
  readonly openedAt: string;
  /** Mark price actually used (bid/ask/last of the winning quote row). */
  readonly markQuote: number | null;
  /** contracts x (mark - fill) for yes, contracts x ((1 - mark) - fill) for no. */
  readonly mark: number | null;
  /** Present (unavailable note) exactly when the mark could not be computed. */
  readonly markNote?: string;
}

export interface PnlView {
  readonly realized: RealizedPosition[];
  readonly totalRealized: number;
  readonly open: OpenPosition[];
}

interface PositionRow {
  id: number;
  prediction_id: number | null;
  market_ticker: string;
  side: string;
  contracts: number;
  fill_price: number;
  fee: number;
  opened_at: string;
  settled_at: string | null;
  realized_pnl: number | null;
}

/**
 * Copy of research_store.py _latest_quote: the most recent stored quote for
 * a market is the row with the SMALLEST hours_before_close (closest to
 * close), and within that row bid is preferred, then ask, then last
 * (close_dollars). Returns null when nothing is stored.
 */
function latestStoredQuote(store: OpenedStore, marketTicker: string): number | null {
  const row = store.db
    .prepare(
      `SELECT close_dollars, yes_bid_dollars, yes_ask_dollars FROM quotes
       WHERE market_ticker = ? ORDER BY hours_before_close ASC LIMIT 1`
    )
    .get(marketTicker) as
    | { close_dollars: number | null; yes_bid_dollars: number | null; yes_ask_dollars: number | null }
    | undefined;
  if (row === undefined) return null;
  for (const v of [row.yes_bid_dollars, row.yes_ask_dollars, row.close_dollars]) {
    if (v !== null) return v;
  }
  return null;
}

function mapRealized(row: PositionRow): RealizedPosition {
  return {
    id: row.id,
    predictionId: row.prediction_id,
    marketTicker: row.market_ticker,
    side: row.side as "yes" | "no",
    contracts: row.contracts,
    fillPrice: row.fill_price,
    fee: row.fee,
    openedAt: row.opened_at,
    settledAt: row.settled_at as string,
    realizedPnl: row.realized_pnl as number,
  };
}

function markOpen(store: OpenedStore, row: PositionRow): OpenPosition {
  const quote = latestStoredQuote(store, row.market_ticker);
  const base = {
    id: row.id,
    predictionId: row.prediction_id,
    marketTicker: row.market_ticker,
    side: row.side as "yes" | "no",
    contracts: row.contracts,
    fillPrice: row.fill_price,
    fee: row.fee,
    openedAt: row.opened_at,
    markQuote: quote,
  };
  if (quote === null) {
    return { ...base, mark: null, markNote: "no stored quote for this market" };
  }
  const markPrice = row.side === "yes" ? quote : 1.0 - quote;
  return { ...base, mark: row.contracts * (markPrice - row.fill_price) };
}

async function pnl(
  store: OpenedStore,
  window: Window,
  family: string | null,
  options: PnlWindowOptions
): Promise<PnlView> {
  const minDate =
    window === "all" || !options.now
      ? null
      : new Date(options.now - WINDOW_MS[window]).toISOString().slice(0, 10);

  const realizedRows = store.db
    .prepare(
      `SELECT p.* FROM positions p
       WHERE p.settled_at IS NOT NULL AND p.settled_at >= ?
       ORDER BY p.settled_at ASC`
    )
    .all(minDate ?? "") as unknown as PositionRow[];

  // 'all' = no time filter (D4).
  const allRealized =
    minDate === null
      ? (store.db
          .prepare(
            `SELECT p.* FROM positions p
             WHERE p.settled_at IS NOT NULL ORDER BY p.settled_at ASC`
          )
          .all() as unknown as PositionRow[])
      : realizedRows;

  const openRows = store.db
    .prepare(
      `SELECT p.* FROM positions p WHERE p.settled_at IS NULL ORDER BY p.opened_at ASC`
    )
    .all() as unknown as PositionRow[];

  let totalRealized = 0;
  const realized = allRealized.map((row) => {
    totalRealized += row.realized_pnl ?? 0;
    return mapRealized(row);
  });

  // Optional family filter: a position belongs to the family whose
  // series.family name is a prefix of its market_ticker (the store's natural
  // ticker scheme: KXDIESELD-26SEP24-T6.515 -> KXDIESELD). Longest family
  // prefix wins so KXAAAGASM is not swallowed by KXAAAGASD.
  const familyFiltered = (ticker: string): boolean => {
    if (family === null) return true;
    const prefix = `${family}-`;
    return ticker.startsWith(prefix);
  };

  return {
    realized: realized.filter((r) => familyFiltered(r.marketTicker)),
    totalRealized: realized
      .filter((r) => familyFiltered(r.marketTicker))
      .reduce((sum, r) => sum + r.realizedPnl, 0),
    open: openRows
      .filter((r) => familyFiltered(r.market_ticker))
      .map((row) => markOpen(store, row)),
  };
}

export async function getPnl(
  store: OpenedStore,
  window: Window,
  options: PnlWindowOptions = {}
): Promise<PnlView> {
  return pnl(store, window, null, options);
}

export async function getFamilyPnl(
  store: OpenedStore,
  family: string,
  window: Window,
  options: PnlWindowOptions = {}
): Promise<PnlView> {
  return pnl(store, window, family, options);
}