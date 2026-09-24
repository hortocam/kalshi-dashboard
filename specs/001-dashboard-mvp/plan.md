# Implementation Plan: Kalshi Research Dashboard MVP

**Branch**: `001-dashboard-mvp` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-dashboard-mvp/spec.md`

## Summary

A read-only web dashboard over the Kalshi research continuity store
(`~/.hermes/profiles/kalshi-bot/research/kalshi.sqlite`, schema v2, 11 tables — schema authority:
`research_store.py` in the kalshi-skill repo). Homepage shows overall windowed P&L, one summary
card per tracked family, recent skill changes (git log of the skill repo), and a banner of the
latest daily recommendations. Per-market pages are the skill's scorecard: recommendation list
with graphs, historical performance chart, position P&L history, and the hit-rate scoreboard
that counts resolved predictions as success/fail **even when no position was taken**. Data
access is a typed, read-only SQLite reader (`node:sqlite` on Node 22, `readOnly: true` open
mode — proven on this host) behind a small server-side query module; the dashboard never writes
to the store. Stack fixed by the product owner: Next.js App Router + TypeScript + shadcn/ui +
Tailwind + Recharts, sidebar layout, standalone server, localhost-default bind, health endpoint
for a future reverse-proxy front (deployment wiring is a follow-up card).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 (node:sqlite available; Node 22.23.2 present
on the deployment host). Next.js 15 App Router.

**Primary Dependencies**: next (App Router, standalone output), react, TypeScript, tailwindcss
+ shadcn/ui (Radix primitives), recharts. No ORM — the data layer reads SQLite directly.

**Storage**: SQLite (the research store), opened read-only via `node:sqlite` `DatabaseSync`
with `readOnly: true`. No dashboard-owned database, no cache table, no writes anywhere. WAL
side files exist and are handled by SQLite itself in read-only mode (probe-verified).

**Testing**: Vitest (unit + data-layer golden tests against synthetic fixture stores built from
a documented schema-copy DDL — never the live store), plus Next.js route/render tests for pages.
Playwright is deferred to the deployment card.

**Target Platform**: Linux server (CT 914), same host as the store; single Node process bound
to 127.0.0.1 by default; future front = Traefik + Authentik forward-auth (config-only, not in
code).

**Project Type**: web-application (single Next.js app; data access is in-process server-side,
no separate backend service).

**Performance Goals**: homepage fully rendered < 5 s on localhost (SC-001); every query over
the ~1 MB store completes in well under a second (largest table: 2,848 markets rows).

**Constraints**: read-only by construction (FR-011); no credentials anywhere (FR-014); store
path via env config, no absolute host paths in shipped code (FR-012); schema-version gate at
access time (FR-013); zero hard-coded proxy/SSO endpoints (FR-019); localhost-default bind
(SC-008).

**Scale/Scope**: one user, 6 tracked families, ~50 observations per major family, 12
predictions, 1 realized position today — an order of magnitude of headroom before any
performance work matters.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Spec-First | PASS | spec.md written by speckit-specify; this plan follows it. |
| II. Test-Driven Development | PASS | tasks.md (next phase) will carry test-first tasks per story: data-layer golden tests against fixture stores, then implementation. |
| III. GitHub Flow | PASS | Work proceeds on `wt/dashboard-spec`; implementation cards get their own `wt/*` branches; PRs against main; only Jarvis merges. |
| IV. Independent Review | PASS | Reviewer profile is a different model lineage; reviewer runs speckit-converge before opening any PR. |
| V. Merge Authority | PASS | No worker merges; Jarvis only. |
| VI. Read-Only Research Store | PASS | Design choice itself enforces it: `node:sqlite` open mode `readOnly: true` makes writes impossible from the dashboard process — verified by probe on this host. SC-006 (store checksum unchanged) is the acceptance evidence. |
| VII. Artifacts Never In Git | PASS | The store stays in the owning profile's directory; repo carries only code, specs, and fixture DDL. `.gitignore` already excludes node_modules/.next. |
| VIII. Evidence Over Assertion | PASS | Every task's done-ness is a runnable command + real output (test run, rendered page, checksum). |

Post-Phase-1 re-check: the design adds no new violations — data-model.md and contracts stay
read-only and config-driven; no family-specific branching exists anywhere in the design.

## Project Structure

### Documentation (this feature)

```text
specs/001-dashboard-mvp/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── data-layer.md    # The typed read API the UI consumes (the system's external interface)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Sidebar shell (shadcn sidebar layout)
│   ├── page.tsx              # Homepage: US1
│   ├── health/route.ts       # Health endpoint: FR-018
│   └── markets/[family]/page.tsx   # Per-market scorecard: US2
├── components/
│   ├── ui/                   # shadcn/ui generated primitives
│   ├── charts/               # Recharts wrappers (series band chart, rec graphs)
│   └── cards/                # P&L card, family card, banner, skill-changes, scoreboard
├── lib/
│   ├── store/                # The read-only data layer (contract in contracts/store.md)
│   │   ├── open.ts           # readOnly open + schema-version gate (FR-011/012/013)
│   │   ├── queries.ts        # Typed query functions per UI need
│   │   ├── hitrate.ts        # Scoreboard classification (store semantics, see data-model.md)
│   │   └── skilllog.ts       # Skill-repo git log reader (FR-003)
│   └── config.ts             # Env config: store path, bind addr/port (FR-012, FR-019)
└── tests/                    # Vitest: unit + golden tests over synthetic fixture stores
    ├── fixtures/             # buildStoreFixture() DDL + seeds (synthetic, documented)
    └── ...                   # colocated *.test.ts per module
```

**Structure Decision**: Single Next.js application (no separate backend service — the App
Router's server components and route handlers ARE the server). The data layer is an isolated
module (`src/lib/store/`) so every read is testable against synthetic fixture stores without
the live store, and so the read-only guarantee is provable in one place.

## Complexity Tracking

No constitution violations — nothing to justify.