import { afterAll, describe, expect, it } from "vitest";

import { buildStoreFixture, type FixtureOptions, type StoreFixture } from "@/tests/fixtures/store-fixture";
import { openStore } from "@/lib/store/open";
import { getLatestRecommendations } from "@/lib/store/banner";

/**
 * T016: getLatestRecommendations golden tests (FR-004, D5). One entry per
 * family with ≥1 attributed prediction; latest = runs.started_at DESC then
 * predictions.id DESC; traded iff position_id NOT NULL.
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

describe("getLatestRecommendations (T016, FR-004 / D5)", () => {
  it("golden fixture A: one entry per family with predictions; KXDIESELD entry is prediction 10", async () => {
    const store = openFixture();
    try {
      const banner = await getLatestRecommendations(store);

      const byFamily = new Map(banner.map((e) => [e.family, e]));
      // 4 families with >=1 attributed prediction; HO=F / RB=F absent.
      expect(banner).toHaveLength(4);
      expect(byFamily.has("KXDIESELD")).toBe(true);
      expect(byFamily.has("KXAAAGASD")).toBe(true);
      expect(byFamily.has("KXAAAGASM")).toBe(true);
      expect(byFamily.has("KXTRUMPAPPROVE")).toBe(true);
      expect(byFamily.has("HO=F")).toBe(false);
      expect(byFamily.has("RB=F")).toBe(false);

      const diesel = byFamily.get("KXDIESELD");
      expect(diesel).toMatchObject({
        family: "KXDIESELD",
        predictionId: 10,
        direction: "flat",
        pYes: 0.55,
        pointForecast: 6.5225,
        targetDate: "2026-09-25",
        traded: false, // position_id NULL
      });
      expect(diesel?.predictionId).toBe(10);
      expect(diesel?.rationale ?? "").toContain("fixture rationale");
      expect(diesel?.run.startedAt).toBe("2026-09-24T13:00:12.610842Z");
      expect(diesel?.run.digestHashPrefix).toBe("afa7b2b2645be788".slice(0, 8));

      // The other families pick their run-11 / run-4 latest predictions.
      expect(byFamily.get("KXAAAGASD")?.predictionId).toBe(11);
      expect(byFamily.get("KXAAAGASM")?.predictionId).toBe(4);
      expect(byFamily.get("KXTRUMPAPPROVE")?.predictionId).toBe(12);
    } finally {
      store.close();
    }
  });

  it("traded flag comes from position linkage, not p_yes (D5)", async () => {
    const store = openFixture();
    try {
      const banner = await getLatestRecommendations(store);
      const byFamily = new Map(banner.map((e) => [e.family, e]));
      // KXDIESELD prediction 10: p_yes 0.55 but NO position -> recorded/pass.
      expect(byFamily.get("KXDIESELD")?.traded).toBe(false);
      // Fixture variant: link a position to prediction 10 -> traded.
    } finally {
      store.close();
    }

    const f2 = buildStoreFixture({
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
      // The store's authoritative link is predictions.position_id (v2
      // column); positions.prediction_id is the inverse pointer.
      linkPositions: [{ predictionId: 10, positionId: 9 }],
    });
    fixtures.push(f2);
    const store2 = openStore(f2.path);
    try {
      const banner = await getLatestRecommendations(store2);
      const diesel = banner.find((e) => e.family === "KXDIESELD");
      expect(diesel?.predictionId).toBe(10);
      expect(diesel?.traded).toBe(true);
    } finally {
      store2.close();
    }
  });

  it("same-run tie-break: the higher predictions.id wins (D5)", async () => {
    const store = openFixture({
      extraPredictions: [
        {
          id: 90,
          run_id: 11,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          series_id: 2,
          direction: "down",
          p_yes: 0.3,
          point_forecast: 6.4,
          forecast_sd: 0.01,
          rationale: "older same-run entry (lower id)",
        },
        {
          id: 91,
          run_id: 11,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          series_id: 2,
          direction: "up",
          p_yes: 0.7,
          point_forecast: 6.6,
          forecast_sd: 0.01,
          rationale: "newer same-run entry (higher id)",
        },
      ],
    });
    try {
      const banner = await getLatestRecommendations(store);
      const diesel = banner.find((e) => e.family === "KXDIESELD");
      // Run 11 is the latest KXDIESELD run; within it, id 91 > 90 > 10.
      expect(diesel?.predictionId).toBe(91);
      expect(diesel?.direction).toBe("up");
      expect(diesel?.pointForecast).toBe(6.6);
    } finally {
      store.close();
    }
  });

  it("banner entries expose run context (startedAt + digest prefix)", async () => {
    const store = openFixture();
    try {
      const banner = await getLatestRecommendations(store);
      for (const entry of banner) {
        expect(entry.run.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(entry.run.digestHashPrefix.length).toBeLessThanOrEqual(8);
        expect(entry.run.digestHashPrefix.length).toBeGreaterThan(0);
      }
    } finally {
      store.close();
    }
  });

  it("empty store: no banner entries (SC-005)", async () => {
    const store = openFixture({ seed: false });
    try {
      await expect(getLatestRecommendations(store)).resolves.toEqual([]);
    } finally {
      store.close();
    }
  });
});