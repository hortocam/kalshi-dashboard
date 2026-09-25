import { afterAll, describe, expect, it } from "vitest";

import { buildStoreFixture, type StoreFixture } from "@/tests/fixtures/store-fixture";
import { openStore } from "@/lib/store/open";
import { getSeriesWindow } from "@/lib/store/observations";

/**
 * T013: getSeriesWindow golden tests (FR-007, D6) per contracts/data-layer.md
 * and quickstart V1: KXDIESELD 'all' = 53 distinct dates; on 2026-09-23 and
 * 2026-09-24 the series-of-record is the kalshi_settlement band (the raw
 * kalshi_expiration_value point coexists and is dropped by source priority —
 * a band and a point never both render for a date); point-row selection is
 * exercised via the synthetic fixture dates on KXAAAGASD.
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

describe("getSeriesWindow (T013, FR-007 / D6)", () => {
  it("KXDIESELD 'all': 53 distinct dates, one row per date", async () => {
    const store = openFixture();
    try {
      const points = await getSeriesWindow(store, "KXDIESELD", "all");
      expect(points).toHaveLength(53);
      const dates = points.map((p) => p.obsDate);
      expect(new Set(dates).size).toBe(53);
      expect([...dates].sort()).toEqual(dates); // ascending by date
      expect(dates[0]).toBe("2026-08-03");
      expect(dates[52]).toBe("2026-09-24");
    } finally {
      store.close();
    }
  });

  it("2026-09-23 and 2026-09-24: kalshi_settlement band wins over the raw point", async () => {
    const store = openFixture();
    try {
      const points = await getSeriesWindow(store, "KXDIESELD", "all");
      const byDate = new Map(points.map((p) => [p.obsDate, p]));

      const sep23 = byDate.get("2026-09-23");
      expect(sep23?.obsDate).toBe("2026-09-23");
      expect(sep23?.value).toBeNull();
      expect(sep23?.lo).toBe(6.52);
      expect(sep23?.hi).toBe(6.525);
      expect(sep23?.mid).toBeCloseTo(6.5225, 12);
      expect(sep23?.source).toBe("kalshi_settlement");
      expect(sep23?.quality).toBe("final");
      expect(sep23?.unit).toBeNull();

      const sep24 = byDate.get("2026-09-24");
      expect(sep24?.obsDate).toBe("2026-09-24");
      expect(sep24?.value).toBeNull();
      expect(sep24?.lo).toBe(6.51);
      expect(sep24?.hi).toBe(6.515);
      expect(sep24?.mid).toBeCloseTo(6.5125, 12);
      expect(sep24?.source).toBe("kalshi_settlement");
      expect(sep24?.quality).toBe("final");
      expect(sep24?.unit).toBeNull();

      // The raw expiration points (6.5217 / 6.5141) exist in the fixture but
      // must never render: exactly one row per date (the contract's "a band
      // and a point never both render").
    } finally {
      store.close();
    }
  });

  it("synthetic device dates on KXAAAGASD: a point row wins when it is the highest-priority source", async () => {
    const store = openFixture();
    try {
      const points = await getSeriesWindow(store, "KXAAAGASD", "all");
      const byDate = new Map(points.map((p) => [p.obsDate, p]));

      // 09-25: only a kalshi_expiration_value point exists -> it IS the row.
      const sep25 = byDate.get("2026-09-25");
      expect(sep25?.value).toBe(4.4999);
      expect(sep25?.lo).toBeNull();
      expect(sep25?.hi).toBeNull();
      expect(sep25?.source).toBe("kalshi_expiration_value");

      // 09-26: aaa_page band (priority 1 of present) beats yahoo_close point.
      const sep26 = byDate.get("2026-09-26");
      expect(sep26?.source).toBe("aaa_page");
      expect(sep26?.value).toBeNull();
      expect(sep26?.lo).toBe(4.49);
      expect(sep26?.hi).toBe(4.495);
      expect(sep26?.mid).toBeCloseTo(4.4925, 10);

      // 09-27: kalshi_settlement band beats aaa_page point.
      const sep27 = byDate.get("2026-09-27");
      expect(sep27?.source).toBe("kalshi_settlement");
      expect(sep27?.value).toBeNull();
      expect(sep27?.lo).toBe(4.48);

      // 09-28: yahoo_close point beats kalshi_expiration_value point.
      const sep28 = byDate.get("2026-09-28");
      expect(sep28?.source).toBe("yahoo_close");
      expect(sep28?.value).toBe(4.44);
      expect(sep28?.lo).toBeNull();
      expect(sep28?.hi).toBeNull();
    } finally {
      store.close();
    }
  });

  it("window filtering: 7d keeps recent dates, 90d more, 'all' everything", async () => {
    const store = openFixture();
    try {
      // Fixture "now" anchor: 2026-09-24T18:00:00Z.
      const now = Date.UTC(2026, 8, 24, 18, 0, 0);
      const all = await getSeriesWindow(store, "KXDIESELD", "all", { now });
      const d90 = await getSeriesWindow(store, "KXDIESELD", "90d", { now });
      const d30 = await getSeriesWindow(store, "KXDIESELD", "30d", { now });
      const d7 = await getSeriesWindow(store, "KXDIESELD", "7d", { now });

      expect(all).toHaveLength(53);
      // 90d: window starts 2026-06-26 — the whole series (from 08-03) is inside.
      expect(d90).toHaveLength(53);
      // 30d: window starts 2026-08-25 — dates 08-03..08-24 drop.
      expect(d30.every((p) => p.obsDate >= "2026-08-25")).toBe(true);
      expect(d30).toHaveLength(31); // 08-25 .. 09-24 inclusive
      // 7d: window starts 2026-09-17.
      expect(d7.every((p) => p.obsDate >= "2026-09-17")).toBe(true);
      expect(d7).toHaveLength(8); // 09-17 .. 09-24 inclusive
      // Filtering is monotone: 7d ⊂ 30d ⊂ 90d = all.
      expect(d30[0].obsDate).toBe("2026-08-25");
      expect(d7[0].obsDate).toBe("2026-09-17");
    } finally {
      store.close();
    }
  });

  it("unknown family yields an empty window (no rows, no error)", async () => {
    const store = openFixture();
    try {
      await expect(getSeriesWindow(store, "KXNOPE", "all")).resolves.toEqual([]);
    } finally {
      store.close();
    }
  });

  it("rows carry the stored unit (KXAAAGASD USD/gal, KXDIESELD null)", async () => {
    const store = openFixture();
    try {
      const gasd = await getSeriesWindow(store, "KXAAAGASD", "all");
      expect(gasd[0].unit).toBe("USD/gal");
      const diesel = await getSeriesWindow(store, "KXDIESELD", "all");
      expect(diesel[0].unit).toBeNull();
    } finally {
      store.close();
    }
  });
});