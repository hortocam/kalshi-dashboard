# Kalshi Dashboard Constitution
<!-- Ratified: 2026-09-24 | Supreme operating charter for the kalshi-dashboard repo. Amendments EXTEND; they never replace prior content. Full history below. -->

## Core Principles

### I. Spec-First (NON-NEGOTIABLE)
Every feature, phase, or change beyond a trivial fix begins with a specification written against
this project's Spec Kit flow. The spec defines the *what* and *why* (user journeys, success
criteria) before any code is written. No implementation work starts until a spec exists and has
been accepted. The spec is the shared source of truth; when code and spec disagree, the spec
wins and the code is corrected.

**Why**: the sibling kalshi-skill repo adopted this charter after its first build was driven by a
design attachment rather than a Spec Kit feature directory, which made `speckit-converge` unable
to run — the review gate rested on a worker's prose summary instead of a runnable command.
Spec-first makes the gate real.

### II. Test-Driven Development (NON-NEGOTIABLE)
Red-Green-Refactor is the enforced cycle: write a failing test that expresses the intended
behavior; confirm it fails for the right reason; implement the minimum to pass; refactor while
green. A card or PR is not complete until its tests are green. There is no "implementation first,
tests later".

**Why**: the sibling kalshi-skill store's stdlib test suite caught real defects during its first
build (a trailing-hyphen bug in reviewer derivation, and idempotency regressions). Tests are the
cheapest independent check that survives into the merge.

### III. GitHub Flow Branching
`main` must always be deployable and green. Every change goes on a short-lived feature branch
(prefix `wt/` for worktree tasks). Work is integrated through a Pull Request against `main`.
Branches are deleted after merge.

### IV. Independent Review (NON-NEGOTIABLE)
Every PR is reviewed by a model from a **different lineage** than the engineer who wrote it. The
implementer must NEVER approve their own work. The reviewer runs `speckit-converge` against the
spec, plan, and tasks; the loop implement → converge repeats until converge returns clean. Only on
a clean converge does the reviewer open the PR.

**Why**: a same-lineage reviewer shares the implementer's blind spots; the sibling repo's
correctly-triaged collinearity diagnostic only happened because a different model lineage re-ran
the finding.

### V. Merge Authority (NON-NEGOTIABLE)
Engineers push `wt/*` branches and request review. Reviewers converge, then open the PR. **Only
Jarvis merges.** No worker, engineer, or reviewer merges a PR. Jarvis is the coordinator and sole
merge authority for `main`.

### VI. Read-Only Research Store (NON-NEGOTIABLE)
The dashboard reads the Kalshi research continuity store but NEVER writes to it. No code path may
place an order, sign a request, touch account endpoints, or write to the store. The store's own
bot remains the sole writer. If a card asks the dashboard to mutate the store or trade, the card
is wrong and must be corrected.

**Why**: the continuity store is the bot's source of record and the dashboard is a viewer. A
write from the dashboard would corrupt the research ledger the skill depends on; the account
endpoints are signed and out of scope by design in the whole Kalshi stack.

### VII. Artifacts Never In Git
Generated data, research stores, caches, and build output do not belong in the repository. The
repo is portable: source, spec artifacts, and configuration only. Runtime data lives outside the
repo (the store stays in the owning profile's directory).

**Why**: the store is private research data owned by the kalshi-bot profile; committing it would
both leak it and fork the source of truth.

### VIII. Evidence Over Assertion
Every claim of completion carries reproducible evidence: a command, its real output, and the
artifact it produced. A "done" without a green test run and real rendered output is a hollow done
and must be treated as unbuilt.

## Quality Gates & Tooling

- **Tests**: Next.js built-in test runner or Vitest, run in CI on every PR; data-layer fixtures
  must be synthetic copies, never the live store.
- **Data hygiene**: the store path is configuration (environment), never hard-coded; the
  dashboard ships no credentials and needs none — every input is public or local.
- **Portability**: no absolute host paths in shipped code.

## Governance

- **Amendments EXTEND; they never replace.** The full history stays present in every version.
- Every amendment records a `Why`, so the document carries its own rationale forward.
- Versioning: MAJOR = principle removal/redefinition; MINOR = new principle or expanded guidance;
  PATCH = wording.
- A change is adopted when the human approves it.

**Version**: 1.0.0 | **Ratified**: 2026-09-24 | **Last Amended**: 2026-09-24

## Amendment History

| Version | Date | Change | Why |
|---|---|---|---|
| 1.0.0 | 2026-09-24 | Initial ratification | The dashboard repo gained its first Spec Kit feature directory; the converge gate needs a charter to converge against. |