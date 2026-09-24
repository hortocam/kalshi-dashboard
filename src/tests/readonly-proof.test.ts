import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

import {
  attemptWriteViaHandle,
  buildStoreFixture,
  type StoreFixture,
} from "@/tests/fixtures/store-fixture";
import { openStore } from "@/lib/store/open";
import { listFamilies } from "@/lib/store/families";
import { getSeriesWindow } from "@/lib/store/observations";
import { getFamilyPnl, getPnl } from "@/lib/store/pnl";
import { getScoreboard } from "@/lib/store/hitrate";
import { getLatestRecommendations } from "@/lib/store/banner";
import { getStoreStatus } from "@/lib/store/freshness";

/**
 * T019: read-only proof (SC-006 at unit level, the card's evidence floor).
 * Every query function runs against a fixture store; the file's sha256 must
 * be byte-identical before and after. Also proves the readOnly open mode
 * refuses an INSERT through the opened handle.
 */

let fixtures: StoreFixture[] = [];

afterAll(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("read-only proof (T019, FR-011 / SC-006 at unit level)", () => {
  it("every query function over the fixture store leaves the file byte-identical", async () => {
    const f = buildStoreFixture();
    fixtures.push(f);
    const before = sha256(f.path);

    const store = openStore(f.path);
    try {
      const now = Date.UTC(2026, 8, 24, 18, 0, 0);
      await listFamilies(store);
      await getSeriesWindow(store, "KXDIESELD", "all", { now });
      await getSeriesWindow(store, "KXAAAGASD", "30d", { now });
      await getPnl(store, "all", { now });
      await getFamilyPnl(store, "KXDIESELD", "7d", { now });
      await getScoreboard(store);
      await getScoreboard(store, "KXDIESELD");
      await getLatestRecommendations(store);
      await getStoreStatus(store);
    } finally {
      store.close();
    }

    const after = sha256(f.path);
    expect(after).toBe(before);
  });

  it("an INSERT through the opened read-only handle is refused by SQLite", () => {
    const f = buildStoreFixture();
    fixtures.push(f);
    const before = sha256(f.path);
    const store = openStore(f.path);
    try {
      expect(() => attemptWriteViaHandle(store.db)).toThrow(/readonly/i);
    } finally {
      store.close();
    }
    expect(sha256(f.path)).toBe(before);
  });

  it("openStore refuses stores whose schema version is unsupported (gate recap)", () => {
    const v1 = buildStoreFixture({ version: 1 });
    fixtures.push(v1);
    const v3 = buildStoreFixture({ version: 3 });
    fixtures.push(v3);
    expect(() => openStore(v1.path)).toThrow();
    expect(() => openStore(v3.path)).toThrow();
  });
});