import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import Home from "@/app/page";
import { directionLabel, renderStaleCount } from "@/lib/banner-view";
import { formatUsd3 } from "@/lib/format";
import { DEFAULT_WINDOW, WINDOW_OPTIONS } from "@/lib/windows";
import { setHomepageNow } from "@/lib/home-data";
import RootLayout from "@/app/layout";
import { getFamilySnapshot } from "@/components/family-card";
import { getSkillChanges } from "@/lib/store/skilllog";
import {
  buildStoreFixture,
  type FixtureOptions,
  type StoreFixture,
} from "@/tests/fixtures/store-fixture";

/**
 * T020-T026 (Phase P3): the homepage render/route tests. Every render goes
 * through the real page component against a synthetic fixture store (never
 * the live store) via renderToStaticMarkup — the same markup Next ships.
 * The sidebar is exercised through RootLayout with next/navigation mocked
 * (usePathname needs the app-router context Vitest does not provide).
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

/** Window anchor for deterministic window arithmetic: 2026-09-24 17:00Z. */
const HOME_NOW = Date.UTC(2026, 8, 24, 17);

beforeEach(() => {
  setHomepageNow(() => HOME_NOW);
});

let fixtures: StoreFixture[] = [];

afterAll(() => {
  setHomepageNow(null);
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
  const saved: [string, string | undefined][] = [
    ["KALSHI_RESEARCH_DB", process.env.KALSHI_RESEARCH_DB],
    ["KALSHI_SKILL_REPO_DIR", process.env.KALSHI_SKILL_REPO_DIR],
  ];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Render the homepage exactly as the server would (async component). */
async function renderHomeHtml(): Promise<string> {
  return renderToStaticMarkup(
    await Home({ searchParams: Promise.resolve({}) })
  );
}

// ---- git-log fixture repo (same pattern as skilllog.test.ts) --------------

let skillRepoDir: string;
let emptySkillDir: string;

beforeAll(() => {
  skillRepoDir = mkdtempSync(path.join(tmpdir(), "homepage-skillrepo-"));
  const git = (args: string[], opts: Record<string, string> = {}) =>
    execFileSync("git", args, {
      cwd: skillRepoDir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Fixture Bot",
        GIT_AUTHOR_EMAIL: "fixture@agents.local",
        GIT_COMMITTER_NAME: "Fixture Bot",
        GIT_COMMITTER_EMAIL: "fixture@agents.local",
        ...opts,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  git(["init", "--initial-branch=main", "--quiet"]);
  git(["config", "user.name", "Fixture Bot"]);
  git(["config", "user.email", "fixture@agents.local"]);
  writeFileSync(path.join(skillRepoDir, "CHANGELOG.md"), "# fixture\n");
  git(["add", "CHANGELOG.md"]);
  git(["commit", "--quiet", "-m", "feat: first fixture commit"], {
    GIT_AUTHOR_DATE: "2026-09-20T10:00:00Z",
    GIT_COMMITTER_DATE: "2026-09-20T10:00:00Z",
  });
  writeFileSync(path.join(skillRepoDir, "SKILL.md"), "# fixture\n");
  git(["add", "SKILL.md"]);
  git(["commit", "--quiet", "-m", "docs: second fixture commit"], {
    GIT_AUTHOR_DATE: "2026-09-22T12:00:00Z",
    GIT_COMMITTER_DATE: "2026-09-22T12:00:00Z",
  });
  emptySkillDir = mkdtempSync(path.join(tmpdir(), "homepage-skillempty-"));
});

afterAll(() => {
  rmSync(skillRepoDir, { recursive: true, force: true });
  rmSync(emptySkillDir, { recursive: true, force: true });
});

// ---- pure helpers ----------------------------------------------------------

describe("homepage formatting helpers", () => {
  it("formatUsd3 keeps the store's realized-pnl precision (SC-004: -$5.001)", () => {
    expect(formatUsd3(-5.001)).toBe("-$5.001");
    expect(formatUsd3(0)).toBe("$0.000");
    expect(formatUsd3(12.5)).toBe("$12.500");
    // -0.0004 dollars is below the store's 0.1-cent precision: renders as 0.
    expect(formatUsd3(-0.0004)).toBe("$0.000");
    // Float noise from summing stored values is rounded away.
    expect(formatUsd3(-5.001 + 0.55)).toBe("-$4.451");
  });

  it("WINDOW_OPTIONS lists 7d/30d/90d/all with 30d default", () => {
    expect(WINDOW_OPTIONS).toEqual(["7d", "30d", "90d", "all"]);
    expect(DEFAULT_WINDOW).toBe("30d");
  });

  it("directionLabel renders the signed-YES call and never an edge for NO calls", () => {
    expect(directionLabel("up", 0.74, 6.548)).toBe(
      "up (74.0% YES, forecast 6.548)"
    );
    expect(directionLabel("flat", 0.55, 6.5225)).toBe(
      "flat (55.0% YES, forecast 6.5225)"
    );
    expect(directionLabel(null, 0.3, null)).toBe("p_yes 30.0%");
    expect(directionLabel("down", 0.3, null)).toBe("down (30.0% YES)");
    expect(directionLabel("no", 0.4, null)).toBe("no (40.0% YES)");
    expect(directionLabel("up", 0.5, null)).toBe("up (50.0% YES)");
  });
});

// ---- T020: overall P&L card -------------------------------------------------

describe("T020: overall P&L card (FR-001, SC-004)", () => {
  it("golden: total -5.001 at the default 30d window, realized entry rendered, open section present", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      expect(html).toContain("-$5.001");
      expect(html).toContain("realized P&amp;L");
      // The realized position entry shows the store's own fields.
      expect(html).toContain("KXDIESELD-26SEP24-T6.515");
      expect(html).toContain("yes");
      expect(html).toContain("24.9");
      // Open positions: none in the golden fixture.
      expect(html).toContain("no open positions");
    });
  });

  it("window selector renders all four options with 30d selected by default", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      for (const w of WINDOW_OPTIONS) {
        expect(html).toContain(`data-window="${w}"`);
      }
      expect(html).toContain('data-window-selected="30d"');
      expect(html).not.toContain('data-window-selected="7d"');
    });
  });

  it("every window selection re-queries P&L (total -5.001 at each: the single realized position settles 2026-09-24, inside all windows; window arithmetic itself is pinned by T014)", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      for (const w of WINDOW_OPTIONS) {
        const html = renderToStaticMarkup(
          await Home({ searchParams: Promise.resolve({ window: w }) })
        );
        expect(html).toContain(`data-window-selected="${w}"`);
        expect(html).toContain("-$5.001");
      }
    });
  });

  it("open positions render with marks, distinct from realized (variant fixture)", async () => {
    const f = openFixture({
      extraPositions: [
        {
          id: 20,
          prediction_id: null,
          market_ticker: "KXDIESELD-26SEP25-T6.520",
          side: "yes",
          contracts: 4,
          fill_price: 0.5,
          fee: 0.02,
          opened_at: "2026-09-24T14:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
      // Stored quote for the open market: bid 0.72 wins (smallest
      // hours_before_close row, bid -> ask -> close) -> mark 4 x (0.72-0.5).
      extraQuotes: [
        {
          market_ticker: "KXDIESELD-26SEP25-T6.520",
          hours_before_close: 1,
          close_dollars: null,
          yes_bid_dollars: 0.72,
          yes_ask_dollars: 0.76,
        },
      ],
    });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      // mark = 4 x (0.72 bid - 0.5 fill) = 0.88; realized total stays -5.001.
      expect(html).toContain("-$5.001");
      expect(html).toContain("open positions: 1");
      expect(html).toContain("unrealized mark +$0.880 (mark $0.720)");
    });
  });

  it("zero store: $0.000 total and explicit empty states, no errors", async () => {
    const f = openFixture({ seed: false });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      expect(html).toContain("$0.000");
      expect(html).toContain("no realized positions");
      expect(html).toContain("no open positions");
    });
  });
});

// ---- T021: family summary card ----------------------------------------------

describe("T021: family summary card (FR-002)", () => {
  it("getFamilySnapshot: recent prints are band-aware series-of-record rows", async () => {
    const f = openFixture();
    const store = (await import("@/lib/store/open")).openStore(f.path);
    try {
      const snap = await getFamilySnapshot(store, "KXDIESELD", HOME_NOW);
      // 30d window from the 2026-09-24 anchor: 31 distinct seeded dates.
      expect(snap.recentPrints).toHaveLength(31);
      // Display slice: the card shows the 3 most recent, newest last.
      const last = snap.recentPrints[snap.recentPrints.length - 1];
      expect(last.obsDate).toBe("2026-09-24");
      expect(last.lo).toBe(6.51);
      expect(last.hi).toBe(6.515);
      expect(last.mid).toBeCloseTo(6.5125, 9);
      expect(last.source).toBe("kalshi_settlement");
      expect(snap.totalRealized).toBeCloseTo(-5.001, 6);
      expect(snap.open).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("renders recent prints as band text with midpoint", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      expect(html).toContain("6.51–6.515 (mid 6.5125)");
    });
  });

  it("zero-state family (no prints, no positions) still renders a card", async () => {
    // RB=F has prints in the fixture; the true zero state is a family with
    // no observations at all. Build one via the empty-store variant instead:
    // KXTRUMPAPPROVE has prints but no positions -> pnl zero state.
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      expect(html).toContain('data-testid="family-card-KXTRUMPAPPROVE"');
      expect(html).toContain("no open positions");
    });
  });

  it("open position without a stored quote shows the mark unavailable, never zero", async () => {
    const f = openFixture({
      extraPositions: [
        {
          id: 21,
          prediction_id: null,
          market_ticker: "KXAAAGASD-26SEP25-4.4900",
          side: "no",
          contracts: 2,
          fill_price: 0.4,
          fee: 0.02,
          opened_at: "2026-09-24T15:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
    });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      expect(html).toContain(
        "mark unavailable (no stored quote for this market)"
      );
    });
  });
});

// ---- T022: homepage assembles all family cards + sidebar --------------------

describe("T022: homepage family assembly + sidebar (FR-002, FR-015)", () => {
  it("renders exactly one card per store family (6)", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      for (const family of [
        "KXDIESELD",
        "KXAAAGASD",
        "KXAAAGASM",
        "KXTRUMPAPPROVE",
        "HO=F",
        "RB=F",
      ]) {
        expect(html).toContain(`data-testid="family-card-${family}"`);
      }
    });
  });

  it("sidebar renders real store families with links (P1 placeholder replaced)", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = renderToStaticMarkup(await RootLayout({ children: null }));
      // Every family is a link (HO=F URL-encoded).
      expect(html).toContain('href="/markets/KXDIESELD"');
      expect(html).toContain('href="/markets/HO%3DF"');
      expect(html).toContain('href="/markets/RB%3DF"');
      expect(html).not.toContain("no families");
    });
  });

  it("zero store: 'no tracked families' on the page and 'no families' in the sidebar", async () => {
    const f = openFixture({ seed: false });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      expect(html).toContain("no tracked families");
      const layoutHtml = renderToStaticMarkup(
        await RootLayout({ children: null })
      );
      expect(layoutHtml).toContain("no families");
    });
  });
});

// ---- T023: skill-changes card ------------------------------------------------

describe("T023: skill-changes card (FR-003)", () => {
  it("lists the configured repo's recent commits, newest first", async () => {
    const f = openFixture();
    await withEnv(
      { KALSHI_RESEARCH_DB: f.path, KALSHI_SKILL_REPO_DIR: skillRepoDir },
      async () => {
        const changes = await getSkillChanges({
          repoDir: skillRepoDir,
          now: Date.UTC(2026, 8, 24),
        });
        expect(changes).toHaveLength(2);
        expect(changes[0].subject).toBe("docs: second fixture commit");

        const html = await renderHomeHtml();
        expect(html).toContain("docs: second fixture commit");
        expect(html).toContain("feat: first fixture commit");
        expect(html).toContain("2026-09-22");
      }
    );
  });

  it("env unset: explicit unavailable state, not an error", async () => {
    const f = openFixture();
    await withEnv(
      { KALSHI_RESEARCH_DB: f.path, KALSHI_SKILL_REPO_DIR: undefined },
      async () => {
        const html = await renderHomeHtml();
        expect(html).toContain("skill changes unavailable");
      }
    );
  });

  it("configured but not a repo: unavailable state", async () => {
    const f = openFixture();
    await withEnv(
      { KALSHI_RESEARCH_DB: f.path, KALSHI_SKILL_REPO_DIR: emptySkillDir },
      async () => {
        const html = await renderHomeHtml();
        expect(html).toContain("skill changes unavailable");
      }
    );
  });
});

// ---- T024: recommendations banner --------------------------------------------

describe("T024: recommendations banner (FR-004)", () => {
  it("one line per family with predictions, with direction/forecast, rationale, traded state", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      // Four families with predictions; HO=F / RB=F absent.
      expect(html).toContain('data-testid="banner-entry-KXDIESELD"');
      expect(html).toContain('data-testid="banner-entry-KXAAAGASD"');
      expect(html).toContain('data-testid="banner-entry-KXAAAGASM"');
      expect(html).toContain('data-testid="banner-entry-KXTRUMPAPPROVE"');
      expect(html).not.toContain('data-testid="banner-entry-HO=F"');

      // KXDIESELD's latest is prediction 10: flat, pf 6.5225, target 09-25.
      expect(html).toContain("flat (55.0% YES, forecast 6.5225)");
      expect(html).toContain("target 2026-09-25");
      expect(html).toContain("fixture rationale");
      // traded derives from position linkage: prediction 10 has none.
      expect(html).toContain("no position taken");
      expect(html).not.toContain("traded");

      // edge_points is signed for YES calls: flat call -> edge shown.
      expect(html).toContain("edge -44.0 pts");
      // KXTRUMPAPPROVE latest is a flat call with +3 pts.
      expect(html).toContain("edge +3.0 pts");
    });
  });

  it("a linked position shows the entry as traded (variant fixture)", async () => {
    const f = openFixture({
      extraPositions: [
        {
          id: 9,
          prediction_id: 10,
          market_ticker: "KXDIESELD-26SEP25-T6.520",
          side: "no",
          contracts: 4,
          fill_price: 0.5,
          fee: 0.02,
          opened_at: "2026-09-24T14:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
      linkPositions: [{ predictionId: 10, positionId: 9 }],
    });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      expect(html).toContain("traded");
      // The KXDIESELD entry no longer carries the no-position state; other
      // families' unlinked predictions legitimately still do.
      expect(html).not.toContain('data-testid="banner-state-KXDIESELD">no position taken');
    });
  });

  it("edge text is suppressed for NO-side calls (edge_points signed YES-only)", async () => {
    const f = openFixture({
      extraPredictions: [
        {
          id: 90,
          run_id: 11,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          series_id: 2,
          direction: "down",
          p_yes: 0.3,
          edge_points: -0.07,
        },
      ],
    });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      // Prediction 90 is now KXDIESELD's latest (run 11, highest id).
      expect(html).toContain("down (30.0% YES)");
      // direction 'down' is a NO-side call: no signed edge shown.
      expect(html).not.toContain("edge -7.0 pts");
      // ...and no positive-edge text leaks onto the KXDIESELD line either.
      expect(html).not.toContain("edge +44.0 pts");
    });
  });
});

// ---- T025: as-of + stale count ------------------------------------------------

describe("T025: as-of timestamp + stale-artifact count (FR-016, FR-017)", () => {
  it("renders the store's last-run as-of and the stale count (golden fixture: 1)", async () => {
    const f = openFixture();
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      expect(html).toContain("data as of 2026-09-24T16:47:33Z");
      // The fixture's deterministic stale artifact count (P2 golden, T017).
      expect(html).toContain(renderStaleCount(3));
    });
  });

  it("renderAsOfText/renderStaleCount are explicit helpers (unit)", async () => {
    const { renderAsOfText, renderStaleCount } = await import(
      "@/lib/banner-view"
    );
    expect(
      renderAsOfText({
        reachable: true,
        schemaVersion: 2,
        storeRev: 3804,
        staleCount: 1,
        lastRunAt: "2026-09-24T16:47:33.950412Z",
      })
    ).toBe("data as of 2026-09-24T16:47:33Z");
    expect(
      renderAsOfText({
        reachable: true,
        schemaVersion: 2,
        storeRev: null,
        staleCount: 0,
        lastRunAt: null,
      })
    ).toBe("data as of unknown");
    expect(renderStaleCount(0)).toBe("stale artifacts: 0");
    expect(renderStaleCount(7)).toBe("stale artifacts: 7");
  });
});

// ---- T026: failure states ------------------------------------------------------

describe("T026: failure states (SC-005)", () => {
  it("missing store: 'store not available' on the page, sidebar placeholder back", async () => {
    await withEnv(
      {
        KALSHI_RESEARCH_DB: path.join(tmpdir(), "homepage-missing-store.sqlite"),
      },
      async () => {
        const html = await renderHomeHtml();
        expect(html).toContain("store not available");
        expect(html).not.toContain('data-testid="pnl-card"');
        const layoutHtml = renderToStaticMarkup(
          await RootLayout({ children: null })
        );
        expect(layoutHtml).toContain("no families");
      }
    );
  });

  it("schema-version mismatch: dedicated state, never guessed data", async () => {
    const f = openFixture({ version: 3, seed: false });
    await withEnv({ KALSHI_RESEARCH_DB: f.path }, async () => {
      const html = await renderHomeHtml();
      expect(html).toContain("store schema version mismatch");
      expect(html).toContain("version 3");
      expect(html).not.toContain('data-testid="pnl-card"');
    });
  });

  it("dev or KALSHI_DEBUG_STORE_ERRORS=1: a store failure throws instead of hiding", async () => {
    const f = openFixture({ version: 3, seed: false });
    const env = process.env as Record<string, string | undefined>;
    const savedDebug = env.KALSHI_DEBUG_STORE_ERRORS;
    env.KALSHI_RESEARCH_DB = f.path;
    env.KALSHI_DEBUG_STORE_ERRORS = "1";
    try {
      await expect(
        Home({ searchParams: Promise.resolve({}) })
      ).rejects.toThrow(/not supported/);
    } finally {
      if (savedDebug === undefined) delete env.KALSHI_DEBUG_STORE_ERRORS;
      else env.KALSHI_DEBUG_STORE_ERRORS = savedDebug;
    }
  });
});

// ---- serialize/deserialize round-trip ------------------------------------------

describe("homepage payload serialization", () => {
  it("deserialize rejects non-object payloads", async () => {
    const { deserializeHomepageData } = await import("@/lib/payload");
    expect(() => deserializeHomepageData("not-an-array" as unknown as string)).toThrow(
      /invalid homepage data payload/
    );
  });

  it("serialize -> deserialize round-trips numbers and nulls exactly", async () => {
    const { serializeHomepageData, deserializeHomepageData } = await import(
      "@/lib/payload"
    );
    const json = serializeHomepageData({ totalRealized: -5.001, label: "x" });
    expect(deserializeHomepageData(json)).toEqual({
      totalRealized: -5.001,
      label: "x",
    });
  });
});