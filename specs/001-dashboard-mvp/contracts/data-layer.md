# Contract: Read-Only Data Layer (`src/lib/store/`)

**Feature**: specs/001-dashboard-mvp | **Date**: 2026-09-24
This is the dashboard's single external interface: every UI element obtains data exclusively
through these functions. They are the seam that makes the read-only guarantee (FR-011),
the schema gate (FR-013), and the golden tests (D7) enforceable in one place.

## Module contract

- **`openStore(path: string): OpenedStore`** — opens SQLite `readOnly: true` (throws
  `StoreMissingError` if the file does not exist), reads `MAX(version) FROM schema_version`,
  and throws `SchemaMismatchError` unless the version is in `SUPPORTED_SCHEMA_VERSIONS = [2]`.
  All other modules obtain their handle only from this function. No module in the codebase
  may construct a database connection any other way (lint-enforced by import boundaries).
- **`StoreError` hierarchy**: `StoreMissingError` (→ UI renders "store not available"),
  `SchemaMismatchError` (→ UI renders the version-mismatch state), `StoreUnavailableError`
  (transient open failure, e.g. WAL contention → UI renders "store not available", retryable).
- Every function below is pure-read over the handle; none takes user input beyond the
  documented arguments; none ever issues anything but a `SELECT`.

## Queries

```ts
// families.ts — FR-015
listFamilies(): Promise<{ family: string; seriesTicker: string; kind: string }[]>
//   SELECT family, series_ticker, kind FROM series ORDER BY family
//   golden (fixture A): 6 rows, HO=F, KXAAAGASD, KXAAAGASM, KXDIESELD, KXTRUMPAPPROVE, RB=F

// observations.ts — FR-007, FR-002, D6
getSeriesWindow(family: string, window: Window): Promise<SeriesPoint[]>
//   Window = '7d' | '30d' | '90d' | 'all'; filters obs_date >= now - window ('all' = none);
//   source-priority dedupe (kalshi_settlement > aaa_page > yahoo_close >
//   kalshi_expiration_value); one point per date:
//   SeriesPoint = { obsDate, value: number|null, lo: number|null, hi: number|null,
//                   mid: number|null, source, quality, unit }
//   golden (fixture A, KXDIESELD 'all'): 53 distinct dates; 2026-09-24 carries a
//   kalshi_settlement band lo=6.51 hi=6.515 (value null, mid 6.5125) — the point row for
//   2026-09-23 (kalshi_expiration_value, value 6.5217) coexists on the prior date.

// pnl.ts — FR-001, FR-008, D4
getPnl(window: Window): Promise<PnlView>              // see data-model.md PnlView
getFamilyPnl(family: string, window: Window): Promise<PnlView>
//   golden (fixture A, 'all'): realized = [diesel position, realized_pnl −5.001],
//   totalRealized = −5.001; open = []; with a fixture open position + stored quote,
//   mark = contracts × (quote − fill) for yes, contracts × ((1−quote) − fill) for no.

// hitrate.ts — FR-009, D2 (normative classification, see data-model.md)
getScoreboard(family?: string): Promise<Scoreboard>
//   Scoreboard = { families: { family, success, fail, pending, unscored, hitRate: number|null }[],
//                  unattributed: { success, fail, pending, unscored } }
//   golden (fixture A): KXDIESELD 2/1/1 66.7%; KXAAAGASD 2/0/1 100%; KXAAAGASM pending 2;
//   KXTRUMPAPPROVE pending 3; HO=F, RB=F zero rows with hitRate null; unattributed 0.

// banner.ts — FR-004, D5
getLatestRecommendations(): Promise<BannerEntry[]>
//   one entry per family: latest prediction by runs.started_at DESC, predictions.id DESC;
//   { family, direction, pYes, pointForecast, targetDate, rationale,
//     traded: boolean (position_id NOT NULL), run: { startedAt, digestHashPrefix } }
//   golden (fixture A): 5 families with ≥1 prediction; KXDIESELD entry is prediction 10
//   (target 2026-09-25, flat, pf 6.55, rationale present, traded=false).

// freshness.ts — FR-016, FR-017
getStoreStatus(): Promise<StoreStatus>
//   { reachable, schemaVersion, storeRev, staleCount, lastRunAt }
//   staleCount = count of store `stale`-rule violations (freshness rules per
//   research-continuity.md §Freshness contract: open ladders/quotes 15 min, partial
//   closes 30 min, DERIVED invalidated by newer inputs)
//   golden (fixture A): reachable=true, schemaVersion=2, storeRev=3804.

// skilllog.ts — FR-003, D3
getSkillChanges(sinceDays = 30, max = 10): Promise<SkillChange[]>
//   exec `git -C $KALSHI_SKILL_REPO_DIR log --since=... --pretty=%H|%ad|%s`; env path;
//   returns [] and the UI shows its unavailable state when env unset / not a repo
//   (never a hard-coded host path).

// health.ts — FR-018 (route /api/health)
//   200 { ok: true, store: { reachable, schemaVersion } } when open + version supported
//   503 { ok: false, store: { reachable, schemaVersion } } otherwise
```

## Configuration contract (`src/lib/config.ts`)

| Env var | Meaning | Default |
|---|---|---|
| `KALSHI_RESEARCH_DB` | absolute path to the store (same var the store CLI honours) | **required — no default in code** |
| `KALSHI_SKILL_REPO_DIR` | path to a checkout of the skill repo for the git-log card | unset → card shows unavailable state |
| `HOSTNAME` / `PORT` | bind address / port | `127.0.0.1` / `3000` |

No other configuration exists; no gateway/proxy/SSO endpoints are read or hard-coded (FR-019).

## Non-negotiable invariants (lint/test-enforced)

1. Exactly one module (`openStore`) ever opens SQLite, always `readOnly: true`.
2. No `INSERT/UPDATE/DELETE/DDL` string appears anywhere under `src/` (test scans the tree).
3. No absolute host path constant appears under `src/`.
4. Every golden test runs against a synthetic fixture store built by `buildStoreFixture()`
   (v2 DDL copied verbatim from `research_store.py`), never the live store.