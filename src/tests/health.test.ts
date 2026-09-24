import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

/**
 * T004 tests: /api/health per contracts/data-layer.md — 200 with a reachable
 * store path, 503 with a missing one. Fixtures are throwaway temp dirs; the
 * live store is never touched.
 */

let fixtureDir: string;
let reachableDbPath: string;

beforeAll(() => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), "health-fixture-"));
  reachableDbPath = path.join(fixtureDir, "fixture-store.sqlite");
  // Existence is all the P1 probe checks; a valid empty SQLite file is realistic.
  new DatabaseSync(reachableDbPath).close();
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

async function health() {
  const response = await GET();
  return { response, body: await response.json() };
}

describe("/api/health", () => {
  it("returns 200 { ok: true, store: { reachable: true } } for an existing store", async () => {
    process.env.KALSHI_RESEARCH_DB = reachableDbPath;
    const { response, body } = await health();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      store: { reachable: true, schemaVersion: null },
    });
  });

  it("returns 503 { ok: false, store: { reachable: false } } for a missing store", async () => {
    process.env.KALSHI_RESEARCH_DB = path.join(
      fixtureDir,
      "does-not-exist.sqlite"
    );
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
});