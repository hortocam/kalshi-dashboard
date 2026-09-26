/**
 * recommendations.test.ts — T033 golden tests for getRecommendations()
 * (FR-006, contracts/data-layer.md). Per-family recommendation list,
 * most-recent first, each carrying the prediction's market quote context
 * and the resolved outcome mark (the source-priority observation for
 * target_date). Position linkage does not gate inclusion (the hard
 * requirement, D2 / FR-009).
 */
import { afterAll, describe, expect, it } from "vitest";

import { buildStoreFixture, type StoreFixture } from "@/tests/fixtures/store-fixture";
import { openStore } from "@/lib/store/open";
import { getRecommendations } from "@/lib/store/recommendations";

let fixtures: StoreFixture[] = [];

afterAll(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function openFixture(options?: Parameters<typeof buildStoreFixture>[0]) {
  const f = buildStoreFixture(options);
  fixtures.push(f);
  return openStore(f.path);
}

describe("getRecommendations (T033, FR-006)", () => {
  it("KXDIESELD: every attributed prediction appears, most recent first", async () => {
    const store = openFixture();
    try {
      const recs = await getRecommendations(store, "KXDIESELD");
      // Predictions 2, 5, 8, 10 are attributed to KXDIESELD by ticker prefix.
      // (longest-prefix attribution; no KXAAAGASM / KXTRUMPAPPROVE collisions.)
      expect(recs).toHaveLength(4);
      // Newest first: by run.started_at DESC, prediction.id DESC. Latest
      // run is run 11 (2026-09-24T13:00); prediction 10 is its only KXDIESELD
      // prediction. Then predictions 8 and 5 share run 9 (same started_at,
      // id DESC); 5 has run 5. Order: 10, 8, 5, 2.
      expect(recs.map((r) => r.predictionId)).toEqual([10, 8, 5, 2]);
      for (const r of recs) {
        expect(r.marketTicker.startsWith("KXDIESELD-")).toBe(true);
      }
    } finally {
      store.close();
    }
  });

  it("carries market quote context (latest stored quote, bid preferred)", async () => {
    const store = openFixture();
    try {
      const recs = await getRecommendations(store, "KXDIESELD");
      const r10 = recs.find((r) => r.predictionId === 10)!;
      // Market KXDIESELD-26SEP25-T6.520: no fixture quote seeded -> null.
      expect(r10.quote).toBeNull();

      const r2 = recs.find((r) => r.predictionId === 2)!;
      // KXDIESELD-26SEP24-T6.515: smallest hours_before_close row wins
      // (0.9833 h vs 10.9833 h); bid 0.72 wins over ask 0.76 / close 0.76.
      expect(r2.quote).not.toBeNull();
      expect(r2.quote?.price).toBe(0.72);
      expect(r2.quote?.hoursBeforeClose).toBeCloseTo(0.9833, 4);
      expect(r2.quote?.bidDollars).toBe(0.72);
      expect(r2.quote?.askDollars).toBe(0.76);
    } finally {
      store.close();
    }
  });

  it("resolved outcome mark uses source-priority observation for target_date", async () => {
    const store = openFixture();
    try {
      const recs = await getRecommendations(store, "KXDIESELD");
      const r8 = recs.find((r) => r.predictionId === 8)!;
      // Prediction 8 target_date 2026-09-24: kalshi_settlement band wins
      // (lo 6.51 hi 6.515 mid 6.5125); raw kalshi_expiration_value point
      // 6.5141 coexists and is dropped by source priority.
      expect(r8.resolvedPrint).not.toBeNull();
      expect(r8.resolvedPrint?.obsDate).toBe("2026-09-24");
      expect(r8.resolvedPrint?.lo).toBe(6.51);
      expect(r8.resolvedPrint?.hi).toBe(6.515);
      expect(r8.resolvedPrint?.mid).toBeCloseTo(6.5125, 12);
      expect(r8.resolvedPrint?.source).toBe("kalshi_settlement");

      // Prediction 10 target_date 2026-09-25: no observation stored yet.
      const r10 = recs.find((r) => r.predictionId === 10)!;
      expect(r10.resolvedPrint).toBeNull();
    } finally {
      store.close();
    }
  });

  it("position linkage is surfaced but does not gate inclusion (hard requirement)", async () => {
    const store = openFixture();
    try {
      const recs = await getRecommendations(store, "KXDIESELD");
      // Prediction 5 has position_id 1; the others have none. All four
      // appear — same as the scoreboard's hard requirement.
      expect(recs).toHaveLength(4);
      const r5 = recs.find((r) => r.predictionId === 5)!;
      expect(r5.positionId).toBe(1);
      const r2 = recs.find((r) => r.predictionId === 2)!;
      expect(r2.positionId).toBeNull();
    } finally {
      store.close();
    }
  });

  it("empty store / unknown family: empty list, no errors", async () => {
    const empty = openFixture({ seed: false });
    try {
      expect(await getRecommendations(empty, "KXDIESELD")).toEqual([]);
    } finally {
      empty.close();
    }

    const seeded = openFixture();
    try {
      expect(await getRecommendations(seeded, "KXNOPE")).toEqual([]);
    } finally {
      seeded.close();
    }
  });

  it("rationale text surfaces verbatim on every entry", async () => {
    const store = openFixture();
    try {
      const recs = await getRecommendations(store, "KXDIESELD");
      for (const r of recs) {
        expect(typeof r.rationale === "string" || r.rationale === null).toBe(true);
      }
      const r5 = recs.find((r) => r.predictionId === 5)!;
      expect(r5.rationale).toContain("EXECUTED POSITION");
    } finally {
      store.close();
    }
  });
});
