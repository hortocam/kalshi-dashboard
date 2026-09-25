import { NextResponse } from "next/server";

import { loadConfig } from "@/lib/config";
import { openStore, StoreError } from "@/lib/store/open";

/**
 * Health endpoint (FR-018) per contracts/data-layer.md:
 *
 *   200 { ok: true,  store: { reachable, schemaVersion } }  when the store
 *        opens and its schema version is supported
 *   503 { ok: false, store: { reachable, schemaVersion } }  otherwise
 *
 * P2 scope (card t_13a59772): the read-only data layer owns `schemaVersion`.
 * reachable now means "the store opened through openStore with a supported
 * schema" — missing/unavailable/schema-mismatched stores all report
 * reachable:false with the version they expose (null when unknown).
 */
export async function GET(): Promise<NextResponse> {
  let config;
  try {
    config = loadConfig();
  } catch {
    // Missing/invalid configuration: the store cannot be reachable.
    return NextResponse.json(
      { ok: false, store: { reachable: false, schemaVersion: null } },
      { status: 503 }
    );
  }

  try {
    const store = openStore(config.researchDbPath);
    try {
      return NextResponse.json(
        { ok: true, store: { reachable: true, schemaVersion: store.schemaVersion } },
        { status: 200 }
      );
    } finally {
      store.close();
    }
  } catch (err) {
    if (err instanceof StoreError) {
      const version =
        err instanceof Error && "found" in err
          ? ((err as { found: number }).found ?? null)
          : null;
      return NextResponse.json(
        { ok: false, store: { reachable: false, schemaVersion: version } },
        { status: 503 }
      );
    }
    throw err;
  }
}