import { afterAll, describe, expect, it } from "vitest";

import { buildStoreFixture, type FixtureOptions, type StoreFixture } from "@/tests/fixtures/store-fixture";
import { openStore } from "@/lib/store/open";
import { getFamilyPnl, getPnl } from "@/lib/store/pnl";

/**
 * T014: getPnl / getFamilyPnl golden tests (FR-001, FR-008, D4) per
 * contracts/data-layer.md and data-model.md PnlView:
 *   - realized: positions WHERE settled_at IS NOT NULL AND settled_at >=
 *     window start ('all' = no filter); total = SUM(realized_pnl)
 *   - open: settled_at IS NULL, window-independent; mark = contracts x
 *     (mark_price - fill) for yes, contracts x ((1 - quote) - fill) for no;
 *     mark unavailable (never zero) without a stored quote
 *   - golden (fixture A, 'all'): realized = [diesel position, -5.001],
 *     total -5.001, open []
 */

let fixtures: StoreFixture[] = [];

afterAll(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function openFixture(options?: FixtureOptions) {
  const f = buildStoreFixture(options);
  fixtures.push(f);
  return openStore(f.path);
}

/** Fixture "now" anchor: 2026-09-24T18:00:00Z (after the 15:47 settlement). */
const NOW = Date.UTC(2026, 8, 24, 18, 0, 0);

describe("getPnl (T014, FR-001 / FR-008 / D4)", () => {
  it("golden 'all': one realized position, total -5.001, no open positions", async () => {
    const store = openFixture();
    try {
      const pnl = await getPnl(store, "all", { now: NOW });
      expect(pnl.realized).toHaveLength(1);
      expect(pnl.realized[0]).toMatchObject({
        marketTicker: "KXDIESELD-26SEP24-T6.515",
        side: "yes",
        contracts: 24.9,
        fillPrice: 0.19,
        fee: 0.27,
        realizedPnl: -5.001,
      });
      expect(pnl.totalRealized).toBeCloseTo(-5.001, 10);
      expect(pnl.open).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("open position with a stored quote marks contracts x (quote - fill) for yes", async () => {
    const store = openFixture({
      extraPositions: [
        {
          id: 2,
          prediction_id: null,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          side: "yes",
          contracts: 10,
          fill_price: 0.4,
          fee: 0.05,
          opened_at: "2026-09-24T10:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
    });
    try {
      const pnl = await getPnl(store, "all", { now: NOW });
      expect(pnl.open).toHaveLength(1);
      // Latest stored quote for the market: hours_before_close 0.9833 row,
      // bid 0.72 preferred -> mark = 10 x (0.72 - 0.40) = 3.20.
      const open = pnl.open[0];
      expect(open.side).toBe("yes");
      expect(open.mark).not.toBeNull();
      expect(open.mark).toBeCloseTo(3.2, 10);
      expect(open.markQuote).toBe(0.72);
      expect(open.markNote).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it("open no-side position marks contracts x ((1 - quote) - fill)", async () => {
    const store = openFixture({
      extraPositions: [
        {
          id: 2,
          prediction_id: null,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          side: "no",
          contracts: 10,
          fill_price: 0.3,
          fee: 0.04,
          opened_at: "2026-09-24T10:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
    });
    try {
      const pnl = await getPnl(store, "all", { now: NOW });
      const open = pnl.open[0];
      expect(open.side).toBe("no");
      // quote (yes side) 0.72 -> no price 0.28; mark = 10 x (0.28 - 0.30) = -0.20.
      expect(open.mark).not.toBeNull();
      expect(open.mark).toBeCloseTo(-0.2, 10);
      expect(open.markQuote).toBe(0.72);
    } finally {
      store.close();
    }
  });

  it("open position without a stored quote: mark unavailable, never zero", async () => {
    const store = openFixture({
      extraPositions: [
        {
          id: 2,
          prediction_id: null,
          market_ticker: "KXAAAGASM-26SEP30-4.50",
          side: "yes",
          contracts: 5,
          fill_price: 0.36,
          fee: 0.02,
          opened_at: "2026-09-24T10:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
    });
    try {
      const pnl = await getPnl(store, "all", { now: NOW });
      expect(pnl.open).toHaveLength(1);
      const open = pnl.open[0];
      expect(open.mark).toBeNull();
      expect(open.markQuote).toBeNull();
      expect(open.markNote).toBe("no stored quote for this market");
    } finally {
      store.close();
    }
  });

  it("quote row selection: smallest hours_before_close row first, then bid -> ask -> close", async () => {
    // KXDIESELD-26SEP24-T6.515 already has rows @ 10.9833 (bid 0.23) and
    // 0.9833 (bid 0.72). Add a newest row with bid null / ask null /
    // close 0.80: it must win the row pick, then fall back to its close.
    const store = openFixture({
      extraQuotes: [
        {
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          hours_before_close: 0.25,
          close_dollars: 0.8,
          yes_bid_dollars: null,
          yes_ask_dollars: null,
        },
      ],
      extraPositions: [
        {
          id: 2,
          prediction_id: null,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          side: "yes",
          contracts: 10,
          fill_price: 0.4,
          fee: 0.05,
          opened_at: "2026-09-24T10:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
    });
    try {
      const pnl = await getPnl(store, "all", { now: NOW });
      const open = pnl.open[0];
      expect(open.markQuote).toBe(0.8);
      expect(open.mark).toBeCloseTo(4.0, 10); // 10 x (0.80 - 0.40)
    } finally {
      store.close();
    }
  });

  it("windows filter realized by settled_at; open positions are window-independent", async () => {
    const store = openFixture({
      extraPositions: [
        // An old realized position: settled 2026-05-01 (outside every day window).
        {
          id: 2,
          prediction_id: null,
          market_ticker: "KXDIESELD-26SEP23-T6.515",
          side: "yes",
          contracts: 20,
          fill_price: 0.3,
          fee: 0.1,
          opened_at: "2026-05-01T10:00:00Z",
          settled_at: "2026-05-02T10:00:00Z",
          realized_pnl: 3.0,
        },
        // An open position: appears in every window.
        {
          id: 3,
          prediction_id: null,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          side: "yes",
          contracts: 10,
          fill_price: 0.4,
          fee: 0.05,
          opened_at: "2026-09-24T10:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
    });
    try {
      const all = await getPnl(store, "all", { now: NOW });
      expect(all.realized).toHaveLength(2);
      expect(all.totalRealized).toBeCloseTo(-5.001 + 3.0, 10);
      expect(all.open).toHaveLength(1);

      const d90 = await getPnl(store, "90d", { now: NOW });
      expect(d90.realized).toHaveLength(1);
      expect(d90.totalRealized).toBeCloseTo(-5.001, 10);
      expect(d90.open).toHaveLength(1); // open is window-independent

      const d30 = await getPnl(store, "30d", { now: NOW });
      expect(d30.realized).toHaveLength(1);
      expect(d30.totalRealized).toBeCloseTo(-5.001, 10);

      const d7 = await getPnl(store, "7d", { now: NOW });
      expect(d7.realized).toHaveLength(1);
      expect(d7.open).toHaveLength(1);

      // The contract's realized filter is settled_at >= window_start ONLY
      // (no upper bound): with an anchor earlier than a settlement, that
      // later-settled position still counts (the store is a snapshot; with
      // wall-clock now every settled_at is in the past, so the one-sided
      // filter is the live behaviour).
      const preSettlement = await getPnl(store, "30d", {
        now: Date.UTC(2026, 8, 1), // 2026-09-01: window start 08-02
      });
      expect(preSettlement.realized.map((r) => r.id)).toEqual([1]); // diesel only
      expect(preSettlement.totalRealized).toBeCloseTo(-5.001, 10);
      expect(preSettlement.open).toHaveLength(1); // open is window-independent
    } finally {
      store.close();
    }
  });

  it("empty store: zero states, no errors (SC-005)", async () => {
    const store = openFixture({ seed: false });
    try {
      const pnl = await getPnl(store, "30d", { now: NOW });
      expect(pnl).toEqual({ realized: [], totalRealized: 0, open: [] });
    } finally {
      store.close();
    }
  });
});

describe("getFamilyPnl (T014, FR-008)", () => {
  it("filters positions to the family's markets", async () => {
    const store = openFixture({
      extraPositions: [
        {
          id: 2,
          prediction_id: null,
          market_ticker: "KXAAAGASM-26SEP30-4.50",
          side: "yes",
          contracts: 5,
          fill_price: 0.36,
          fee: 0.02,
          opened_at: "2026-09-24T10:00:00Z",
          settled_at: null,
          realized_pnl: null,
        },
      ],
    });
    try {
      const diesel = await getFamilyPnl(store, "KXDIESELD", "all", { now: NOW });
      expect(diesel.realized).toHaveLength(1);
      expect(diesel.realized[0].marketTicker).toBe("KXDIESELD-26SEP24-T6.515");
      expect(diesel.open).toEqual([]);

      const gasm = await getFamilyPnl(store, "KXAAAGASM", "all", { now: NOW });
      expect(gasm.realized).toEqual([]);
      expect(gasm.totalRealized).toBe(0);
      expect(gasm.open).toHaveLength(1);
      expect(gasm.open[0].marketTicker).toBe("KXAAAGASM-26SEP30-4.50");
    } finally {
      store.close();
    }
  });
});