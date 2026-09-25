import { afterAll, describe, expect, it } from "vitest";

import { attemptWriteViaHandle, buildStoreFixture, type StoreFixture } from "@/tests/fixtures/store-fixture";
import { openStore, StoreMissingError, SUPPORTED_SCHEMA_VERSIONS } from "@/lib/store/open";

/**
 * T010/T011 tests: openStore + schema gate + StoreError hierarchy per
 * contracts/data-layer.md. Fixtures are throwaway temp stores built by
 * buildStoreFixture(); the live store is never touched. Negative controls:
 * a schema-v1 fixture and a schema-v3 fixture MUST be rejected (card
 * evidence floor).
 */

let fixtures: StoreFixture[] = [];

afterAll(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function makeFixture(
  ...args: Parameters<typeof buildStoreFixture>
): StoreFixture {
  const f = buildStoreFixture(...args);
  fixtures.push(f);
  return f;
}

describe("buildStoreFixture (T010 helper)", () => {
  it("creates a temp store with the verbatim v2 DDL (11 tables)", () => {
    const f = makeFixture();
    const tables = f.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual([
      "cache_meta",
      "markets",
      "models",
      "observations",
      "positions",
      "predictions",
      "quotes",
      "runs",
      "schema_version",
      "series",
      "settlements",
    ]);
  });

  it("seeds the golden rows the contract pins", () => {
    const f = makeFixture();
    const seriesCount = (
      f.db.prepare("SELECT COUNT(*) n FROM series").all() as { n: number }[]
    )[0].n;
    const predCount = (
      f.db.prepare("SELECT COUNT(*) n FROM predictions").all() as { n: number }[]
    )[0].n;
    const positionCount = (
      f.db.prepare("SELECT COUNT(*) n FROM positions").all() as { n: number }[]
    )[0].n;
    const storeRev = (
      f.db
        .prepare("SELECT n_rows n FROM cache_meta WHERE key = 'store_rev'")
        .all() as { n: number | null }[]
    )[0].n;
    expect(seriesCount).toBe(6);
    expect(predCount).toBe(12);
    expect(positionCount).toBe(1);
    expect(storeRev).toBe(3804);
  });
});

describe("openStore + schema gate (T011)", () => {
  it("exposes SUPPORTED_SCHEMA_VERSIONS = [2]", () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toEqual([2]);
  });

  it("opens a v2 fixture and reports schemaVersion 2 (happy path)", () => {
    const f = makeFixture();
    const store = openStore(f.path);
    try {
      expect(store.schemaVersion).toBe(2);
      // The store rev from cache_meta is reachable through the handle for
      // freshness queries; the happy-path proof here is the version gate.
      expect(store.path).toBe(f.path);
    } finally {
      store.close();
    }
  });

  it("throws StoreMissingError when the file does not exist", () => {
    try {
      openStore("/nonexistent/dir/no-store.sqlite");
      expect.unreachable("missing store must not open");
    } catch (err) {
      expect((err as Error).name).toBe("StoreMissingError");
      expect(err).toBeInstanceOf(StoreMissingError);
    }
  });

  it("rejects a schema-v1 store with SchemaMismatchError (negative control)", () => {
    const f = makeFixture({ version: 1 });
    try {
      openStore(f.path);
      expect.unreachable("v1 store must not open");
    } catch (err) {
      expect((err as Error).name).toBe("SchemaMismatchError");
    }
  });

  it("rejects a schema-v3 store with SchemaMismatchError (negative control)", () => {
    const f = makeFixture({ version: 3 });
    try {
      openStore(f.path);
      expect.unreachable("v3 store must not open");
    } catch (err) {
      expect((err as Error).name).toBe("SchemaMismatchError");
    }
  });

  it("wraps a corrupt/unopenable store in StoreUnavailableError", () => {
    // A directory path cannot be opened as a SQLite database — a transient
    // open failure, distinct from "missing" and "schema mismatch".
    const f = makeFixture();
    try {
      openStore(f.dir);
      expect.unreachable("a directory must not open as a store");
    } catch (err) {
      expect((err as Error).name).toBe("StoreUnavailableError");
    }
  });

  it("refuses writes through the opened read-only handle (evidence floor)", () => {
    const f = makeFixture();
    const store = openStore(f.path);
    try {
      expect(() => attemptWriteViaHandle(store.db)).toThrow(/readonly/i);
    } finally {
      store.close();
    }
  });
});