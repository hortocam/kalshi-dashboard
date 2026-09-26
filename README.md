# kalshi-dashboard

Read-only Next.js dashboard over the Kalshi research continuity store
(`~/.hermes/profiles/kalshi-bot/research/kalshi.sqlite`, schema v2, owned by
the kalshi-skill repo). The dashboard never writes to the store; every read
goes through a typed `node:sqlite` reader (`readOnly: true` open mode).

Stack: Next.js 15 (App Router, TypeScript, `output: 'standalone'`) · React 19 ·
shadcn/ui (Radix primitives) · Tailwind 4 · Recharts · Vitest. Localhost-only
bind by default; deployment wiring (Traefik + Authentik forward-auth) is a
**separate follow-up card** (see "Deployment" below).

Governed by the Spec Kit SDD process; see `specs/001-dashboard-mvp/`.

## Run it

The repo builds a Next.js **standalone** server. `next start` does **not**
work with `output: 'standalone'` (Next.js prints `'next start' does not work
with "output: standalone"`); the supported path is the bundled
`.next/standalone/server.js`.

```bash
# 1. Install (worktree-friendly; the lockfile pins every transitive dep).
npm ci

# 2. Build the standalone server.
npm run build

# 3. Run it. Default bind: 127.0.0.1:3000.
HOSTNAME=127.0.0.1 PORT=3000 \
  KALSHI_RESEARCH_DB="$HOME/.hermes/profiles/kalshi-bot/research/kalshi.sqlite" \
  node .next/standalone/server.js
# → open http://127.0.0.1:3000/
```

For local development with hot reload (the standalone build is not needed):

```bash
npm run dev
# → open http://127.0.0.1:3000/ (HOSTNAME/PORT env vars still apply)
```

> The repository's `npm start` script is the legacy `next start` path; it
> intentionally errors on standalone builds so the operator cannot silently
> start the wrong binary. Use the `node .next/standalone/server.js` command
> above.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `KALSHI_RESEARCH_DB` | **yes** | — | Absolute path to the research store (schema v2). Missing → `/api/health` returns 503 and every page renders the dedicated "store not available" state. |
| `KALSHI_SKILL_REPO_DIR` | no | unset | Absolute path to a checkout of `github.com/hortocam/kalshi-skill`. When set, the homepage's skill-changes card reads recent `git log` commits. Unset → the card renders the explicit "unavailable" state. |
| `HOSTNAME` | no | `127.0.0.1` | Bind address. Localhost-only by default (FR-019, SC-008). The deployment card adds a reverse proxy in front — do not bind 0.0.0.0 here. |
| `PORT` | no | `3000` | Listen port. |
| `KALSHI_DEBUG_STORE_ERRORS` | no | unset | `1` re-throws store errors (dev / opt-in). Production hides them in the "store not available" UI. |

## Done means

All quickstart scenarios in `specs/001-dashboard-mvp/quickstart.md` pass with
real output captured (V1 data-layer golden tests, V2 homepage against the
live store, V3 per-market reconciliation against the store digest, V4
read-only proof via sha256, V5 health + failure states, V6 localhost-only
bind). The CI workflow at `.github/workflows/ci.yml` runs the test + build
+ lint gates; PRs to `main` require a clean run.

## Tests, build, lint

```bash
npm run test     # Vitest: 146+ tests, fixture stores only, never the live store
npm run build    # next build (standalone)
npm run lint     # ESLint CLI (next lint is deprecated in Next 15)
```

Vitest fixtures use a throwaway `node:sqlite` temp store built from the
DDL copied verbatim from `research_store.py`. The live store is never
touched by the test suite.

## Deployment (follow-up card, not this build)

The MVP ships a single-process server bound to 127.0.0.1, with a working
`/api/health` endpoint. **Production wiring is a separate follow-up card**:
Traefik on `172.16.10.10` as the public front, Authentik forward-auth for
SSO, default-deny firewall, Cameron-only access on CT 914. This card does
not implement that wiring — the operator's deploy plan should:

1. Place Traefik in front, terminating TLS and forwarding to this server.
2. Configure Authentik forward-auth on the Traefik router.
3. Add the dashboard hostname to the Authentik allow-list.
4. Keep the underlying bind at 127.0.0.1; the proxy talks to it locally.

Until that card ships, the dashboard is reachable only via direct access to
the bound port (e.g. over an SSH tunnel to the deployment host).

## Security notes

- The store is opened in `readOnly: true` mode at the SQLite layer
  (`src/lib/store/open.ts`); writes are refused by SQLite itself.
  V4 (sha256 unchanged across a click-through) is the acceptance evidence.
- No credentials, no API keys, no network access to Kalshi is required by
  any page on this dashboard.
- Store path is env-configured; no absolute host paths are checked into
  source (the invariant scan in `src/tests/invariant.test.ts` enforces this).

## Worktree notes

`next.config.ts` pins `outputFileTracingRoot` to the workspace `cwd` so
Next.js' trace step picks the correct lockfile under worktrees. Without
the pin, Next prints "we detected multiple lockfiles and selected the
directory of … as the root directory" — a noise warning that does not
break the build but obscures the real output. The pin resolves the
ambiguity and silences the warning.

## npm audit / Next 16 decision

`npm audit` currently reports:

| Package | Severity | Reachability | Fix |
| --- | --- | --- | --- |
| `postcss` via `next@15` | **high** | indirect (CSS pipeline only) | requires `next@16.3.6` (breaking) |
| `@vitest/mocker` | moderate | test-only (mocker module) | requires `vitest@5` (breaking) |
| `next` (transitive postcss) | moderate | same as above | same fix |
| `next` (transitive vitest-mocker) | moderate | test-only via vitest | same fix |

**Decision (recorded 2026-09-26, P5 card)**: defer the Next 16 upgrade.
The high-severity postcss advisory affects the CSS stringifier that Next
invokes during the build step; the production server never parses
attacker-controlled CSS, and the deploy host is single-tenant with no
untrusted upload surface. The breaking changes in `next@16` (router,
caching, async params) require a separate spec triplet and a coordinated
migration of the data layer, so the upgrade is queued as a follow-up
card rather than wedged into this MVP. The vitest-mocker advisory is
test-only and unreachable from the production process. Re-evaluate
quarterly; do not silently drop the decision.

## Quickstart verification (snapshot)

The card-level evidence for V5 (health) and V6 (localhost-only bind) is
captured on the Kanban card as command output. The repeatable commands:

```bash
# V5 — health: 200 on live store, 503 on missing store
curl -sS http://127.0.0.1:3000/api/health
# → {"ok":true,"store":{"reachable":true,"schemaVersion":2}}

KALSHI_RESEARCH_DB=/nonexistent.sqlite PORT=3001 \
  node .next/standalone/server.js &
curl -sS http://127.0.0.1:3001/api/health
# → {"ok":false,"store":{"reachable":false,"schemaVersion":null}}

# V6 — bind
ss -ltnp | grep 3000
# → LISTEN ... 127.0.0.1:3000 ...  (not 0.0.0.0)
```

## Repo layout

```
src/
├── app/                      # Next.js App Router (server components)
│   ├── layout.tsx            # Sidebar shell (shadcn)
│   ├── page.tsx              # Homepage: overall P&L, families, banner, skill changes
│   ├── health/route.ts       # /api/health (FR-018, SC-005/008)
│   └── markets/[family]/page.tsx  # Per-market scorecard
├── components/
│   ├── cards/                # P&L, family, banner, skill-changes, scoreboard, recs, positions, call-outs, historical-chart
│   └── charts/               # Recharts wrappers: series-chart, recommendation-graph
├── lib/
│   ├── store/                # Read-only data layer (node:sqlite + schema gate)
│   ├── config.ts             # Env config
│   ├── format.ts             # Number formatting (USD3, percent, probability)
│   └── windows.ts            # Window selector (7d / 30d / 90d / all)
└── tests/                    # Vitest: unit + golden tests over fixture stores
```

## License

Private. Author: Cameron + the kalshi-bot multi-agent fleet.
