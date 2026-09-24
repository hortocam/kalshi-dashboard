/**
 * families.ts — FR-015: the tracked-family list (contracts/data-layer.md).
 * Pure read over an OpenedStore; SELECT only.
 */
import type { OpenedStore } from "@/lib/store/open";

export interface FamilyRow {
  readonly family: string;
  readonly seriesTicker: string;
  readonly kind: string;
}

export async function listFamilies(store: OpenedStore): Promise<FamilyRow[]> {
  const rows = store.db
    .prepare("SELECT family, series_ticker, kind FROM series ORDER BY family")
    .all() as { family: string; series_ticker: string; kind: string }[];
  return rows.map((r) => ({
    family: r.family,
    seriesTicker: r.series_ticker,
    kind: r.kind,
  }));
}