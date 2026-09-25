import { afterAll, describe, expect, it } from "vitest";

import { buildStoreFixture, type FixtureOptions, type StoreFixture } from "@/tests/fixtures/store-fixture";
import { openStore } from "@/lib/store/open";
import { getScoreboard } from "@/lib/store/hitrate";

/**
 * T015: getScoreboard golden tests (FR-009, D2 — the hard requirement).
 * The pinned classification (data-model.md, first match wins):
 *   1. resolved_at IS NULL OR outcome IS NULL            -> pending
 *   2. point_forecast NOT NULL AND forecast_sd > 0       -> success iff |error| <= forecast_sd
 *   3. outcome IN ('yes','no')                           -> success iff outcome == direction
 *   4. otherwise                                         -> unscored
 * Family attribution: longest series.family that is a prefix of market_ticker,
 * fallback series_id's family, else unattributed. Position linkage NEVER
 * affects scoring.
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

describe("getScoreboard (T015, FR-009 / D2)", () => {
  it("golden fixture A: the pinned per-family numbers", async () => {
    const store = openFixture();
    try {
      const board = await getScoreboard(store);

      const byFamily = new Map(board.families.map((f) => [f.family, f]));
      expect(board.families).toHaveLength(6); // every tracked family appears

      const diesel = byFamily.get("KXDIESELD");
      expect(diesel).toMatchObject({
        family: "KXDIESELD",
        success: 2,
        fail: 1,
        pending: 1,
        unscored: 0,
      });
      expect(diesel?.hitRate).toBeCloseTo(2 / 3, 9); // 66.7%

      const gasd = byFamily.get("KXAAAGASD");
      expect(gasd).toMatchObject({ success: 2, fail: 0, pending: 1, unscored: 0 });
      expect(gasd?.hitRate).toBe(1); // 100%

      expect(byFamily.get("KXAAAGASM")).toMatchObject({
        success: 0,
        fail: 0,
        pending: 2,
        unscored: 0,
        hitRate: null, // no scored prediction -> no hit rate displayed
      });

      expect(byFamily.get("KXTRUMPAPPROVE")).toMatchObject({
        success: 0,
        fail: 0,
        pending: 3,
        unscored: 0,
        hitRate: null,
      });

      // Families with zero predictions: hitRate null (never NaN).
      expect(byFamily.get("HO=F")).toMatchObject({
        family: "HO=F",
        success: 0,
        fail: 0,
        pending: 0,
        unscored: 0,
        hitRate: null,
      });
      expect(byFamily.get("RB=F")).toMatchObject({ success: 0, fail: 0, hitRate: null });

      expect(board.unattributed).toEqual({ success: 0, fail: 0, pending: 0, unscored: 0 });
    } finally {
      store.close();
    }
  });

  it("no-position predictions score identically to one with a position (the hard requirement)", async () => {
    const store = openFixture();
    try {
      const board = await getScoreboard(store);
      const byFamily = new Map(board.families.map((f) => [f.family, f]));
      // KXDIESELD: prediction 5 has position_id 1; predictions 2/8/10 have none.
      // The counts are identical to what positionless scoring would give.
      expect(byFamily.get("KXDIESELD")).toMatchObject({ success: 2, fail: 1, pending: 1 });
    } finally {
      store.close();
    }
  });

  it("longest-prefix attribution wins over the linked series' family (KXAAAGASM trap)", async () => {
    const store = openFixture();
    try {
      const board = await getScoreboard(store);
      const byFamily = new Map(board.families.map((f) => [f.family, f]));
      // Prediction 4 carries market_ticker KXAAAGASM-26SEP30-4.50 but
      // series_id 3 (HO=F): it must count for KXAAAGASM, not HO=F.
      expect(byFamily.get("KXAAAGASM")?.pending).toBe(2);
      expect(byFamily.get("HO=F")).toMatchObject({ success: 0, fail: 0, pending: 0 });
    } finally {
      store.close();
    }
  });

  it("resolved up/down print direction WITHOUT a point forecast is unscored, not dropped", async () => {
    const store = openFixture({
      extraPredictions: [
        {
          id: 100,
          run_id: 1,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          series_id: 2,
          direction: "up",
          point_forecast: null,
          forecast_sd: null,
          resolved_at: "2026-09-24T15:00:00Z",
          outcome: "down",
          error: null,
        },
      ],
    });
    try {
      const board = await getScoreboard(store);
      const diesel = board.families.find((f) => f.family === "KXDIESELD");
      expect(diesel).toMatchObject({ success: 2, fail: 1, pending: 1, unscored: 1 });
      expect(diesel?.hitRate).toBeCloseTo(2 / 3, 9); // unscored never dilutes the rate
    } finally {
      store.close();
    }
  });

  it("market outcome (yes/no) scores outcome == direction, sd not applicable", async () => {
    const store = openFixture({
      extraPredictions: [
        {
          id: 101,
          run_id: 1,
          market_ticker: "KXTRUMPAPPROVE-26SEP24-U38.7",
          series_id: 5,
          direction: "no",
          point_forecast: null,
          forecast_sd: null,
          resolved_at: "2026-09-24T16:00:00Z",
          outcome: "no",
          error: null,
        },
        {
          id: 102,
          run_id: 1,
          market_ticker: "KXTRUMPAPPROVE-26SEP24-U38.7",
          series_id: 5,
          direction: "no",
          point_forecast: null,
          forecast_sd: null,
          resolved_at: "2026-09-24T16:00:00Z",
          outcome: "yes",
          error: null,
        },
      ],
    });
    try {
      const board = await getScoreboard(store);
      const trump = board.families.find((f) => f.family === "KXTRUMPAPPROVE");
      expect(trump).toMatchObject({ success: 1, fail: 1, pending: 3, unscored: 0 });
      expect(trump?.hitRate).toBeCloseTo(0.5, 9);
    } finally {
      store.close();
    }
  });

  it("family filter returns a single-family board plus unattributed", async () => {
    const store = openFixture();
    try {
      const board = await getScoreboard(store, "KXDIESELD");
      expect(board.families).toHaveLength(1);
      expect(board.families[0]).toMatchObject({
        family: "KXDIESELD",
        success: 2,
        fail: 1,
        pending: 1,
      });
      expect(board.unattributed).toEqual({ success: 0, fail: 0, pending: 0, unscored: 0 });
    } finally {
      store.close();
    }
  });

  it("unattributed: a prediction matching no family prefix and no series counts on its own line", async () => {
    const store = openFixture({
      extraPredictions: [
        {
          id: 103,
          run_id: 1,
          market_ticker: "KXUNKNOWN-26SEP30-7.00",
          series_id: null,
          direction: "yes",
          resolved_at: "2026-09-24T16:00:00Z",
          outcome: "yes",
          error: null,
        },
      ],
    });
    try {
      const board = await getScoreboard(store);
      expect(board.unattributed).toEqual({ success: 1, fail: 0, pending: 0, unscored: 0 });
      expect(board.families.map((f) => f.family)).not.toContain("KXUNKNOWN");
    } finally {
      store.close();
    }
  });

  it("empty store: zero families, zero unattributed (SC-005)", async () => {
    const store = openFixture({ seed: false });
    try {
      const board = await getScoreboard(store);
      expect(board.families).toEqual([]);
      expect(board.unattributed).toEqual({ success: 0, fail: 0, pending: 0, unscored: 0 });
    } finally {
      store.close();
    }
  });

  it("sd-rule boundary: |error| == forecast_sd scores success (<=, not <)", async () => {
    const store = openFixture({
      extraPredictions: [
        {
          id: 104,
          run_id: 1,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          series_id: 2,
          direction: "up",
          point_forecast: 6.5,
          forecast_sd: 0.05,
          resolved_at: "2026-09-24T15:00:00Z",
          outcome: "down",
          error: 0.05,
        },
      ],
    });
    try {
      const board = await getScoreboard(store);
      const diesel = board.families.find((f) => f.family === "KXDIESELD");
      expect(diesel).toMatchObject({ success: 3, fail: 1 });
    } finally {
      store.close();
    }
  });
});