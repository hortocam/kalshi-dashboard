# Data Model: Kalshi Research Dashboard MVP

**Feature**: specs/001-dashboard-mvp | **Date**: 2026-09-24
**Authority**: the store schema below is copied from `research_store.py` (schema v2) in the
kalshi-skill repo — the dashboard owns **none** of it. It is reproduced here because the
dashboard's queries depend on exact column names and natural keys. The "derived views" section
is the only schema the dashboard defines (in TypeScript, not persisted).

## Source of record: the research continuity store (SQLite, schema v2)

Read **read-only, always** (`node:sqlite` open mode `readOnly: true`). Never written by the
dashboard. Located via `KALSHI_RESEARCH_DB` env (same override the store CLI honours).

### Tables (11)

| Table | Holds | Natural key | Dashboard reads |
|---|---|---|---|
| `schema_version` | applied schema versions | `version` | max(version) → gate (FR-013) |
| `series` | one row per tracked family; opaque knobs | `series_ticker` | family list (FR-015), family metadata |
| `observations` | the historical print series (points and bands) | `(series_id, obs_date, source)` | charts (FR-007), recent prints (FR-002) |
| `settlements` | settled events with reconstructed band | `event_ticker` | (not in MVP views; available) |
| `markets` | settled + open strikes, rules hash | `market_ticker` | open-market context for rec graphs |
| `quotes` | market-implied prices at fixed offsets before close | `(market_ticker, hours_before_close)` | open-position marks (FR-008), rec graph context |
| `models` | DERIVED model params, persisted for drift | `(series_id, model_name, fit_date)` | (not in MVP views; available) |
| `predictions` | the bot's expectation + later resolution | `id` | scoreboard (FR-009), banner (FR-004), rec list (FR-006) |
| `cache_meta` | freshness contract; reserved keys `store_rev`, `digest:last` | `key` | as-of/stale display (FR-016/017) |
| `runs` | the run ledger (session boundaries) | `id` | banner batching (D5), run context |
| `positions` | executed trades + realized P&L (v2) | `(market_ticker, side, opened_at)` | P&L views (FR-001/008) |

### Columns that matter (verbatim)

```sql
series(         id, family, series_ticker UNIQUE, kind, settlement_tz, close_hhmm,
                strike_step, created_at)
observations(   id, series_id→series, obs_date, value, value_lo, value_hi, unit,
                source, quality DEFAULT 'final', asof, fetched_at)
                -- UNIQUE(series_id, obs_date, source)
predictions(    id, run_id→runs, market_ticker, series_id, event_ticker, target_date,
                p_yes NOT NULL, market_price, edge_points, direction, point_forecast,
                forecast_sd, rationale, resolved_at, outcome, error, position_id)
positions(      id, prediction_id→predictions, market_ticker, side ('yes'|'no'),
                contracts >0, fill_price ∈ (0,1), fee ≥0, opened_at, settled_at,
                realized_pnl, created_at)  -- UNIQUE(market_ticker, side, opened_at)
runs(           id, started_at, finished_at, prompt, families, digest_hash,
                store_rev, outcome)
quotes(         market_ticker, end_period_ts, hours_before_close, close_dollars,
                yes_bid_dollars, yes_ask_dollars, volume_fp, open_interest_fp,
                asof, fetched_at)
cache_meta(     key, asof, fetched_at, expires_at, n_rows, bytes, note)
```

### Value vocabularies (do not mix)

- `predictions.outcome` — **market outcomes**: `yes` | `no` (settled market result), or a
  **print direction** `up` | `down` | `flat` (series-unit resolution), or NULL (pending).
- `predictions.direction` — the bot's call: `up` | `down` | `flat` | `yes` | `no`.
- `positions.side` — only `yes` | `no`; `fill_price` is always the price paid **for the side
  bought** (YES price for `side='yes'`, NO price for `side='no'`).
- `observations.source` — priority order for series-of-record:
  `kalshi_settlement` > `aaa_page` > `yahoo_close` > `kalshi_expiration_value`.
- P&L math is **owned by the store** (already computed in `realized_pnl`; fee =
  round-up-to-cent of `0.07·C·P·(1−P)`). The dashboard sums stored values; it never
  re-derives settlement math.

## Derived view entities (dashboard-side, not persisted)

### ScoreboardEntry — the pinned hit-rate classification (D2, normative)

Per prediction, in order (first match wins):

```
1. resolved_at IS NULL OR outcome IS NULL      → pending
2. point_forecast NOT NULL AND forecast_sd > 0 → success iff |error| <= forecast_sd
3. outcome IN ('yes','no')                     → success iff outcome == direction
4. otherwise                                   → unscored (shown, never dropped)
```

Family attribution (first match wins): longest `series.family` that is a prefix of
`market_ticker` → `series_id`'s family → `unattributed`. Position linkage never affects
scoring. Hit rate = success / (success + fail); displayed only when at least one scored
prediction exists. **Golden fixture numbers** (live store 2026-09-24): KXDIESELD 2/1/1
(66.7%), KXAAAGASD 2/0/1 (100%), KXAAAGASM pending 2, KXTRUMPAPPROVE pending 3,
HO=F/RB=F none, unattributed 0.

### PnlView (homepage + per-market, D4)

```
realized:   positions WHERE settled_at IS NOT NULL AND settled_at >= window_start
            (window 'all' = no filter); total = SUM(realized_pnl)
open:       positions WHERE settled_at IS NULL — window-independent
            mark = contracts × (mark_price − fill_price)
            mark_price = latest stored quote (bid → ask → last) for side='yes';
                         1 − quote for side='no'
            mark unavailable (never zero) when no stored quote exists
```

Golden fixture: exactly one realized position, `realized_pnl = −5.001`; total −$5.001.

### SeriesView (charts, D6)

Per `obs_date`, one row selected by source priority: `{obs_date, value | lo/hi, mid, source,
quality, unit}`. Band rows render as a band + midpoint line; point rows as values.

### BannerEntry (homepage banner, D5)

Per family: the latest prediction by `runs.started_at DESC, predictions.id DESC` with
`{direction | p_yes | point_forecast, target_date, rationale, traded: bool (position_id
NOT NULL), run: {started_at, digest_hash prefix}}`.

### StoreStatus (health + as-of display, FR-013/016/017)

`{reachable, schemaVersion (int|null), storeRev (int|null), staleCount (int|null), lastRunAt}`
— from `schema_version`, `cache_meta.store_rev`, `cache_meta`/stale rules, `runs` max start.

### SkillChange (homepage card, D3)

`{date, hash (short), subject}` from `git log` of the configured skill repo (env path),
capped (10 commits / 30 days); explicit unavailable state when not configured.

## Relationships

```
series 1─* observations        series 1─* settlements
series 1─* models              runs 1─* predictions
predictions 0..1─0..1 positions (predictions.position_id; nullable both ways)
markets *─1 event_ticker; quotes by market_ticker
```

## State transitions (the only ones the dashboard displays, never creates)

- prediction: recorded (pending) → resolved (`resolved_at` + `outcome` + `error` written by
  the store's `resolve-predictions`) — dashboard renders the result.
- position: opened (`settled_at NULL`) → settled (`settled_at` + `realized_pnl` written by the
  store; idempotent, never rewritten) — dashboard renders the result.
- The dashboard performs **no** transitions on anything: it is a lens, not an actor.