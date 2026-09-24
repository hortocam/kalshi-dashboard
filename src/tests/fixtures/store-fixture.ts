/**
 * buildStoreFixture() — synthetic research store for golden tests (T010,
 * contracts/data-layer.md invariant 4, research.md D7).
 *
 * The schema DDL below is copied VERBATIM from `research_store.py`
 * (kalshi-skill repo, schema v2): BASE_SCHEMA_SQL + POSITIONS_SCHEMA_SQL
 * (SCHEMA_SQL + SCHEMA_SQL_V2) plus the guarded v2 ALTER that adds
 * `predictions.position_id`. The dashboard owns none of the schema; the
 * fixture reproduces it exactly so golden tests exercise the real column
 * names, types, and CHECK/UNIQUE constraints.
 *
 * Seed rows reproduce the contract's golden fixture A (live-store snapshot
 * 2026-09-24): 6 families, 12 predictions, 1 realized position (−5.001),
 * store_rev 3804, the two pinned KXDIESELD settlement bands — plus synthetic
 * rows exercising rules the golden numbers do not pin (source-priority point
 * winners, quote row selection, banner tie-breaks). The live store is NEVER
 * opened here: every test gets a fresh temp-directory store.
 *
 * This file lives in tests/fixtures/ — the one zone the invariant scanner
 * exempts from the "no write statements under src/" rule, because a fixture
 * builder must create the schema and seed rows (documented in
 * invariant-scan.ts). Nothing under src/lib ever issues a write.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Schema version the dashboard supports (contracts: SUPPORTED_SCHEMA_VERSIONS = [2]). */
export const FIXTURE_SCHEMA_VERSION = 2;

// ---- verbatim copy: research_store.py SCHEMA_SQL (v1 base) ----------------
export const BASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version(
  version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS series(            -- one row per tracked series
  id INTEGER PRIMARY KEY,
  family TEXT NOT NULL,                       -- opaque: 'KXDIESELD', 'HO=F'
  series_ticker TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,                         -- opaque: 'daily_ladder', ...
  settlement_tz TEXT,
  close_hhmm TEXT,
  strike_step REAL,
  created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS observations(      -- reconstructed/actual series
  id INTEGER PRIMARY KEY,
  series_id INTEGER NOT NULL REFERENCES series(id),
  obs_date TEXT NOT NULL,                     -- the print's own date
  value REAL,                                 -- point value when known
  value_lo REAL, value_hi REAL,               -- band bounds when interval-only
  unit TEXT,
  source TEXT NOT NULL,
  quality TEXT NOT NULL DEFAULT 'final',
  asof TEXT NOT NULL,                         -- when the SOURCE says so
  fetched_at TEXT NOT NULL,                   -- when we pulled it
  UNIQUE(series_id, obs_date, source));

CREATE TABLE IF NOT EXISTS settlements(       -- one row per settled event
  event_ticker TEXT PRIMARY KEY,
  series_id INTEGER NOT NULL REFERENCES series(id),
  obs_date TEXT NOT NULL,
  close_ts INTEGER NOT NULL,
  band_lo REAL, band_hi REAL, mid REAL,
  n_strikes INTEGER, n_quoted INTEGER,
  status TEXT,
  asof TEXT NOT NULL, fetched_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS markets(           -- strikes: ladder + arithmetic
  market_ticker TEXT PRIMARY KEY,
  event_ticker TEXT NOT NULL,
  floor_strike REAL, strike_type TEXT,
  result TEXT,
  close_ts INTEGER NOT NULL, close_time TEXT,
  rules_hash TEXT,
  asof TEXT NOT NULL, fetched_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS quotes(            -- calibration sample
  market_ticker TEXT NOT NULL,
  end_period_ts INTEGER NOT NULL,
  hours_before_close REAL NOT NULL,
  close_dollars REAL, yes_bid_dollars REAL, yes_ask_dollars REAL,
  volume_fp REAL, open_interest_fp REAL,
  asof TEXT NOT NULL, fetched_at TEXT NOT NULL,
  PRIMARY KEY(market_ticker, hours_before_close));

CREATE TABLE IF NOT EXISTS models(            -- DERIVED, persisted for drift
  series_id INTEGER NOT NULL REFERENCES series(id),
  model_name TEXT NOT NULL,
  fit_date TEXT NOT NULL,
  n_obs INTEGER, params TEXT NOT NULL,
  resid_sd REAL, r2 REAL,
  inputs_rev INTEGER NOT NULL,
  PRIMARY KEY(series_id, model_name, fit_date));

CREATE TABLE IF NOT EXISTS predictions(       -- yesterday's expectation
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  market_ticker TEXT, series_id INTEGER,
  event_ticker TEXT, target_date TEXT,
  p_yes REAL NOT NULL,
  market_price REAL,
  edge_points REAL,
  direction TEXT,
  point_forecast REAL,
  forecast_sd REAL,
  rationale TEXT,
  resolved_at TEXT, outcome TEXT, error REAL);

CREATE TABLE IF NOT EXISTS cache_meta(        -- the freshness contract
  key TEXT PRIMARY KEY,
  asof TEXT, fetched_at TEXT, expires_at TEXT,
  n_rows INTEGER, bytes INTEGER, note TEXT);

CREATE TABLE IF NOT EXISTS runs(              -- the ledger
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL, finished_at TEXT,
  prompt TEXT, families TEXT,
  digest_hash TEXT,
  store_rev INTEGER,
  outcome TEXT);

CREATE INDEX IF NOT EXISTS idx_obs_series_date ON observations(series_id, obs_date);
CREATE INDEX IF NOT EXISTS idx_obs_fetched ON observations(fetched_at);
CREATE INDEX IF NOT EXISTS idx_settle_series ON settlements(series_id, obs_date);
CREATE INDEX IF NOT EXISTS idx_markets_event ON markets(event_ticker);
CREATE INDEX IF NOT EXISTS idx_quotes_market ON quotes(market_ticker);
CREATE INDEX IF NOT EXISTS idx_predictions_target ON predictions(target_date);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
`;

// ---- verbatim copy: research_store.py SCHEMA_SQL_V2 -----------------------
export const POSITIONS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS positions(         -- an executed trade (schema v2)
  id INTEGER PRIMARY KEY,
  prediction_id INTEGER REFERENCES predictions(id),
  market_ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('yes','no')),
  contracts REAL NOT NULL CHECK (contracts > 0),
  fill_price REAL NOT NULL CHECK (fill_price > 0 AND fill_price < 1),
  fee REAL NOT NULL CHECK (fee >= 0),
  opened_at TEXT NOT NULL,                    -- ISO UTC
  settled_at TEXT,                            -- resolution timestamp
  realized_pnl REAL,
  created_at TEXT NOT NULL,
  UNIQUE(market_ticker, side, opened_at));

CREATE INDEX IF NOT EXISTS idx_positions_market ON positions(market_ticker);
CREATE INDEX IF NOT EXISTS idx_positions_pred ON positions(prediction_id);
`;

// ---- verbatim copy: research_store.py _V2_ALTERS --------------------------
// Applied after the DDL exactly like the store's init_db does (guarded by a
// pragma check so the build is idempotent).
const V2_ALTERS: [string, string, string][] = [
  ["predictions", "position_id", "ALTER TABLE predictions ADD COLUMN position_id INTEGER"],
];

const SOURCE_PRIORITY = [
  "kalshi_settlement",
  "aaa_page",
  "yahoo_close",
  "kalshi_expiration_value",
] as const;
export { SOURCE_PRIORITY };

export type FixtureVersion = 1 | 2 | 3;

export interface StoreFixture {
  /** Absolute path of the fixture store file. */
  readonly path: string;
  /** Temp directory holding the fixture (and nothing else). */
  readonly dir: string;
  /** Raw (writable) handle — fixture setup only, never for queries under test. */
  db: DatabaseSync;
  /** Remove the temp dir. Call in afterAll/afterEach. */
  cleanup(): void;
}

type Row = Record<string, string | number | null>;

/** Generic single-row seeder (fixture zone only — never under src/lib). */
function insert(db: DatabaseSync, table: string, row: Row): void {
  const cols = Object.keys(row);
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols
    .map(() => "?")
    .join(", ")})`;
  db.prepare(sql).run(...cols.map((c) => row[c]));
}

const CREATED_AT = "2026-09-23T18:56:07.543462Z";

const SERIES_ROWS: Row[] = [
  { id: 1, family: "KXAAAGASD", series_ticker: "KXAAAGASD", kind: "daily_ladder", settlement_tz: null, close_hhmm: null, strike_step: null, created_at: CREATED_AT },
  { id: 2, family: "KXDIESELD", series_ticker: "KXDIESELD", kind: "daily_ladder", settlement_tz: null, close_hhmm: null, strike_step: null, created_at: "2026-09-23T18:56:07.830557Z" },
  { id: 3, family: "HO=F", series_ticker: "HO=F", kind: "price_series", settlement_tz: null, close_hhmm: null, strike_step: null, created_at: "2026-09-23T19:02:02.274886Z" },
  { id: 4, family: "RB=F", series_ticker: "RB=F", kind: "price_series", settlement_tz: null, close_hhmm: null, strike_step: null, created_at: "2026-09-23T19:02:21.230112Z" },
  { id: 5, family: "KXTRUMPAPPROVE", series_ticker: "KXTRUMPAPPROVE", kind: "daily_ladder", settlement_tz: "America/New_York", close_hhmm: "12:59", strike_step: 0.1, created_at: "2026-09-24T03:23:25.499797Z" },
  { id: 6, family: "KXAAAGASM", series_ticker: "KXAAAGASM", kind: "unknown", settlement_tz: null, close_hhmm: null, strike_step: null, created_at: "2026-09-24T03:29:14.426121Z" },
];

const RUNS_ROWS: Row[] = [
  { id: 1, started_at: "2026-09-23T13:00:08.309471Z", finished_at: "2026-09-23T13:00:08.309471Z", prompt: null, families: "[]", digest_hash: null, store_rev: 0, outcome: "ok" },
  { id: 4, started_at: "2026-09-23T18:56:12.200211Z", finished_at: "2026-09-23T18:56:12.200211Z", prompt: null, families: "[\"KXDIESELD\",\"KXAAAGASD\"]", digest_hash: "b67c33f8a6900568", store_rev: 3410, outcome: "ok" },
  { id: 5, started_at: "2026-09-23T19:07:48.853974Z", finished_at: "2026-09-23T23:22:54.072090Z", prompt: null, families: "[]", digest_hash: "dbe4b5a933e7edc0", store_rev: 3410, outcome: "partial" },
  { id: 7, started_at: "2026-09-24T03:24:11.316773Z", finished_at: "2026-09-24T03:24:11.316773Z", prompt: null, families: "[\"KXTRUMPAPPROVE\"]", digest_hash: "c1914b877619a7b1", store_rev: 3678, outcome: "ok" },
  { id: 9, started_at: "2026-09-24T03:29:17.925984Z", finished_at: "2026-09-24T03:29:17.925984Z", prompt: null, families: "[]", digest_hash: "9658ec5d761d0e16", store_rev: 3760, outcome: "ok" },
  { id: 11, started_at: "2026-09-24T13:00:12.610842Z", finished_at: "2026-09-24T13:00:12.610842Z", prompt: null, families: "[]", digest_hash: "afa7b2b2645be788", store_rev: 3801, outcome: "ok" },
  { id: 13, started_at: "2026-09-24T16:47:33.950412Z", finished_at: "2026-09-24T16:47:33.950412Z", prompt: null, families: "[]", digest_hash: "51a750b3013377d5", store_rev: 3804, outcome: "ok" },
];

interface PredictionSeed {
  id: number;
  run_id: number;
  market_ticker: string;
  series_id: number | null;
  event_ticker: string | null;
  target_date: string;
  p_yes: number;
  market_price: number;
  edge_points: number;
  direction: string;
  point_forecast: number;
  forecast_sd: number;
  rationale: string;
  resolved_at: string | null;
  outcome: string | null;
  error: number | null;
  position_id: number | null;
}

/**
 * The 12 predictions of golden fixture A — the live store's rows with
 * rationales truncated (presence, not content, is what the goldens pin).
 * Classification goldens these reproduce: KXDIESELD 2/1/1 (66.7%),
 * KXAAAGASD 2/0/1 (100%), KXAAAGASM pending 2, KXTRUMPAPPROVE pending 3,
 * unattributed 0. Note prediction 4: market_ticker prefixes KXAAAGASM (not
 * KXAAAGASD) even though its series_id points at HO=F — the longest-prefix
 * attribution trap from data-model.md D2.
 */
const PREDICTIONS: PredictionSeed[] = [
  { id: 1, run_id: 1, market_ticker: "KXAAAGASM-26SEP30-4.50", series_id: null, event_ticker: "KXAAAGASM-26SEP30", target_date: "2026-09-30", p_yes: 0.285, market_price: 0.38, edge_points: -0.095, direction: "down", point_forecast: 4.46, forecast_sd: 0.045, rationale: "AAA national avg 4.4744; market needs >4.50 in 7 days; SIDE: NO (fixture rationale).", resolved_at: null, outcome: null, error: null, position_id: null },
  { id: 2, run_id: 4, market_ticker: "KXDIESELD-26SEP24-T6.515", series_id: 2, event_ticker: "KXDIESELD-26SEP24", target_date: "2026-09-24", p_yes: 0.74, market_price: 0.27, edge_points: 0.47, direction: "up", point_forecast: 6.548, forecast_sd: 0.0241, rationale: "RECOMMENDATION: conditional forecast 6.548, edge +47 pts vs the ask (fixture rationale).", resolved_at: "2026-09-24T15:46:56.668973Z", outcome: "down", error: 0.0355, position_id: null },
  { id: 3, run_id: 4, market_ticker: "KXAAAGASD-26SEP24-4.4800", series_id: 1, event_ticker: "KXAAAGASD-26SEP24", target_date: "2026-09-24", p_yes: 0.62, market_price: 0.53, edge_points: 0.09, direction: "up", point_forecast: 4.4863, forecast_sd: 0.0199, rationale: "PASS - NO TRADE. Recorded for calibration scoring only (fixture rationale).", resolved_at: "2026-09-24T13:00:12.530366Z", outcome: "up", error: 0.0038, position_id: null },
  { id: 4, run_id: 4, market_ticker: "KXAAAGASM-26SEP30-4.50", series_id: 3, event_ticker: null, target_date: "2026-09-30", p_yes: 0.55, market_price: 0.45, edge_points: 0.1, direction: "up", point_forecast: 4.5, forecast_sd: 0.04, rationale: "AAA national regular flat; settlement is the 9/30 AAA daily print (fixture rationale).", resolved_at: null, outcome: null, error: null, position_id: null },
  { id: 5, run_id: 5, market_ticker: "KXDIESELD-26SEP24-T6.515", series_id: 2, event_ticker: null, target_date: "2026-09-24", p_yes: 0.12, market_price: 0.19, edge_points: -0.07, direction: "up", point_forecast: 6.5069, forecast_sd: 0.0288, rationale: "EXECUTED POSITION (real fill 2026-09-23 18:06 ET): 24.90 contracts @ 19c (fixture rationale).", resolved_at: "2026-09-24T15:46:56.668973Z", outcome: "down", error: -0.0056, position_id: 1 },
  { id: 6, run_id: 7, market_ticker: "KXTRUMPAPPROVE-26SEP24-U38.7", series_id: 5, event_ticker: "KXTRUMPAPPROVE-26SEP24", target_date: "2026-09-24", p_yes: 0.56, market_price: 0.61, edge_points: -0.05, direction: "no", point_forecast: 38.6, forecast_sd: 0.2, rationale: "side=no: calibrated model mu=38.62 sigma=0.20 from RCP composition (fixture rationale).", resolved_at: null, outcome: null, error: null, position_id: null },
  { id: 7, run_id: 9, market_ticker: "KXAAAGASD-26SEP24-4.4800", series_id: 1, event_ticker: null, target_date: "2026-09-24", p_yes: 0.745, market_price: 0.75, edge_points: -0.005, direction: "flat", point_forecast: 4.4821, forecast_sd: 0.005, rationale: "PASS. Ladder implied median 4.4821 vs last AAA print 4.4725 (fixture rationale).", resolved_at: "2026-09-24T13:00:12.530366Z", outcome: "up", error: -0.0004, position_id: null },
  { id: 8, run_id: 9, market_ticker: "KXDIESELD-26SEP24-T6.515", series_id: 2, event_ticker: null, target_date: "2026-09-24", p_yes: 0.19, market_price: 0.21, edge_points: -0.02, direction: "flat", point_forecast: 6.511, forecast_sd: 0.005, rationale: "PASS. Ladder implied median 6.511 vs last print 6.5225 (fixture rationale).", resolved_at: "2026-09-24T15:46:56.668973Z", outcome: "down", error: -0.0015, position_id: null },
  { id: 9, run_id: 9, market_ticker: "KXTRUMPAPPROVE-26SEP24-E38.8", series_id: 5, event_ticker: null, target_date: "2026-09-24", p_yes: 0.4, market_price: 0.14, edge_points: 0.26, direction: "flat", point_forecast: 38.79, forecast_sd: 0.12, rationale: "PASS (documented, not recommended): RCP true value 38.786 -> display 38.8 (fixture rationale).", resolved_at: null, outcome: null, error: null, position_id: null },
  { id: 10, run_id: 11, market_ticker: "KXDIESELD-26SEP25-T6.520", series_id: 2, event_ticker: null, target_date: "2026-09-25", p_yes: 0.55, market_price: 0.99, edge_points: -0.44, direction: "flat", point_forecast: 6.5225, forecast_sd: 0.008, rationale: "Market has NO quoted ladder - not liquid enough to trade, PASS on execution (fixture rationale).", resolved_at: null, outcome: null, error: null, position_id: null },
  { id: 11, run_id: 11, market_ticker: "KXAAAGASD-26SEP25-4.4900", series_id: 1, event_ticker: null, target_date: "2026-09-25", p_yes: 0.48, market_price: 0.47, edge_points: 0.01, direction: "flat", point_forecast: 4.4894, forecast_sd: 0.01, rationale: "Ladder-implied median ~4.4894; NO TRADE recommended (fixture rationale).", resolved_at: null, outcome: null, error: null, position_id: null },
  { id: 12, run_id: 11, market_ticker: "KXTRUMPAPPROVE-26SEP24-E38.8", series_id: 5, event_ticker: null, target_date: "2026-09-24", p_yes: 0.36, market_price: 0.33, edge_points: 0.03, direction: "flat", point_forecast: 38.81, forecast_sd: 0.06, rationale: "RCP page displays 38.8; E38.8 YES at ask 33 with p 0.36 (fixture rationale).", resolved_at: null, outcome: null, error: null, position_id: null },
];

const POSITIONS_ROWS: Row[] = [
  // The one realized position (golden: realized_pnl −5.001, total −$5.001).
  { id: 1, prediction_id: 5, market_ticker: "KXDIESELD-26SEP24-T6.515", side: "yes", contracts: 24.9, fill_price: 0.19, fee: 0.27, opened_at: "2026-09-23T22:06:35Z", settled_at: "2026-09-24T15:47:22.339474Z", realized_pnl: -5.001, created_at: "2026-09-23T23:22:54.072381Z" },
];

const MARKETS_ROWS: Row[] = [
  // All close_ts in the past, so the open-ladder freshness rule never fires
  // (keeps staleCount deterministic regardless of when tests run).
  { market_ticker: "KXDIESELD-26SEP24-T6.515", event_ticker: "KXDIESELD-26SEP24", floor_strike: 6.515, strike_type: "greater", result: "no", close_ts: 1790229540, close_time: "2026-09-24T13:05:40Z", rules_hash: "0f1e2d3c4b5a6978", asof: "2026-09-23T19:00:00Z", fetched_at: "2026-09-23T19:03:46.982919Z" },
  { market_ticker: "KXDIESELD-26SEP23-T6.515", event_ticker: "KXDIESELD-26SEP23", floor_strike: 6.515, strike_type: "greater", result: "yes", close_ts: 1790143140, close_time: "2026-09-23T13:05:40Z", rules_hash: "0f1e2d3c4b5a6978", asof: "2026-09-22T19:00:00Z", fetched_at: "2026-09-23T19:03:46.982919Z" },
  { market_ticker: "KXAAAGASD-26SEP24-4.4800", event_ticker: "KXAAAGASD-26SEP24", floor_strike: 4.48, strike_type: "greater", result: "up", close_ts: 1790222340, close_time: "2026-09-24T11:05:40Z", rules_hash: "1a2b3c4d5e6f7081", asof: "2026-09-23T19:00:00Z", fetched_at: "2026-09-23T19:03:46.982919Z" },
];

const QUOTES_ROWS: Row[] = [
  { market_ticker: "KXDIESELD-26SEP24-T6.515", end_period_ts: 1790190000, hours_before_close: 10.9833, close_dollars: 0.27, yes_bid_dollars: 0.23, yes_ask_dollars: 0.27, volume_fp: 3.52, open_interest_fp: 862.55, asof: "2026-09-23T19:00:00Z", fetched_at: "2026-09-23T19:03:46.982919Z" },
  { market_ticker: "KXDIESELD-26SEP24-T6.515", end_period_ts: 1790222340, hours_before_close: 0.9833, close_dollars: 0.76, yes_bid_dollars: 0.72, yes_ask_dollars: 0.76, volume_fp: 486.41, open_interest_fp: 537.27, asof: "2026-09-23T23:00:00Z", fetched_at: "2026-09-23T19:07:40.709367Z" },
  { market_ticker: "KXAAAGASD-26SEP24-4.4800", end_period_ts: 1790190000, hours_before_close: 0.9833, close_dollars: 0.54, yes_bid_dollars: 0.53, yes_ask_dollars: 0.55, volume_fp: 12, open_interest_fp: 400, asof: "2026-09-23T19:00:00Z", fetched_at: "2026-09-23T19:03:46.982919Z" },
];

const SETTLEMENTS_ROWS: Row[] = [
  // Three finalized + one still-pending: the pending one is a deterministic
  // settlement-revalidation stale artifact (clock-independent rule).
  { event_ticker: "KXDIESELD-26SEP23", series_id: 2, obs_date: "2026-09-23", close_ts: 1790143140, band_lo: 6.52, band_hi: 6.525, mid: 6.5225, n_strikes: 21, n_quoted: 21, status: "finalized", asof: "2026-09-23T13:15:38.908681Z", fetched_at: "2026-09-23T18:56:07.830272Z" },
  { event_ticker: "KXDIESELD-26SEP24", series_id: 2, obs_date: "2026-09-24", close_ts: 1790229540, band_lo: 6.51, band_hi: 6.515, mid: 6.5125, n_strikes: 21, n_quoted: 21, status: "finalized", asof: "2026-09-24T13:05:28.101022Z", fetched_at: "2026-09-24T13:05:28.101022Z" },
  { event_ticker: "KXAAAGASD-26SEP23", series_id: 1, obs_date: "2026-09-23", close_ts: 1790135940, band_lo: 4.47, band_hi: 4.475, mid: 4.4725, n_strikes: 17, n_quoted: 17, status: "finalized", asof: "2026-09-23T11:06:18.218275Z", fetched_at: "2026-09-23T18:56:07.543220Z" },
  { event_ticker: "KXDIESELD-26SEP25", series_id: 2, obs_date: "2026-09-25", close_ts: 1790315940, band_lo: null, band_hi: null, mid: null, n_strikes: 21, n_quoted: 0, status: "pending", asof: "2026-09-24T17:00:30Z", fetched_at: "2026-09-24T17:00:30Z" },
];

const CACHE_META_ROWS: Row[] = [
  { key: "store_rev", asof: "2026-09-24T15:46:56.597794Z", fetched_at: "2026-09-24T15:46:56.597794Z", expires_at: null, n_rows: 3804, bytes: null, note: "reserved: global monotonic store revision" },
  { key: "digest:last", asof: "2026-09-24T17:00:30.485717Z", fetched_at: "2026-09-24T17:00:30.485717Z", expires_at: null, n_rows: 40, bytes: null, note: "f70d2e636d916d85" },
];

// ---- observation seeds -----------------------------------------------------

const DIESEL_FETCHED_AT = "2026-09-23T18:56:07.830272Z";
const GASD_FETCHED_AT = "2026-09-23T18:56:07.543220Z";

function isoDate(baseMs: number, dayOffset: number): string {
  return new Date(baseMs + dayOffset * 86400000).toISOString().slice(0, 10);
}

const DIESEL_BASE_MS = Date.UTC(2026, 7, 3); // 2026-08-03

/**
 * KXDIESELD: 53 distinct dates (2026-08-03 .. 2026-09-24), each with a
 * kalshi_settlement band AND a raw kalshi_expiration_value point — the
 * contract's dedupe fixture. The two pinned dates carry the exact golden
 * values; the other 51 carry deterministic synthetic values.
 */
export const DIESELD_PINNED_DATES: Record<string, { lo: number; hi: number; point: number }> = {
  "2026-09-23": { lo: 6.52, hi: 6.525, point: 6.5217 },
  "2026-09-24": { lo: 6.51, hi: 6.515, point: 6.5141 },
};

function dieseldObservations(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 53; i++) {
    const date = isoDate(DIESEL_BASE_MS, i);
    const pinned = DIESELD_PINNED_DATES[date];
    const lo = pinned ? pinned.lo : +(5.0 + 0.03 * i).toFixed(3);
    const hi = pinned ? pinned.hi : +(lo + 0.005).toFixed(3);
    const point = pinned ? pinned.point : +(lo + 0.0025).toFixed(4);
    const asof = `${date}T13:15:38Z`;
    rows.push(
      { series_id: 2, obs_date: date, value: null, value_lo: lo, value_hi: hi, unit: null, source: "kalshi_settlement", quality: "final", asof, fetched_at: DIESEL_FETCHED_AT },
      { series_id: 2, obs_date: date, value: point, value_lo: null, value_hi: null, unit: null, source: "kalshi_expiration_value", quality: "final", asof, fetched_at: DIESEL_FETCHED_AT },
    );
  }
  return rows;
}

/** HO=F / RB=F price series (yahoo_close points) — today_close stale artifacts. */
function priceSeriesObservations(seriesId: number, start: number, step: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 7; i++) {
    const date = isoDate(Date.UTC(2026, 8, 15), i); // 2026-09-15 .. 2026-09-21
    rows.push({
      series_id: seriesId,
      obs_date: date,
      value: +(start + 0.01 * i).toFixed(4),
      value_lo: null,
      value_hi: null,
      unit: "USD/gal",
      source: "yahoo_close",
      quality: "final",
      asof: `${date}T04:00:00Z`,
      fetched_at: "2026-09-23T19:06:21.338992Z",
    });
  }
  return rows;
}

/**
 * KXAAAGASD: five plain band+point dates, then four synthetic device dates
 * (2026-09-25..28) that pin the source-priority rules the KXDIESELD goldens
 * do not cover: a point row can win (09-25, sole source), aaa_page beats
 * yahoo_close (09-26), kalshi_settlement beats aaa_page (09-27), and
 * yahoo_close beats kalshi_expiration_value (09-28).
 */
const GASD_BAND_DATES = [
  { date: "2026-09-20", lo: 4.47, point: 4.4725 },
  { date: "2026-09-21", lo: 4.473, point: 4.4755 },
  { date: "2026-09-22", lo: 4.47, point: 4.4725 },
  { date: "2026-09-23", lo: 4.47, point: 4.4725 },
  { date: "2026-09-24", lo: 4.48, point: 4.4825 },
];

const GASD_DEVICE_DATES: Row[] = [
  { series_id: 1, obs_date: "2026-09-25", value: 4.4999, value_lo: null, value_hi: null, unit: "USD/gal", source: "kalshi_expiration_value", quality: "final", asof: "2026-09-25T13:00:00Z", fetched_at: "2026-09-25T13:05:00Z" },
  { series_id: 1, obs_date: "2026-09-26", value: null, value_lo: 4.49, value_hi: 4.495, unit: "USD/gal", source: "aaa_page", quality: "final", asof: "2026-09-26T13:00:00Z", fetched_at: "2026-09-26T13:05:00Z" },
  { series_id: 1, obs_date: "2026-09-26", value: 4.47, value_lo: null, value_hi: null, unit: "USD/gal", source: "yahoo_close", quality: "final", asof: "2026-09-26T13:00:00Z", fetched_at: "2026-09-26T13:05:00Z" },
  { series_id: 1, obs_date: "2026-09-27", value: null, value_lo: 4.48, value_hi: 4.485, unit: "USD/gal", source: "kalshi_settlement", quality: "final", asof: "2026-09-27T13:00:00Z", fetched_at: "2026-09-27T13:05:00Z" },
  { series_id: 1, obs_date: "2026-09-27", value: 4.4825, value_lo: null, value_hi: null, unit: "USD/gal", source: "aaa_page", quality: "final", asof: "2026-09-27T13:00:00Z", fetched_at: "2026-09-27T13:05:00Z" },
  { series_id: 1, obs_date: "2026-09-28", value: 4.44, value_lo: null, value_hi: null, unit: "USD/gal", source: "yahoo_close", quality: "final", asof: "2026-09-28T13:00:00Z", fetched_at: "2026-09-28T13:05:00Z" },
  { series_id: 1, obs_date: "2026-09-28", value: 4.51, value_lo: null, value_hi: null, unit: "USD/gal", source: "kalshi_expiration_value", quality: "final", asof: "2026-09-28T13:00:00Z", fetched_at: "2026-09-28T13:05:00Z" },
];

function allObservations(): Row[] {
  const rows: Row[] = [];
  for (const d of GASD_BAND_DATES) {
    rows.push(
      { series_id: 1, obs_date: d.date, value: null, value_lo: d.lo, value_hi: +(d.lo + 0.005).toFixed(3), unit: "USD/gal", source: "kalshi_settlement", quality: "final", asof: `${d.date}T12:30:00Z`, fetched_at: GASD_FETCHED_AT },
      { series_id: 1, obs_date: d.date, value: d.point, value_lo: null, value_hi: null, unit: "USD/gal", source: "kalshi_expiration_value", quality: "final", asof: `${d.date}T12:30:00Z`, fetched_at: GASD_FETCHED_AT },
    );
  }
  rows.push(...GASD_DEVICE_DATES);
  rows.push(...dieseldObservations());
  rows.push(...priceSeriesObservations(3, 4.65, 0.05)); // HO=F
  rows.push(...priceSeriesObservations(4, 3.45, -0.02)); // RB=F
  rows.push(
    { series_id: 6, obs_date: "2026-08-31", value: null, value_lo: 4.08, value_hi: 4.09, unit: "USD/gal", source: "kalshi_settlement", quality: "final", asof: "2026-08-31T13:00:31Z", fetched_at: "2026-09-24T03:29:14.425786Z" },
    { series_id: 5, obs_date: "2026-09-19", value: null, value_lo: 39.6, value_hi: 39.7, unit: null, source: "kalshi_settlement", quality: "final", asof: "2026-09-19T17:30:54Z", fetched_at: "2026-09-24T03:23:25.499163Z" },
    { series_id: 5, obs_date: "2026-09-20", value: null, value_lo: 39.9, value_hi: null, unit: null, source: "kalshi_settlement", quality: "final", asof: "2026-09-20T17:30:54Z", fetched_at: "2026-09-24T03:23:25.499163Z" },
    { series_id: 5, obs_date: "2026-09-21", value: null, value_lo: 40.2, value_hi: 40.3, unit: null, source: "kalshi_settlement", quality: "final", asof: "2026-09-21T17:30:54Z", fetched_at: "2026-09-24T03:23:25.499163Z" },
  );
  return rows;
}

export { SOURCE_PRIORITY as OBSERVATION_SOURCE_PRIORITY };

export interface FixtureOptions {
  /**
   * Which schema_version rows to stamp: 1 (legacy store), 2 (supported, the
   * default — both v1 and v2 rows like the live store's audit trail), or 3
   * (future store). Used by the negative-control tests (v1/v3 must be
   * rejected by the schema gate).
   */
  readonly version?: FixtureVersion;
  /**
   * Seed the golden rows? Default true. `false` builds a schema-only store
   * (no series/observations/predictions/... rows) for zero-state tests —
   * SC-005's "empty store renders zero states, no errors".
   */
  readonly seed?: boolean;
  /**
   * Extra positions to seed beyond the golden realized one (variant tests:
   * open-position marks, window filtering). Seeded verbatim — respect the
   * UNIQUE(market_ticker, side, opened_at) constraint.
   */
  readonly extraPositions?: PositionSeed[];
  /**
   * Extra quotes keyed by market_ticker (variant tests: mark selection
   * rules). One quote row per entry.
   */
  readonly extraQuotes?: {
    market_ticker: string;
    hours_before_close: number;
    close_dollars: number | null;
    yes_bid_dollars: number | null;
    yes_ask_dollars: number | null;
  }[];
  /**
   * Extra predictions (variant tests: banner tie-break, unattributed).
   * `id`/`run_id`/`market_ticker` required; the rest defaults to a pending
   * up-call with no point forecast.
   */
  readonly extraPredictions?: (Partial<PredictionSeed> & Pick<PredictionSeed, "id" | "run_id" | "market_ticker">)[];
  /** Extra cache_meta rows (variant tests: expired artifacts). */
  readonly extraCacheMeta?: {
    key: string;
    asof: string;
    fetched_at: string;
    expires_at: string | null;
    n_rows: number | null;
    note: string;
  }[];
}

/**
 * Build a fresh synthetic v2 store in a temp dir and seed the golden rows.
 * Throws (and cleans up) if any CHECK/UNIQUE constraint is violated, so a
 * malformed seed fails loudly at build time.
 */
export function buildStoreFixture(options: FixtureOptions = {}): StoreFixture {
  const dir = mkdtempSync(path.join(tmpdir(), "store-fixture-"));
  const dbPath = path.join(dir, "kalshi-fixture.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(BASE_SCHEMA_SQL);
    db.exec(POSITIONS_SCHEMA_SQL);
    for (const [table, column, stmt] of V2_ALTERS) {
      const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map(
        (r) => r.name
      );
      if (!cols.includes(column)) {
        db.exec(stmt);
      }
    }
    const version = options.version ?? FIXTURE_SCHEMA_VERSION;
    const v1AppliedAt = "2026-09-23T00:51:22.482125Z";
    const v2AppliedAt = "2026-09-23T23:22:46.986533Z";
    const v3AppliedAt = "2026-09-25T00:00:00.000000Z";
    if (version >= 1) insert(db, "schema_version", { version: 1, applied_at: v1AppliedAt });
    if (version >= 2) insert(db, "schema_version", { version: 2, applied_at: v2AppliedAt });
    if (version >= 3) insert(db, "schema_version", { version: 3, applied_at: v3AppliedAt });

    const seed = options.seed ?? true;
    for (const row of seed ? SERIES_ROWS : []) insert(db, "series", row);
    for (const row of seed ? RUNS_ROWS : []) insert(db, "runs", row);
    for (const row of seed ? PREDICTIONS : []) insert(db, "predictions", row as unknown as Row);
    for (const row of seed ? POSITIONS_ROWS : []) insert(db, "positions", row);
    for (const p of seed ? (options.extraPositions ?? []) : []) {
      insert(db, "positions", { ...p, created_at: p.opened_at });
    }
    for (const row of seed ? MARKETS_ROWS : []) insert(db, "markets", row);
    for (const row of seed ? QUOTES_ROWS : []) insert(db, "quotes", row);
    for (const q of seed ? (options.extraQuotes ?? []) : []) {
      insert(db, "quotes", {
        market_ticker: q.market_ticker,
        end_period_ts: 1790190000,
        hours_before_close: q.hours_before_close,
        close_dollars: q.close_dollars,
        yes_bid_dollars: q.yes_bid_dollars,
        yes_ask_dollars: q.yes_ask_dollars,
        volume_fp: 0,
        open_interest_fp: 0,
        asof: "2026-09-24T12:00:00Z",
        fetched_at: "2026-09-24T12:00:00Z",
      });
    }
    for (const p of seed ? (options.extraPredictions ?? []) : []) {
      const row: PredictionSeed = {
        series_id: null,
        event_ticker: null,
        target_date: "2026-09-30",
        p_yes: 0.5,
        market_price: 0.5,
        edge_points: 0,
        direction: "up",
        point_forecast: null,
        forecast_sd: null,
        rationale: "variant fixture prediction",
        resolved_at: null,
        outcome: null,
        error: null,
        position_id: null,
        ...p,
      } as PredictionSeed;
      insert(db, "predictions", row as unknown as Row);
    }
    for (const row of seed ? SETTLEMENTS_ROWS : []) insert(db, "settlements", row);
    for (const row of seed ? CACHE_META_ROWS : []) insert(db, "cache_meta", row);
    for (const row of seed ? (options.extraCacheMeta ?? []) : []) {
      insert(db, "cache_meta", { ...row, bytes: null });
    }
    for (const row of seed ? allObservations() : []) insert(db, "observations", row);
    db.close();
  } catch (err) {
    db.close();
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return {
    path: dbPath,
    dir,
    db: new DatabaseSync(dbPath, { readOnly: true }),
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Attempt a write THROUGH an already-opened (read-only) store handle — the
 * card's evidence floor: "attempt an INSERT through the opened store and show
 * the failure". The write string lives here in the fixture zone so the
 * src/ invariant scan stays green; the test asserts this helper throws.
 * Returns "wrote" only if the write unexpectedly succeeded.
 */
export function attemptWriteViaHandle(storeDb: DatabaseSync): "wrote" {
  storeDb
    .prepare("INSERT INTO cache_meta(key, note) VALUES ('rw-probe', 'must not succeed')")
    .run();
  return "wrote";
}

/** Extra seeders for variant fixtures (each test builds its own store). */

export interface PositionSeed {
  id: number;
  prediction_id: number | null;
  market_ticker: string;
  side: "yes" | "no";
  contracts: number;
  fill_price: number;
  fee: number;
  opened_at: string;
  settled_at: string | null;
  realized_pnl: number | null;
}

/** Drop and reopen the fixture's raw handle (after external re-seeding). */
export function reopenFixtureHandle(fixture: StoreFixture, readOnly = true): DatabaseSync {
  fixture.db.close();
  fixture.db = new DatabaseSync(fixture.path, { readOnly });
  return fixture.db;
}

/**
 * Temporarily reopen the fixture's handle WRITABLE and run `fn` — fixture
 * zone only (e.g. seeding a variant or emptying a table for a zero-state
 * test). Never used by anything under src/lib: the data layer keeps its
 * read-only guarantee end to end.
 */
export function withWritable<T>(fixture: StoreFixture, fn: (db: DatabaseSync) => T): T {
  fixture.db.close();
  const writable = new DatabaseSync(fixture.path);
  try {
    return fn(writable);
  } finally {
    writable.close();
    fixture.db = new DatabaseSync(fixture.path, { readOnly: true });
  }
}