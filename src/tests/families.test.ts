import { afterAll, describe, expect, it } from "vitest";

import { buildStoreFixture, type StoreFixture } from "@/tests/fixtures/store-fixture";
import { openStore } from "@/lib/store/open";
import { listFamilies } from "@/lib/store/families";

/**
 * T012: listFamilies golden test (FR-015) — the six fixture-A families in
 * family order, exactly as contracts/data-layer.md pins them.
 */

let fixtures: StoreFixture[] = [];

afterAll(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

describe("listFamilies (T012, FR-015)", () => {
  it("returns the 6 golden fixture-A families in family order", async () => {
    const f = buildStoreFixture();
    fixtures.push(f);
    const store = openStore(f.path);
    try {
      const families = await listFamilies(store);
      expect(families).toHaveLength(6);
      expect(families.map((row) => row.family)).toEqual([
        "HO=F",
        "KXAAAGASD",
        "KXAAAGASM",
        "KXDIESELD",
        "KXTRUMPAPPROVE",
        "RB=F",
      ]);
      expect(families[0]).toEqual({ family: "HO=F", seriesTicker: "HO=F", kind: "price_series" });
      expect(families[1]).toEqual({ family: "KXAAAGASD", seriesTicker: "KXAAAGASD", kind: "daily_ladder" });
      expect(families[3]).toEqual({ family: "KXDIESELD", seriesTicker: "KXDIESELD", kind: "daily_ladder" });
      expect(families[4]).toEqual({ family: "KXTRUMPAPPROVE", seriesTicker: "KXTRUMPAPPROVE", kind: "daily_ladder" });
    } finally {
      store.close();
    }
  });

  it("returns [] for an empty store (no series rows)", async () => {
    const f = buildStoreFixture({ seed: false });
    fixtures.push(f);
    const store = openStore(f.path);
    try {
      await expect(listFamilies(store)).resolves.toEqual([]);
    } finally {
      store.close();
    }
  });
});