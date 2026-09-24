# Quickstart: Kalshi Research Dashboard MVP

**Feature**: specs/001-dashboard-mvp | **Date**: 2026-09-24
Validation scenarios that prove the feature works end-to-end. Run them in order; each states
its expected outcome. (Details live in [contracts/data-layer.md](./contracts/data-layer.md),
[data-model.md](./data-model.md), [research.md](./research.md).)

## Prerequisites

- Node.js 22 (the deployment host runs 22.23.2; `node:sqlite` is built in).
- The research store present on the host (schema v2, ~1 MB) and the path to it.
- A checkout of the skill repo if the homepage skill-changes card should show content.
- No credentials, no API keys, no network access to Kalshi is required for any scenario.

## Environment (start-time configuration — no hard-coded paths in code)

```bash
export KALSHI_RESEARCH_DB="$HOME/.hermes/profiles/kalshi-bot/research/kalshi.sqlite"
export KALSHI_SKILL_REPO_DIR="/home/hermes/projects/kalshi-plugin"   # optional, enables the skill-changes card
export HOSTNAME=127.0.0.1     # default: localhost-only bind
export PORT=3000              # default
```

## V1 — Data-layer golden tests (fixture store, no live data)

```bash
npm install && npm run test
```

Expected: all Vitest suites green. The fixture helper `buildStoreFixture()` creates a
synthetic v2 store (DDL copied verbatim from `research_store.py`) and seeds the golden rows;
tests pin, at minimum:

- scoreboard: KXDIESELD success 2 / fail 1 / pending 1 (66.7%); KXAAAGASD 2/0/1 (100%);
  KXAAAGASM pending 2; KXTRUMPAPPROVE pending 3; unattributed 0;
- P&L: total realized −5.001 from one settled position; an open position with a stored quote
  marks `contracts × (quote − fill)` (yes) / `(1−quote) − fill` (no); no-quote → mark
  unavailable, not zero;
- series: KXDIESELD 53 distinct dates; on 2026-09-23 the series-of-record row is the
  `kalshi_settlement` band (lo 6.52, hi 6.525) — a raw `kalshi_expiration_value` point
  (6.5217) coexists on the same date and is deduped away by source priority; on
  2026-09-24 the series-of-record row is the band (lo 6.51, hi 6.515); point-row
  selection is exercised by a synthetic fixture date whose highest-priority source is a
  point;
- invariants: store file checksum unchanged across the whole suite (read-only proof);
  no write/DDL statement anywhere under `src/`; schema gate rejects version ≠ 2;
  missing store → `StoreMissingError` → UI "store not available" state;
- empty fixture store → zero states everywhere, no errors.

## V2 — Homepage against the real store (US1 / SC-001, SC-004)

```bash
npm run build && npm run start     # binds 127.0.0.1:3000
open http://127.0.0.1:3000/
```

Expected: overall P&L **−$5.001** (window selector 7d/30d/90d/all present, default 30d);
six family cards (HO=F, KXAAAGASD, KXAAAGASM, KXDIESELD, KXTRUMPAPPROVE, RB=F) each with
recent prints / open positions / realized P&L; skill-changes card listing recent commits of
the configured repo; banner card with one entry per family that has predictions (4 today)
including direction/forecast, rationale, and traded vs recorded state; as-of timestamp and
stale-artifact count visible.

## V3 — Per-market scorecard reconciliation (US2 / SC-003)

```bash
open http://127.0.0.1:3000/markets/KXDIESELD
```

Expected: hit-rate scoreboard **success 2 / fail 1 / pending 1, hit rate 66.7%** — counted
independently of position linkage (only one of these predictions has a position); historical
chart over the last 30 days where both the 2026-09-24 and the 2026-09-23 prints render as
bands (each date's `kalshi_settlement` band is the series-of-record; see D6) — point
rendering is covered by V1's synthetic fixture date, not a live date; the realized −$5.001
position in the P&L history with side/contracts/fill/fee; the
recommendation list with per-recommendation graphs and rationales; change-notes card.

Cross-check (the scoreboard must agree with the store's own verdicts):

```bash
python3 ~/.hermes/profiles/kalshi-bot/skills/finance/kalshi/scripts/research_store.py \
  digest --since-last-run --max-lines 60 | sed -n '1,20p'
```

The digest's ✔/✘ marks for KXDIESELD (-0.30 sd ✔, -0.19 sd ✔, +1.47 sd ✗) must match the
page's success/fail classification exactly.

## V4 — Read-only proof (FR-011 / SC-006)

```bash
sha256sum "$KALSHI_RESEARCH_DB"   # before
# click through: homepage, every family page, every window selector
sha256sum "$KALSHI_RESEARCH_DB"   # after — must be identical
```

## V5 — Health + failure states (FR-012/013/018 / SC-005 / SC-008)

```bash
curl -fsS http://127.0.0.1:3000/api/health
# → 200 {"ok":true,"store":{"reachable":true,"schemaVersion":2}}

KALSHI_RESEARCH_DB=/nonexistent.sqlite npm run start   # separate port
curl -s http://127.0.0.1:<alt-port>/api/health          # → 503, ok:false
# and every page renders the "store not available" state (no stack traces)

KALSHI_RESEARCH_DB=<copy-of-store-with-schema-version-1> ...
# → pages render the schema-version mismatch state, never guessed data
```

## V6 — Localhost-only binding (SC-008)

```bash
npm run start   # default config
ss -ltnp | grep 3000    # bound to 127.0.0.1 only — not 0.0.0.0
```

## Done means

All of V1–V6 executed with real outputs captured. Any scenario that cannot pass blocks the
implementation card — it is not waved through.