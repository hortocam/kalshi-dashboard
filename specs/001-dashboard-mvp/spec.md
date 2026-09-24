# Feature Specification: Kalshi Research Dashboard MVP

**Feature Branch**: `wt/dashboard-spec`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "A basic web server + minimal dashboard for the Kalshi research
skill and its continuity store: homepage with overall project P&L (windowed), one summary card
per tracked market family, a card of recent skill changes, and a banner of the latest daily
recommendations; per-market scorecard pages with recommendation graphs, historical market
performance, position P&L history, a recommendation hit-rate scoreboard that tracks
success/fail even when no position was taken, and change notes; reading the research store
read-only, never writing to it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Homepage project summary (Priority: P1)

Cameron opens the dashboard and sees, on one page, the state of the whole Kalshi research
project: how much money the project has made or lost overall over a chosen time window, one
summary card per tracked market family (recent prints, open positions, realized P&L), what has
recently changed in the research skill itself, and a banner summarizing the latest daily
recommendations. This is the daily glance: "is the project working, and what did the skill say
yesterday?"

**Why this priority**: It is the landing view and the first phase of the agreed implementation
sequence (P3 homepage). It delivers the project-level answer before the per-market detail
exists.

**Independent Test**: With the real research store in place, open the homepage and confirm all
four sections render with values that match the store (the one realized position so far must
appear as −$5.001 overall). Can be demonstrated before any per-market page exists.

**Acceptance Scenarios**:

1. **Given** the store contains at least one settled position, **When** the homepage loads with
   the default 30-day window, **Then** the overall P&L section shows the total realized P&L for
   that window and the current selection can be switched between 7d / 30d / 90d / all-time,
   updating the number.
2. **Given** the store tracks several market families, **When** the homepage loads, **Then** a
   summary card appears for every tracked family, each showing its most recent prints, its open
   positions, and its realized P&L — and a family with none of these still shows a card (zero
   state), not a blank page.
3. **Given** the skill repository has recent commits, **When** the homepage loads, **Then** the
   skill-changes card lists the most recent skill changes with date and description.
4. **Given** the latest research run recorded recommendations, **When** the homepage loads,
   **Then** the banner card summarizes, per family, the latest recommendation with its
   direction/forecast and stated rationale (trade or pass), as recorded in the store.

---

### User Story 2 - Per-market scorecard (Priority: P1)

From the homepage or the left navigation, Cameron opens any tracked market family and sees its
scorecard: the list of recommendations that were made for that family, each with its graph; the
family's historical market performance as a chart (default 30-day window); the P&L history of
individual positions taken in that market; the change notes and important call-outs; and —
the point of the whole page — the hit-rate scoreboard that counts every resolved recommendation
as a success or a failure **even when no position was taken**, proving whether the skill's calls
are actually right.

**Why this priority**: This page is the evidence that the skill works; success/fail tracking
without a position is a hard requirement from the product owner. It is phase P4 in the agreed
sequence and depends on the same data layer as the homepage.

**Independent Test**: Open a family's scorecard page and reconcile its scoreboard against the
store directly: every resolved prediction for that family appears as success or fail (or
pending), including ones with no linked position. Demonstrable once the data layer exists,
independent of homepage cosmetics.

**Acceptance Scenarios**:

1. **Given** a family has resolved predictions with no linked position, **When** its scorecard
   loads, **Then** the hit-rate scoreboard counts those predictions as successes or failures and
   includes them in the hit rate exactly as if a position had been taken.
2. **Given** a family has an observation series with band-only (interval) prints, **When** the
   historical performance chart renders for the default 30-day window, **Then** interval prints
   appear as bands (not omitted) and point prints appear as values, with a window selector
   available.
3. **Given** a family has at least one recommendation, **When** the scorecard loads, **Then**
   each recommendation entry shows its graph (forecast context vs what happened) and its stated
   rationale.
4. **Given** a family has one or more positions, **When** the scorecard's P&L section renders,
   **Then** each position shows entry (side, contracts, fill price, fee), its realized P&L if
   settled, or its unrealized mark from stored quotes for open ones — and an open position with
   no stored quote shows the mark as unavailable rather than zero.
5. **Given** a family has change notes or call-outs recorded, **When** the scorecard loads,
   **Then** the notes card shows them, most recent first.

---

### User Story 3 - Data freshness transparency (Priority: P2)

While reading any page, Cameron can tell how old the data behind it is: the page shows the
as-of time of what it displays, and the homepage also shows the store's count of stale
artifacts — because a scoreboard built on stale data would mislead, and the store already
carries the freshness contract that makes this answerable.

**Why this priority**: It protects trust in the scoreboard but is not required for the core
questions (P&L and hit rate) to be answerable; it can be added without changing the other
stories.

**Independent Test**: Open the homepage after the research bot has been idle longer than its
freshness rules allow; the page shows a non-zero stale-artifact count and visible as-of
timestamps. Independently demonstrable per page.

**Acceptance Scenarios**:

1. **Given** any rendered view, **When** Cameron looks at it, **Then** an as-of timestamp for
   the displayed data is visible on the page.
2. **Given** the store reports stale artifacts, **When** the homepage loads, **Then** the stale
   count is displayed on the homepage so staleness is visible without opening the store.

---

### Edge Cases

- What happens when the configured store is missing or unreadable? Every page shows a clear
  "store not available" state instead of an error dump or a blank screen.
- What happens when the store's schema is newer (or older) than the dashboard supports? The
  dashboard states the version mismatch and refuses to render guessed data.
- What happens when the store is empty (no predictions, no positions yet)? Pages render zero
  states ("no recommendations yet") rather than empty charts or exceptions.
- What happens when a prediction has no stored print for its target date? It shows as pending
  (unresolved), never as a silent success or failure.
- What happens when two source rows exist for the same observation date? The chart plots one
  value per date — the store's series-of-record priority — never a double line.
- What happens when the research bot writes to the store while Cameron is reading? Reads are
  read-only and must not block or corrupt either side; a slightly stale read is acceptable.
- What happens when a selected window (e.g. 7d) contains no data for a family? The section
  shows an explicit empty state, not a broken or blank chart.
- What happens when a position is open with no stored quote? Its mark displays as unavailable
  with a note, matching the store's own convention — never as zero.

## Requirements *(mandatory)*

### Functional Requirements

**Homepage**

- **FR-001**: The homepage MUST display the project's overall P&L from start, over a selectable
  time window (7d / 30d / 90d / all-time; default 30d), computed from the store's recorded
  positions — realized results within the window, plus unrealized marks from stored quotes for
  open positions shown distinctly from realized results.
- **FR-002**: The homepage MUST display one summary card per tracked market family showing that
  family's most recent prints, its open positions, and its realized P&L.
- **FR-003**: The homepage MUST display a card listing recent changes to the Kalshi skill (from
  the skill repository's change history), each with date and description.
- **FR-004**: The homepage MUST display a banner card summarizing the latest daily
  recommendations — per family, the most recent prediction with direction/forecast and its
  stated rationale (trade or pass) — sourced from the store's predictions.

**Per-market pages**

- **FR-005**: The dashboard MUST provide a per-market page for every tracked family, reachable
  in one click from the homepage or the left navigation.
- **FR-006**: The per-market page MUST display the family's recommendation history as a list in
  which each recommendation includes a graph of its forecast context versus what happened.
- **FR-007**: The per-market page MUST display the family's historical market performance as a
  chart of the stored observation series, defaulting to a 30-day window, plotting point values
  as values and interval-only prints as bands, one value per date.
- **FR-008**: The per-market page MUST display the P&L history of the positions taken in that
  market: entry details (side, contracts, fill price, fee), realized P&L for settled positions,
  and unrealized marks from stored quotes for open ones.
- **FR-009**: The per-market page MUST display the recommendation hit-rate scoreboard: every
  resolved prediction for the family classified success or fail — including predictions with no
  linked position — with successes, failures, and pending counted separately and a hit rate
  derived from them, using the store's own resolution vocabulary (market outcomes vs print
  directions) so the dashboard's classification never disagrees with the store's.
- **FR-010**: The per-market page MUST display a card with change notes and important call-outs
  for the family, most recent first.

**Data access & behaviour**

- **FR-011**: The dashboard MUST read the research store read-only in every code path; it MUST
  NEVER write to the store, and no page or action may mutate any store data.
- **FR-012**: The store location MUST be configurable at start time (environment/configuration),
  with no absolute host paths in shipped code, and a clear "store not available" state when the
  configured store is missing.
- **FR-013**: The dashboard MUST verify the store's schema version at access time and, on a
  version it does not support, refuse to render data and state the mismatch.
- **FR-014**: The dashboard MUST require no credentials, API keys, or signed endpoints: every
  input is either the local store or public data.
- **FR-015**: The left navigation MUST list the overview and every tracked family, with family
  entries derived from the store (a family added to the store appears without code changes).
- **FR-016**: Each page MUST display an as-of timestamp for the data behind the rendered view.
- **FR-017**: The homepage MUST display the store's stale-artifact count so data staleness is
  visible at a glance.

**Deployment shape (binding constraints from the product owner; deployment wiring itself is a
follow-up after MVP)**

- **FR-018**: The service MUST expose a health endpoint that reports liveness and whether the
  configured store is reachable, suitable for an external reverse proxy's health checks.
- **FR-019**: The service MUST be a single web-server process whose listen address and port are
  configuration (defaulting to localhost-only binding), with no in-app authentication required
  for MVP — access control is expected to be fronted by an external SSO gateway at deployment
  time. No external gateway or identity endpoints, hosts, or addresses MAY be hard-coded in
  code; all deployment wiring (proxy, SSO, firewall) lives in configuration/environment at
  deploy time, and the MVP build is verified on a localhost bind only.

### Key Entities

- **Market family (tracked series)**: a recurring market the research follows (e.g. a daily
  diesel ladder or a heating-oil price series); the unit of navigation and of every per-market
  view; identified by its ticker.
- **Observation (print)**: one dated value or value band for a family — the historical
  performance series; carries its own source and quality.
- **Prediction (recommendation)**: the skill's recorded expectation for a date or market, with
  direction/forecast, confidence, rationale, and its later resolution (outcome) — the input to
  the hit-rate scoreboard and the daily banner.
- **Position**: an executed trade in a market — side, contracts, fill price, fee — with its
  realized P&L once settled, optionally linked to the prediction that motivated it; the input to
  P&L displays.
- **Run**: one research session's record (when it ran, what changed) — the context that groups
  recommendations into daily batches and supports "latest" banner queries.
- **Skill change**: a recorded change to the research skill itself (commit date, description) —
  the input to the homepage skill-changes card.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening the homepage shows all four sections (overall P&L, per-family cards,
  skill changes, recommendations banner) fully rendered within 5 seconds on a local network.
- **SC-002**: From the homepage or left navigation, any tracked family's scorecard is reachable
  in one click.
- **SC-003**: The hit-rate scoreboard reconciles exactly with the store: for each family, the
  count of successes, failures, and pending equals the store's resolved and unresolved
  prediction counts for that family, and predictions with no position are counted the same as
  predictions with one.
- **SC-004**: With the live store (≈50 observations for the major families, 12 predictions, 1
  realized position) the homepage P&L shows −$5.001, matching the store's own total to the cent.
- **SC-005**: With an empty store (no rows at all), every page renders a zero state with no
  errors, and with a missing store every page renders the "store not available" state.
- **SC-006**: Across a full session exercising every page, the store file is byte-identical
  before and after (checksum unchanged), proving the dashboard never wrote to it.
- **SC-007**: Cameron can determine the age of the data on any page from the as-of timestamp in
  under 5 seconds of looking.
- **SC-008**: The service, started with default configuration, binds to the local machine only
  and answers its health endpoint positively when the store is reachable and negatively when it
  is not.

## Assumptions

- **Single user, local network, no in-app authentication in MVP** — the dashboard is Cameron's
  view onto his own research bot's store. At deployment time it will sit behind an external SSO
  gateway (forward-auth) with default-deny access limited to the owner; that wiring is a
  follow-up, but the spec requires the service shape that makes it possible (single process,
  configurable localhost-default bind, health endpoint, zero hard-coded gateway endpoints).
- **Deployment host**: the service and the SQLite store will run on the same machine, so the
  store is read over a local filesystem path with no network hop; the MVP is built and verified
  on a localhost bind, and proxy/SSO/firewall wiring is parked as a follow-up card after MVP
  merges.
- **Stack fixed by the product owner (not re-litigated here)**: a Next.js (App Router)
  TypeScript app styled with shadcn/ui + Tailwind, Recharts for charts, a left sidebar
  navigation layout, served by a basic web server (standalone start; no Docker requirement in
  MVP). Recorded as a binding constraint from the product owner; everything else in this spec
  stays technology-agnostic.
- **The store is the single source of truth**: P&L conventions (win/loss settlement, taker-fee
  round-up-to-cent) are owned by the store, which already computes them; the dashboard displays
  the store's computed values and, where it aggregates (e.g. window totals), sums stored values
  without re-deriving settlement math.
- **"Latest daily recommendations" live in the store**: the research digest's state (last run,
  expectations, rationales) is persisted in the store itself (`runs`, predictions with
  rationales); the banner derives from those rows and requires no separate cron artifact. The
  exact "latest" rule is pinned in the plan's data model.
- **"Recent prints"** means the family's most recent observation values (including interval
  bands), as stored.
- **Hit-rate vocabulary follows the store's resolution semantics** (market outcomes `yes`/`no`
  vs print directions `up`/`down`/`flat`); the exact classification rules are pinned in the
  plan's data model so the dashboard and the store can never disagree.
- **One realized position exists today** (−$5.001, diesel, 2026-09-24) — the natural acceptance
  fixture for SC-004.
- **Families currently tracked**: KXDIESELD, KXAAAGASD, HO=F, RB=F, plus KXTRUMPAPPROVE and
  KXAAAGASM appearing later — the dashboard derives the list from the store (FR-015) rather
  than hard-coding any of them.
- **English UI; currency in USD.**
- **Out of scope for MVP** (parked as backlog in tasks.md, not specced): live account API
  (balances/open positions from the exchange), placing trades from the dashboard, per-market
  token/tool cost tracking display.