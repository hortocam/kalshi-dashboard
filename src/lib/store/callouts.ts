/**
 * callouts.ts — FR-010: per-family change notes / call-outs card,
 * most recent first. The dashboard owns no separate call-outs table; the
 * store's per-prediction rationale text IS the call-out (the skill records
 * why it called what it called, and that is the human-meaningful note for
 * the family). The card surfaces the rationale of each prediction made
 * for the family, newest first, with run context — the same ordering the
 * recommendations list uses.
 *
 * Empty rationale text is dropped (the store permits NULL rationales);
 * predictions with no rationale produce no call-out line. This keeps the
 * card focused on the human-meaningful notes.
 *
 * Pure read over an OpenedStore; SELECT only.
 */
import type { OpenedStore } from "@/lib/store/open";

export interface CallOut {
  readonly predictionId: number;
  readonly marketTicker: string;
  readonly targetDate: string | null;
  readonly rationale: string;
  readonly run: {
    readonly startedAt: string;
    readonly digestHashPrefix: string;
  };
}

interface RawRow {
  prediction_id: number;
  market_ticker: string | null;
  series_id: number | null;
  target_date: string | null;
  rationale: string | null;
  run_started_at: string;
  digest_hash: string | null;
}

interface SeriesRow {
  id: number;
  family: string;
}

export async function getCallOuts(
  store: OpenedStore,
  family: string
): Promise<CallOut[]> {
  const series = store.db
    .prepare("SELECT id, family FROM series")
    .all() as unknown as SeriesRow[];
  const familiesByLength = [...series].sort(
    (a, b) => b.family.length - a.family.length
  );
  const familyById = new Map(series.map((s) => [s.id, s.family]));

  const familyOf = (p: RawRow): string | null => {
    const ticker = p.market_ticker;
    if (ticker) {
      const match = familiesByLength.find(
        (s) => ticker === s.family || ticker.startsWith(`${s.family}-`)
      );
      if (match) return match.family;
    }
    if (p.series_id !== null) return familyById.get(p.series_id) ?? null;
    return null;
  };

  const rows = store.db
    .prepare(
      `SELECT p.id AS prediction_id, p.market_ticker, p.series_id,
              p.target_date, p.rationale,
              r.started_at AS run_started_at, r.digest_hash
       FROM predictions p
       JOIN runs r ON r.id = p.run_id
       WHERE p.rationale IS NOT NULL AND p.rationale != ''
       ORDER BY r.started_at DESC, p.id DESC`
    )
    .all() as unknown as RawRow[];

  const out: CallOut[] = [];
  for (const row of rows) {
    if (familyOf(row) !== family) continue;
    if (row.rationale === null) continue;
    out.push({
      predictionId: row.prediction_id,
      marketTicker: row.market_ticker ?? "",
      targetDate: row.target_date,
      rationale: row.rationale,
      run: {
        startedAt: row.run_started_at,
        digestHashPrefix: (row.digest_hash ?? "").slice(0, 8),
      },
    });
  }
  return out;
}
