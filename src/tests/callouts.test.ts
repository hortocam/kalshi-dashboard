/**
 * callouts.test.ts — T035 golden tests for getCallOuts() (FR-010).
 * Per-family rationale text, most recent first. Predictions with no
 * rationale (NULL or empty) are dropped from the call-out list — the
 * card surfaces human-meaningful notes only.
 */
import { afterAll, describe, expect, it } from "vitest";

import { buildStoreFixture, type StoreFixture } from "@/tests/fixtures/store-fixture";
import { openStore } from "@/lib/store/open";
import { getCallOuts } from "@/lib/store/callouts";

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

describe("getCallOuts (T035, FR-010)", () => {
  it("KXDIESELD: every rationale-bearing prediction appears, newest first", async () => {
    const store = openFixture();
    try {
      const out = await getCallOuts(store, "KXDIESELD");
      // Predictions 2 / 5 / 8 / 10 all have non-empty rationales.
      expect(out).toHaveLength(4);
      // Newest first: run 11 (10) -> run 9 (8) -> run 5 (5) -> run 4 (2).
      expect(out.map((c) => c.predictionId)).toEqual([10, 8, 5, 2]);
    } finally {
      store.close();
    }
  });

  it("only the family's attributed predictions appear (longest-prefix wins)", async () => {
    const store = openFixture();
    try {
      const diesel = await getCallOuts(store, "KXDIESELD");
      for (const c of diesel) {
        expect(c.marketTicker.startsWith("KXDIESELD-")).toBe(true);
      }
      const gasm = await getCallOuts(store, "KXAAAGASM");
      // Predictions 1 and 4: ticker prefix KXAAAGASM wins (longest) even
      // though prediction 4 has series_id 3 (HO=F).
      expect(gasm).toHaveLength(2);
      expect(gasm.map((c) => c.predictionId).sort()).toEqual([1, 4]);
    } finally {
      store.close();
    }
  });

  it("rationale text is dropped when NULL or empty", async () => {
    // extraPredictions lets the callout test exercise both NULL and empty
    // rationale code paths without going through withWritable() (which
    // issues raw INSERTs the invariant scanner flags outside the
    // tests/fixtures zone).
    const store = openFixture({
      extraPredictions: [
        {
          id: 200,
          run_id: 1,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          series_id: 2,
          direction: "up",
          rationale: null,
        },
        {
          id: 201,
          run_id: 1,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          series_id: 2,
          direction: "up",
          rationale: "",
        },
        {
          id: 202,
          run_id: 1,
          market_ticker: "KXDIESELD-26SEP24-T6.515",
          series_id: 2,
          direction: "up",
          rationale: "explicit note for the variant",
        },
      ],
    });
    try {
      const out = await getCallOuts(store, "KXDIESELD");
      // The 4 base predictions plus id 202; ids 200 and 201 are dropped.
      expect(out).toHaveLength(5);
      expect(out.map((c) => c.predictionId)).toContain(202);
      expect(out.map((c) => c.predictionId)).not.toContain(200);
      expect(out.map((c) => c.predictionId)).not.toContain(201);
    } finally {
      store.close();
    }
  });

  it("empty store / unknown family: empty list, no errors", async () => {
    const empty = openFixture({ seed: false });
    try {
      expect(await getCallOuts(empty, "KXDIESELD")).toEqual([]);
    } finally {
      empty.close();
    }
    const seeded = openFixture();
    try {
      expect(await getCallOuts(seeded, "KXNOPE")).toEqual([]);
    } finally {
      seeded.close();
    }
  });
});
