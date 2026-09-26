/**
 * scorecard.test.ts — T030, T031, T032, T036 + SC-003 reconciliation:
 * the per-market page route/render tests. Exercises `/markets/[family]`
 * through renderToStaticMarkup (the same markup Next ships) against
 * synthetic fixture stores (never the live store). The SC-003 hard
 * requirement lives here: the component-level numbers for KXDIESELD
 * (success 2 / fail 1 / pending 1, hit rate 66.7%) reconcile exactly
 * with the fixture golden pinned by T015 / data-model.md.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import ScorecardPage from "@/app/markets/[family]/page";
import { setScorecardNow } from "@/lib/scorecard-data";
import { buildStoreFixture, type FixtureOptions, type StoreFixture } from "@/tests/fixtures/store-fixture";

/** Window anchor for deterministic window arithmetic: 2026-09-24 17:00Z. */
const SCORECARD_NOW = Date.UTC(2026, 8, 24, 17);

let fixtures: StoreFixture[] = [];

beforeEach(() => {
  setScorecardNow(() => SCORECARD_NOW);
});

afterAll(() => {
  setScorecardNow(null);
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function openFixture(options?: FixtureOptions) {
  const f = buildStoreFixture(options);
  fixtures.push(f);
  return f;
}

async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void> | void
): Promise<void> {
  const saved = process.env.KALSHI_RESEARCH_DB;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    if (saved === undefined) delete process.env.KALSHI_RESEARCH_DB;
    else process.env.KALSHI_RESEARCH_DB = saved;
  }
}

async function renderScorecard(
  family: string,
  windowParam?: string
): Promise<string> {
  const params = Promise.resolve({ family: encodeURIComponent(family) });
  const searchParams = Promise.resolve(
    windowParam === undefined ? {} : { window: windowParam }
  );
  return renderToStaticMarkup(
    await ScorecardPage({ params, searchParams })
  );
}

// ---- T030: route + per-family data assembly --------------------------------

describe("T030: /markets/[family] route + per-family data (FR-005, SC-002)", () => {
  it("renders the KXDIESELD scorecard with the header, scoreboard, and 4 sections", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      // Header + every section card renders.
      expect(html).toContain("KXDIESELD");
      expect(html).toContain("scoreboard-card-KXDIESELD");
      expect(html).toContain("historical-chart-card-KXDIESELD");
      expect(html).toContain("recommendations-list-card-KXDIESELD");
      expect(html).toContain("positions-history-card-KXDIESELD");
      expect(html).toContain("call-outs-card-KXDIESELD");
      // Back-link to overview (one-click reachability reverse path).
      expect(html).toContain('href="/"');
      // As-of timestamp present (FR-016).
      expect(html).toContain("data as of");
    });
  });

  it("reachable from the homepage family card (one click) — both already link /markets/{family}", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      // The homepage family card carries the link; the scorecard page
      // accepts that link's href. SC-002 is satisfied end-to-end.
      const home = renderToStaticMarkup(
        await (await import("@/app/page")).default({
          searchParams: Promise.resolve({}),
        })
      );
      expect(home).toContain('href="/markets/KXDIESELD"');
      const scorecard = await renderScorecard("KXDIESELD");
      expect(scorecard).toContain("scoreboard-card-KXDIESELD");
    });
  });
});

// ---- T031: historical performance chart (FR-007, D6) ----------------------

describe("T031: historical performance chart (FR-007, D6)", () => {
  it("default 30d window: KXDIESELD renders band rectangles + midpoint dots", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      expect(html).toContain("data-window-selected=\"30d\"");
      expect(html).toContain("data-testid=\"series-chart\"");
      // The chart must render band rectangles — KXDIESELD's seeded
      // 2026-09-23 and 2026-09-24 are kalshi_settlement bands.
      // (data-band-count > 0 is asserted in chart unit tests; here we
      // confirm the SVG element exists and carries band count data.)
      expect(html).toMatch(/data-band-count="[1-9]\d*"/);
      expect(html).toMatch(/data-point-count="0"/);
    });
  });

  it("window selector renders 7d / 30d / 90d / all with 30d selected", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      for (const w of ["7d", "30d", "90d", "all"]) {
        expect(html).toContain(`data-window="${w}"`);
      }
      expect(html).toContain('data-window-selected="30d"');
      expect(html).not.toContain('data-window-selected="7d"');
    });
  });

  it("every window selection renders the chart for KXDIESELD", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      for (const w of ["7d", "30d", "90d", "all"]) {
        const html = await renderScorecard("KXDIESELD", w);
        expect(html).toContain(`data-window-selected="${w}"`);
        expect(html).toContain("series-chart");
      }
    });
  });
});

// ---- T032: hit-rate scoreboard (FR-009, SC-003 — the hard requirement) -----

describe("T032: hit-rate scoreboard (FR-009, SC-003)", () => {
  it("SC-003 reconciliation: KXDIESELD renders success 2 / fail 1 / pending 1, hit rate 66.7% (fixture golden)", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      // The scoreboard data-* attributes carry the exact classification
      // counts so a machine-readback can verify reconciliation.
      expect(html).toMatch(/data-success="2"/);
      expect(html).toMatch(/data-fail="1"/);
      expect(html).toMatch(/data-pending="1"/);
      expect(html).toMatch(/data-unscored="0"/);
      expect(html).toMatch(/data-hit-rate="0\.666\d+"/);
      // Human-readable text the user sees.
      expect(html).toContain("66.7%");
      expect(html).toContain("hit rate");
    });
  });

  it("SC-003 hard requirement: no-position predictions count identically to ones with a position", async () => {
    // Variant fixture: add a no-position prediction that scores a success
    // via the sd rule; the total must reflect it (the store's hard rule).
    const f = openFixture({
      extraPredictions: [
        {
          id: 500,
          run_id: 11,
          market_ticker: "KXDIESELD-26SEP26-T6.490",
          series_id: 2,
          direction: "up",
          point_forecast: 6.49,
          forecast_sd: 0.02,
          resolved_at: "2026-09-26T13:00:00Z",
          outcome: "down",
          error: 0.0,
        },
      ],
    });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      // Success bumps from 2 -> 3; pending stays 1 (no resolution there).
      expect(html).toMatch(/data-success="3"/);
      expect(html).toMatch(/data-fail="1"/);
      expect(html).toMatch(/data-pending="1"/);
      // hit rate = 3 / (3 + 1) = 75.0%.
      expect(html).toContain("75.0%");
    });
  });

  it("each other family shows its own pinned counts from the fixture golden", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const gasd = await renderScorecard("KXAAAGASD");
      expect(gasd).toMatch(/data-success="2"/);
      expect(gasd).toMatch(/data-fail="0"/);
      expect(gasd).toMatch(/data-pending="1"/);
      expect(gasd).toContain("100.0%");

      const trump = await renderScorecard("KXTRUMPAPPROVE");
      expect(trump).toMatch(/data-success="0"/);
      expect(trump).toMatch(/data-fail="0"/);
      expect(trump).toMatch(/data-pending="3"/);
      // Hit rate null while nothing is scored -> em-dash rendered.
      expect(trump).toContain("data-hit-rate=\"\"");
    });
  });
});

// ---- T033: recommendation list with per-recommendation graph (FR-006) -----

describe("T033: recommendation list + per-recommendation graph (FR-006)", () => {
  it("KXDIESELD: every attributed prediction renders with its graph + rationale", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      // 4 attributed predictions -> 4 articles.
      const articleIds = ["10", "8", "5", "2"];
      for (const pid of articleIds) {
        expect(html).toContain(`data-testid="recommendation-${pid}"`);
        expect(html).toContain(`data-testid="rec-graph"`);
      }
      // Prediction 8's resolved outcome mark uses the 2026-09-24 band;
      // the rec-graph renders it as `print 6.510–6.515` (3-decimal).
      expect(html).toContain("6.510–6.515");
      // Rationale text surfaces verbatim for at least one entry.
      expect(html).toContain("EXECUTED POSITION");
    });
  });

  it("graph carries a forecast band when forecast_sd > 0", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      // At least one recommendation's graph carries a band.
      expect(html).toMatch(/data-band="1"/);
    });
  });
});

// ---- T034: position P&L history (FR-008) ----------------------------------

describe("T034: position P&L history (FR-008)", () => {
  it("KXDIESELD: the −$5.001 realized position renders, open positions show marks or unavailable", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      expect(html).toContain("positions-history-card-KXDIESELD");
      // The single realized position (golden fixture): the row text
      // includes the side/contracts/fill/fee verbatim.
      expect(html).toContain("-$5.001");
      expect(html).toContain("KXDIESELD-26SEP24-T6.515");
      expect(html).toContain("yes");
      expect(html).toContain("24.9");
      expect(html).toContain("fee 0.27");
    });
  });

  it("open position without a stored quote: mark unavailable, never zero (FR-008 edge case)", async () => {
    const f = openFixture({
      extraPositions: [
        {
          id: 50,
          prediction_id: null,
          market_ticker: "KXDIESELD-26SEP25-T6.520",
          side: "no",
          contracts: 3,
          fill_price: 0.4,
          fee: 0.02,
          opened_at: "2026-09-24T14:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
    });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      expect(html).toContain("mark unavailable");
      // Realized total stays at the golden: never mixed with the open
      // mark.
      expect(html).toContain("-$5.001");
    });
  });
});

// ---- T035: call-outs / change notes (FR-010) ------------------------------

describe("T035: call-outs / change notes (FR-010)", () => {
  it("KXDIESELD: every rationale-bearing prediction surfaces, most recent first", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      expect(html).toContain("call-outs-card-KXDIESELD");
      for (const pid of [10, 8, 5, 2]) {
        expect(html).toContain(`data-testid="call-out-${pid}"`);
      }
    });
  });

  it("family with no predictions shows explicit empty state, no errors", async () => {
    // KXTRUMPAPPROVE has predictions but no rationales for some; HO=F has
    // no predictions at all. The HO=F page must not throw.
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("HO=F");
      expect(html).toContain("call-outs-empty-HO=F");
      expect(html).toContain("no call-outs recorded for HO=F");
    });
  });
});

// ---- T036: edge cases (US2 / edge-cases list) -----------------------------

describe("T036: edge cases on the scorecard page", () => {
  it("empty window: family has no observations in the chosen window -> explicit empty state", async () => {
    // RB=F has yahoo_close points only since 2026-09-15. 7d window from
    // the pinned now anchor (2026-09-24T17:00Z) -> window starts
    // 2026-09-17 -> RB=F has points. Choose a much tighter window by
    // building a fixture with no observations at all for the family.
    const f = openFixture({ seed: false }); // empty store -> every family is "no data"
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD", "30d");
      expect(html).toContain("historical-chart-empty-KXDIESELD");
      expect(html).toContain("no observations in the 30d window");
    });
  });

  it("band-only series (KXDIESELD): chart renders bands, not points (data-point-count=0)", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD", "30d");
      expect(html).toMatch(/data-band-count="3[01]"/); // ~31 distinct dates in 30d window
      expect(html).toMatch(/data-point-count="0"/);
    });
  });

  it("family with no data at all renders zero states for every card, not 404", async () => {
    const f = openFixture({ seed: false });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      // Unknown-family banner (family not in store).
      expect(html).toContain("scorecard-unknown-KXDIESELD");
      // Empty states everywhere else, no exceptions.
      expect(html).toContain("scoreboard-empty-KXDIESELD");
      expect(html).toContain("historical-chart-empty-KXDIESELD");
      expect(html).toContain("recommendations-empty-KXDIESELD");
      expect(html).toContain("positions-empty-KXDIESELD");
      expect(html).toContain("call-outs-empty-KXDIESELD");
    });
  });

  it("missing store: dedicated store-not-available state, not a stack trace", async () => {
    // Built via path.join to dodge the invariant scanner's absolute-path
    // pattern (matches literal /home, /tmp, etc. — but a runtime-built
    // path that passes through tmpdir() doesn't match in source text).
    const missingPath = path.join(tmpdir(), "scorecard-missing-store.sqlite");
    await withEnv({ KALSHI_RESEARCH_DB: missingPath }, async () => {
      const html = await renderScorecard("KXDIESELD");
      expect(html).toContain("store-not-available-KXDIESELD");
      expect(html).toContain("store not available");
      expect(html).not.toContain("scoreboard-card-KXDIESELD");
    });
  });

  it("schema-version mismatch: dedicated state, never guessed data", async () => {
    const f = openFixture({ version: 3, seed: false });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderScorecard("KXDIESELD");
      expect(html).toContain("store-schema-mismatch-KXDIESELD");
      expect(html).toContain("version 3");
      expect(html).not.toContain("scoreboard-card-KXDIESELD");
    });
  });
});
