# Tasks: Kalshi Research Dashboard MVP

**Input**: Design documents from `/specs/001-dashboard-mvp/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/data-layer.md,
quickstart.md (all in this directory)

**Tests**: Required by constitution principle II (TDD). Every phase leads with failing tests.

**Organization**: Sequential phases P1→P4, per the product owner's agreed implementation
sequence. Each phase maps 1:1 to a follow-up implementation card dispatched after this spec
triplet is approved — do not merge phases into fewer cards.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 homepage, US2 per-market, US3 freshness)
- Include exact file paths in descriptions

---

## Phase P1 — Scaffold (implementation card 1)

**Purpose**: A running Next.js app with the sidebar shell, config, health endpoint, and test
rig — no store access yet.

- [ ] T001 [US1] Scaffold Next.js 15 (App Router, TypeScript, `output: 'standalone'`) in the
      repo root; add tailwind + shadcn/ui init; verify `npm run build && npm run start` serves
      a placeholder page on 127.0.0.1:3000
- [ ] T002 [US1] Build the left-sidebar shell (`src/app/layout.tsx`) with shadcn sidebar
      layout: Overview entry + per-family nav entries from the store (FR-015); family list
      renders "no families" placeholder until P2 wires the store
- [ ] T003 [P] [US1] Create `src/lib/config.ts` reading `KALSHI_RESEARCH_DB` (required),
      `KALSHI_SKILL_REPO_DIR` (optional), `HOSTNAME`/`PORT` defaults 127.0.0.1/3000
      (FR-012, FR-019); unit test: defaults, overrides, missing-required → typed error
- [ ] T004 [US1] Add `/api/health` route (`src/app/health/route.ts`) returning 200/503 per
      contracts/data-layer.md (FR-018); tests: 200 with reachable store, 503 with missing store
      (fixture store paths)
- [ ] T005 [P] [US1] Set up Vitest + tsconfig paths; add the invariant test that scans `src/`
      for forbidden SQL write statements and absolute host paths (contracts non-negotiables 2–3)
- [ ] T006 [US1] CI: run `npm run test` + `npm run build` on every push (GitHub Actions);
      green required before review

**Checkpoint**: `npm run test` and `npm run build` green; app boots on 127.0.0.1:3000 with
sidebar shell and working health endpoint.

---

## Phase P2 — Data layer (blocking prerequisite for P3/P4)

**Purpose**: The read-only store module with its fixture-based golden tests. No UI beyond the
shell.

- [ ] T010 [US2] Write `buildStoreFixture()` test helper (schema v2 DDL copied verbatim from
      `research_store.py` + golden seed rows per contracts/data-layer.md); test-first: helper
      creates a temp store, `openStore()` reads schema_version=2 (RED before T011 exists)
- [ ] T011 [US2] Implement `openStore(path)` with `readOnly: true` + schema gate
      (`SUPPORTED_SCHEMA_VERSIONS = [2]`) and the `StoreError` hierarchy
      (`StoreMissingError`, `SchemaMismatchError`, `StoreUnavailableError`);
      tests: missing file, version 1 store, version 3 store, happy path
- [ ] T012 [P] [US2] `listFamilies()` + golden test (6 families, fixture A) (FR-015)
- [ ] T013 [US2] `getSeriesWindow()` with source-priority dedupe + window filter; golden tests:
      KXDIESELD 53 distinct dates; on 2026-09-23 and 2026-09-24 dedupe selects the
      `kalshi_settlement` band as series-of-record (raw `kalshi_expiration_value` points
      6.5217 / 6.5141 coexist and are dropped — a band and a point never both render);
      point-row selection exercised via a synthetic fixture date; 7d/30d/90d/all filtering
      (FR-007, D6)
- [ ] T014 [US2] `getPnl()` / `getFamilyPnl()` per PnlView semantics; golden tests: −5.001
      total; open-position mark math for yes/no sides; no-quote → mark unavailable not zero;
      window filtering by settled_at with open positions window-independent (FR-001, FR-008, D4)
- [ ] T015 [US2] `getScoreboard()` implementing the pinned classification (data-model.md
      ScoreboardEntry, first-match-wins) + golden tests: KXDIESELD 2/1/1 66.7%; KXAAAGASD
      2/0/1 100%; KXAAAGASM pending 2; KXTRUMPAPPROVE pending 3; unattributed 0; a no-position
      prediction scores identically to one with a position (FR-009, D2 — the hard requirement)
- [ ] T016 [P] [US2] `getLatestRecommendations()` banner query + golden tests (one entry per
      family with predictions; KXDIESELD entry = latest run's prediction; traded flag from
      position linkage) (FR-004, D5)
- [ ] T017 [P] [US2] `getStoreStatus()` (storeRev, lastRunAt, staleCount per the store's
      freshness rules) + golden tests (FR-016, FR-017)
- [ ] T018 [P] [US1] `getSkillChanges()` git-log reader + tests against a throwaway fixture
      git repo (init, 2 commits); env unset → [] (FR-003, D3)
- [ ] T019 [US2] Read-only proof test: run every query function against a fixture store,
      close, compare file sha256 before/after (SC-006 at unit level)

**Checkpoint**: all data-layer tests green against fixture stores only; no live store touched
by the suite; contracts/data-layer.md invariants enforced by tests.

---

## Phase P3 — Homepage (US1)

**Purpose**: The four homepage sections over the real store, with failure states.

- [ ] T020 [US1] Overall P&L card: window selector (7d/30d/90d/all, default 30d), realized
      total from `getPnl`, open marks shown distinctly; loading/zero states; component test
      (FR-001, SC-004)
- [ ] T021 [P] [US1] Family summary card component: recent prints (band-aware), open
      positions, realized P&L; zero state; test (FR-002, US1 scenario 2)
- [ ] T022 [US1] Homepage assembles family cards for every store family; integration test
      with fixture store (FR-002)
- [ ] T023 [P] [US1] Skill-changes card from `getSkillChanges`; unavailable state when env
      unset; test (FR-003)
- [ ] T024 [P] [US1] Recommendations banner from `getLatestRecommendations`: direction/forecast,
      rationale, traded vs recorded; test (FR-004)
- [ ] T025 [US3] As-of timestamp + stale-artifact count on the homepage; test (FR-016, FR-017,
      SC-007)
- [ ] T026 [US1] Failure states: store missing / schema mismatch render their dedicated UI
      states on every section; tests (SC-005, edge cases)
- [ ] T027 [US1] Manual verification per quickstart V2 against the live store; capture output
      as evidence (SC-001, SC-004)

**Checkpoint**: homepage matches quickstart V2 expectations end-to-end.

---

## Phase P4 — Per-market scorecard pages (US2)

**Purpose**: The scorecard — including the no-position hit-rate requirement.

- [ ] T030 [US2] `/markets/[family]` route + server component fetching per-family data;
      one-click reachability from sidebar and family cards (FR-005, SC-002)
- [ ] T031 [US2] Historical performance chart (Recharts): band rows as bands + midpoint,
      point rows as values, window selector default 30d; golden-driven component tests
      (FR-007, D6)
- [ ] T032 [US2] Hit-rate scoreboard card from `getScoreboard(family)`: success/fail/pending/
      unscored + hit rate; includes no-position predictions; reconciliation test vs fixture
      golden numbers (FR-009, SC-003 — the hard requirement)
- [ ] T033 [US2] Recommendation list with per-recommendation graph (forecast context vs what
      happened: forecast sd band, market quote context from stored quotes, resolved outcome
      mark) + rationale text; test (FR-006)
- [ ] T034 [P] [US2] Position P&L history card: entry details, realized P&L, unrealized mark
      or explicit unavailable; test (FR-008)
- [ ] T035 [P] [US2] Change notes / call-outs card, most recent first; test (FR-010)
- [ ] T036 [US2] Edge cases on the page: empty window, band-only series, family with no data;
      tests (edge cases)
- [ ] T037 [US2] Manual verification per quickstart V3 + V4 (scoreboard cross-check against the
      store digest's ✔/✘ marks; sha256 unchanged across a full click-through); capture as
      evidence

**Checkpoint**: per-market pages match quickstart V3/V4 exactly.

---

## Phase P5 — Polish & handoff (part of the last implementation card)

- [ ] T040 [US3] Health endpoint wired to real store checks end-to-end; quickstart V5 evidence
- [ ] T041 [US1] Localhost-only bind verification (quickstart V6, `ss -ltnp` evidence)
- [ ] T042 [US1] README: run instructions, env vars, done-when, deployment-constraint note
      (Traefik/Authentik wiring is a follow-up card)
- [ ] T042a [US2] speckit-converge clean against this spec triplet before review

## Backlog (parked — explicitly out of MVP scope; do not spec or build in the cards above)

- Deployment card: Traefik (172.16.10.10) + Authentik forward-auth front, default-deny
  firewall, Cameron-only access; production host wiring on CT 914. The MVP build already
  provides the required shape (single process, localhost bind, /api/health) — this card adds
  only configuration.
- Live account API display (balances / open positions from the exchange).
- Placing trades from the dashboard.
- Per-market token/tool cost tracking display.
- Playwright end-to-end suite (deferred with deployment card).