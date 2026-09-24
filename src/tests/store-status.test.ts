import { afterAll, describe, expect, it } from "vitest";

import { buildStoreFixture, type StoreFixture } from "@/tests/fixtures/store-fixture";
import { openStore } from "@/lib/store/open";
import { getStoreStatus } from "@/lib/store/freshness";

/**
 * T017: getStoreStatus golden tests (FR-016, FR-017). StoreStatus =
 * { reachable, schemaVersion, storeRev, staleCount, lastRunAt }.
 *
 * staleCount counts the store's stale-rule violations (research_store.py
 * find_stale, the freshness contract): open ladders/quotes 15 min, today's
 * partial close 30 min, non-finalized settlements revalidate, models
 * invalidated by newer inputs, expired cache_meta. Fixture A is built so the
 * count is deterministic regardless of when tests run: all market close_ts
 * are in the past (open-ladder and quote rules never fire), both price
 * series are old (today_close fires twice), and one settlement is
 * non-finalized (settlement_revalidation fires once) -> staleCount 3.
 */

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

describe("getStoreStatus (T017, FR-016 / FR-017)", () => {
  it("golden fixture A: reachable, v2, storeRev 3804, deterministic staleCount 3", async () => {
    const store = openFixture();
    try {
      const status = await getStoreStatus(store);
      expect(status).toEqual({
        reachable: true,
        schemaVersion: 2,
        storeRev: 3804,
        staleCount: 3,
        lastRunAt: "2026-09-24T16:47:33.950412Z",
      });
    } finally {
      store.close();
    }
  });

  it("staleCount counts expired cache_meta artifacts (rule class 5)", async () => {
    const store = openFixture({
      extraCacheMeta: [
        {
          key: "quotes:KXDIESELD-26SEP24",
          asof: "2026-09-24T12:00:00Z",
          fetched_at: "2026-09-24T12:00:00Z",
          expires_at: "2026-09-24T12:30:00Z", // long past -> expired
          n_rows: 20,
          note: "calibration sample",
        },
      ],
    });
    try {
      const status = await getStoreStatus(store);
      expect(status.staleCount).toBe(4); // 3 deterministic + 1 expired cache row
    } finally {
      store.close();
    }
  });

  it("an open ladder older than 15 min is a stale artifact (rule class 1)", async () => {
    // close_ts far in the future (open market), fetched_at old -> violation.
    const store = openFixture({
      extraMarkets: [
        {
          market_ticker: "KXDIESELD-26DEC24-T7.000",
          event_ticker: "KXDIESELD-26DEC24",
          close_ts: 1833722400, // 2028-01-08: open at test time
          close_time: "2028-01-08T13:00:00Z",
          result: null,
          fetched_at: "2026-09-24T10:00:00Z",
        },
      ],
    });
    try {
      const status = await getStoreStatus(store);
      // 3 deterministic violations + 1 open-ladder violation.
      expect(status.staleCount).toBe(4);
    } finally {
      store.close();
    }
  });

  it("empty store: reachable with zero staleness and no runs (SC-005)", async () => {
    const store = openFixture({ seed: false });
    try {
      const status = await getStoreStatus(store);
      expect(status).toEqual({
        reachable: true,
        schemaVersion: 2,
        storeRev: null,
        staleCount: 0,
        lastRunAt: null,
      });
    } finally {
      store.close();
    }
  });
});