import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";
import { buildStoreFixture, type StoreFixture } from "@/tests/fixtures/store-fixture";

/**
 * T004 (P1) extended in P2: /api/health per contracts/data-layer.md —
 * 200 when the store opens through the read-only data layer with a supported
 * schema version (schemaVersion flows through, the P2 checkpoint), 503 for
 * a missing store, a schema-mismatched store, or missing config. Fixture
 * stores are throwaway temp dirs; the live store is never touched.
 */

let fixtureDir: string;
let fixtures: StoreFixture[] = [];

beforeAll(() => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), "health-fixture-"));
});

afterAll(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
  rmSync(fixtureDir, { recursive: true, force: true });
});

async function health() {
  const response = await GET();
  return { response, body: await response.json() };
}

describe("/api/health", () => {
  it("returns 200 with schemaVersion 2 for a real fixture store (P2 wiring)", async () => {
    const f = buildStoreFixture({ seed: false });
    fixtures.push(f);
    process.env.KALSHI_RESEARCH_DB = f.path;
    const { response, body } = await health();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      store: { reachable: true, schemaVersion: 2 },
    });
  });

  it("returns 503 { reachable: false, schemaVersion: 1 } for a schema-v1 store", async () => {
    const f = buildStoreFixture({ version: 1, seed: false });
    fixtures.push(f);
    process.env.KALSHI_RESEARCH_DB = f.path;
    const { response, body } = await health();
    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      store: { reachable: false, schemaVersion: 1 },
    });
  });

  it("returns 503 { reachable: false, schemaVersion: 3 } for a schema-v3 store", async () => {
    const f = buildStoreFixture({ version: 3, seed: false });
    fixtures.push(f);
    process.env.KALSHI_RESEARCH_DB = f.path;
    const { response, body } = await health();
    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      store: { reachable: false, schemaVersion: 3 },
    });
  });

  it("returns 503 { reachable: false, schemaVersion: null } for a missing store", async () => {
    process.env.KALSHI_RESEARCH_DB = path.join(fixtureDir, "does-not-exist.sqlite");
    const { response, body } = await health();
    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      store: { reachable: false, schemaVersion: null },
    });
  });

  it("returns 503 with reachable:false when required config is missing entirely", async () => {
    delete process.env.KALSHI_RESEARCH_DB;
    const { response, body } = await health();
    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      store: { reachable: false, schemaVersion: null },
    });
  });

  it("treats a file that is not a SQLite database as unreachable (503)", async () => {
    const junkPath = path.join(fixtureDir, "not-a-db.sqlite");
    writeFileSync(junkPath, "this is not a sqlite database");
    process.env.KALSHI_RESEARCH_DB = junkPath;
    const { response, body } = await health();
    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      store: { reachable: false, schemaVersion: null },
    });
  });
});