# Phase 0 Research: Kalshi Research Dashboard MVP

**Feature**: specs/001-dashboard-mvp | **Date**: 2026-09-24
**Evidence base**: every decision below was probed against the live host and store on
2026-09-24 (commands and outputs recorded inline). Nothing here is assumed from memory.

## D1. Data access: direct read-only SQLite vs exec'ing the store CLI

**Decision**: The dashboard reads the store directly with Node's built-in `node:sqlite`
(`DatabaseSync`, opened with `readOnly: true`) behind one isolated module (`src/lib/store/`).

**Evidence** (run on the deployment host, 2026-09-24):

```
$ node <probe>   # new DatabaseSync(store, {readOnly: true})
node:sqlite READ-ONLY OK, tables: cache_meta,markets,models,observations,positions,
predictions,quotes,runs,schema_version,series,settlements
schema_version: 2
```

**Rationale**:
- The store CLI (`research_store.py`) exposes only `digest`, `pnl`, `series`, `stale` — none of
  the dashboard's core queries exist as subcommands: per-family hit-rate with the store's own
  scoring semantics, windowed P&L, the per-family banner batch, or the observations window for
  charts. Exec-ing it would mean re-implementing those queries in Python or scraping digest
  text — worse than reading the same SQLite file directly.
- Direct read with `readOnly: true` makes FR-011 (never write) true **by construction**: the
  open mode makes any write from the dashboard impossible; SC-006 (store checksum unchanged)
  verifies it end to end.
- Same-host deployment (operator constraint): the store is a local filesystem path, no network
  hop, so a second service or HTTP layer would be pure overhead.
- `node:sqlite` is built into Node 22 — no native compile step (vs better-sqlite3), no extra
  dependency, and WAL side files were handled correctly in the probe.

**Alternatives considered**:
- *Exec `research_store.py <cmd> --json` per request*: rejected — missing queries (above), a
  Python process spawn per page section, and JSON shapes tied to CLI presentation.
- *better-sqlite3*: rejected — native module build for something the runtime already ships.
- *Separate query API service*: rejected — single user, single host; the Next.js server is the
  only server the MVP needs.

**Caveat carried forward**: `node:sqlite` is flagged Experimental by Node 22. Mitigation: all
SQLite access is confined to one module (`open.ts` + `queries.ts`), so a future runtime swap
(e.g. to better-sqlite3) touches one file; the schema-version gate (FR-013) protects against
silent misreads if the store's schema drifts.

## D2. Hit-rate scoreboard semantics (pinned — the hard requirement)

**Decision**: The dashboard's success/fail classification copies the store's own scoring rules
verbatim (`research_store.py` digest §1 and `resolve-predictions`), so the two can never
disagree. Pinned rules:

1. A prediction with `resolved_at IS NULL` or `outcome IS NULL` is **pending** — never counted
   as success or fail.
2. If `point_forecast IS NOT NULL` and `forecast_sd > 0`: **success iff `|error| <=
   forecast_sd`**, where `error = point_forecast - actual` in the series' own units (the
   store's ±1 sd rule).
3. Else if `outcome IN ('yes','no')` (a settled market outcome): **success iff `outcome ==
   direction`** (probability units; `direction` is the side the bot called).
4. Anything else (a resolved prediction that is neither sd-scored nor a yes/no outcome, e.g. an
   `up`/`down`/`flat` print direction resolved without a point forecast) is **unscored** and
   shown as such — never silently dropped, never counted either way.
5. Position linkage is **irrelevant** to scoring: a prediction with `position_id NULL` scores
   exactly like one with a position. This is the product owner's hard requirement.
6. Family attribution: a prediction belongs to the family of the **longest `series.family`
   that is a prefix of `market_ticker`**; fallback to the linked `series_id`'s family; else
   unattributed (counted on an "unattributed" line, never dropped).

**Golden numbers** (computed from the live store with these rules, 2026-09-24 — these become
contract fixtures; the fixture store reproduces them with synthetic rows):

```
KXDIESELD       success 2  fail 1  pending 1  hit-rate 66.7%
KXAAAGASD       success 2  fail 0  pending 1  hit-rate 100.0%
KXAAAGASM       pending 2
KXTRUMPAPPROVE  pending 3
HO=F, RB=F      no predictions yet
unattributed    0
```

The KXDIESELD 2/1 split matches the store digest's own ✔✘ marks exactly (-0.30 sd ✔, -0.19 sd
✔, +1.47 sd ✗) — the dashboard's classification was verified against the store's printed
verdicts, not just re-derived.

**Rationale**: FR-009 forbids the dashboard inventing its own vocabulary. The store resolves
`up/down/flat` (print directions) vs `yes/no` (market outcomes) differently by design; rules
1–4 reproduce that split; rule 6 handles the real data trap that `KXAAAGASD` and `KXAAAGASM`
are both prefixes of each other's predictions' tickers (longest-prefix wins).

## D3. Skill-changes card source

**Decision**: `skilllog.ts` shells out server-side to `git -C $KALSHI_SKILL_REPO_DIR log
--since="<window>" --pretty=...` (path from env `KALSHI_SKILL_REPO_DIR`, no default, no
hard-coded host path — FR-012/FR-019 style). If the env is unset or the path is not a git
repo, the card renders an explicit "skill changes unavailable" state.

**Rationale**: The card body names "git log of the skill repo" as acceptable input. Reading
git at runtime keeps the dashboard dependency-free of the skill's internals; the local
checkout (`/home/hermes/projects/kalshi-plugin`, remote `hortocam/kalshi-skill`) is the
configured repo at deploy time. A 10-commit / 30-day cap keeps the card bounded.

**Alternatives**: GitHub API (rejected: network dependency + token management for a local
card — violates FR-014's spirit); vendoring a CHANGELOG (rejected: drifts from the repo).

## D4. Windowing semantics

**Decision**:
- P&L windows filter **realized** positions by `settled_at >= now - window`; open positions
  appear regardless of window (they are open *now*), marked unrealized from stored quotes
  (store's `pnl --open` convention), and a position with no stored quote shows its mark as
  unavailable — never zero (store convention, FR-008).
- "All-time" = no time filter (the default when the store is young).
- Chart windows (`7d/30d/90d/all`) filter observations by `obs_date`.
- Default window everywhere: **30d** (product owner's spec).

**Rationale**: Matching the store's own `pnl` semantics (realized rows carry `settled_at`;
`--open` marks are a separate view) keeps homepage totals reconcilable with `research_store.py
pnl` output — SC-004's −$5.001 check depends on that.

## D5. "Latest daily recommendation" banner rule

**Decision**: Per family, the banner shows the most recent prediction **by the run it was
recorded in** (`runs.started_at DESC`, then `predictions.id DESC`), displaying direction /
p_yes / point_forecast, target date, rationale, and a trade/pass indicator: **"traded" iff a
position links to that prediction (`position_id`), otherwise "recorded — no position"**. The
banner also names the run it came from (`runs.started_at`, `digest_hash` prefix).

**Rationale**: The store's predictions table *is* the record of what the skill recommended
each day (12 rows today, each carrying `rationale`; the research JSON files mirror them but
are not the system of record). The store deliberately stores the expectation and the trade
separately, so "traded vs pass" must be derived from linkage, not guessed from `p_yes`.

## D6. Observation series rendering (bands and points)

**Decision**: One value per date using the store's series-of-record priority
(`kalshi_settlement` > `aaa_page` > `yahoo_close` > `kalshi_expiration_value`); plot band rows
(`value_lo`/`value_hi`, `value NULL`) as a band area with the band midpoint as the line, and
point rows (`value NOT NULL`) as plain values. Never plot two rows for one date.

**Rationale**: 2026-09-24 data shows both shapes in one family (KXDIESELD has a
`kalshi_expiration_value` point for 09-23 and `kalshi_settlement` bands for 09-24). The
store's own digest prints the band midpoint (`mid=(lo+hi)/2`) — this reuses the store's
convention rather than inventing one ("reuse chart approaches from prior research").

## D7. Testing strategy

**Decision**: Vitest. The data layer is tested against **synthetic fixture stores**: a
documented `buildStoreFixture()` helper creates a temp SQLite with the store's v2 DDL (copied
verbatim from `research_store.py`) and seeds rows per test. Golden tests pin the D2 scoreboard
numbers, the −$5.001 P&L equivalence, band/point chart data, empty-store and missing-store
states, and a **checksum test** (read every page function, close, compare store file checksum)
proving FR-011/SC-006 at the unit level. UI tests cover the sidebar layout, per-family routing,
and zero states with fixture-driven server components.

**Rationale**: TDD is a constitution principle (II); the live store is private bot state and
must never be a test dependency (constitution VII, and tests must run anywhere). The golden
numbers come from the live store but are pinned as fixture expectations, so the suite is
deterministic and network-free.

## D8. Serving & configuration shape

**Decision**: `next build` with `output: 'standalone'`; run with `HOSTNAME=127.0.0.1
PORT=3000` defaults from `src/lib/config.ts` (env-overridable). `KALSHI_RESEARCH_DB` env picks
the store path (same env var name the store CLI itself honours — one convention to learn).
Health route `/api/health` returns `{ ok, store: { reachable, schemaVersion } }`, 200 when the
store opens and the schema version is supported, 503 otherwise — the contract a future
Traefik/Authentik front needs, with zero gateway specifics in code.

**Rationale**: Deployment constraints (operator note, 2026-09-24): single Node process,
localhost-default bind, health endpoint, no hard-coded proxy/SSO endpoints — all config/env at
deploy time. Reusing `KALSHI_RESEARCH_DB` matches the store's own override mechanism.

## Unresolved → resolved

No NEEDS CLARIFICATION items existed in the spec; all seven research areas above closed with
probed evidence on 2026-09-24.