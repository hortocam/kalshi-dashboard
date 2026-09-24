import { NextResponse } from "next/server";
import { existsSync } from "node:fs";

import { loadConfig } from "@/lib/config";

/**
 * Health endpoint (FR-018) per contracts/data-layer.md:
 *
 *   200 { ok: true,  store: { reachable, schemaVersion } }  when reachable
 *   503 { ok: false, store: { reachable, schemaVersion } }  otherwise
 *
 * P1 scope (card t_3b29d59a): "reachable" is the store existence probe only —
 * the read-only data layer (openStore, schema-version gate) lands in P2 and
 * will own `schemaVersion`. Until then schemaVersion is null in every response,
 * so the shape matches the contract while the value is honestly "not known yet".
 */
export async function GET(): Promise<NextResponse> {
  let storeReachable: boolean;
  try {
    const config = loadConfig();
    storeReachable = existsSync(config.researchDbPath);
  } catch {
    // Missing/invalid configuration: the store cannot be reachable.
    storeReachable = false;
  }

  const body = {
    ok: storeReachable,
    store: {
      reachable: storeReachable,
      schemaVersion: null,
    },
  };

  return NextResponse.json(body, { status: storeReachable ? 200 : 503 });
}