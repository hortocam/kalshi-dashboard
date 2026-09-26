/**
 * scorecard-data.ts — per-family data assembly for `/markets/[family]`
 * (Phase P4 server-side data layer, T030). Composes the existing P2/P3
 * query functions into one bundle the page renders; never issues SQL of
 * its own (invariant 1, contracts/data-layer.md).
 *
 * Family validation is lenient: an unknown family yields a result with
 * empty arrays and a `familyExists: false` flag rather than throwing —
 * the page renders a "no data" state (US2 acceptance scenario 1, the
 * "family with no data" branch in T036 / edge cases). The store itself
 * is the only thing that throws (and that goes through the page's
 * failure-state machinery).
 */
import { loadConfig } from "@/lib/config";
import { listFamilies } from "@/lib/store/families";
import { getScoreboard } from "@/lib/store/hitrate";
import { getSeriesWindow, type SeriesPoint, type Window } from "@/lib/store/observations";
import { getFamilyPnl, type PnlView } from "@/lib/store/pnl";
import { getRecommendations, type RecommendationEntry } from "@/lib/store/recommendations";
import { getCallOuts, type CallOut } from "@/lib/store/callouts";
import { getStoreStatus, type StoreStatus } from "@/lib/store/freshness";
import { openStore } from "@/lib/store/open";

export interface ScorecardData {
  readonly family: string;
  readonly familyExists: boolean;
  readonly window: Window;
  readonly now: number;
  readonly status: StoreStatus;
  readonly scoreboard: ReturnType<typeof emptyFamilyCounts>;
  readonly series: SeriesPoint[];
  readonly recommendations: RecommendationEntry[];
  readonly callOuts: CallOut[];
  readonly pnl: PnlView;
}

function emptyFamilyCounts() {
  return {
    family: "",
    success: 0,
    fail: 0,
    pending: 0,
    unscored: 0,
    hitRate: null as number | null,
  };
}

/**
 * Clock anchor for deterministic rendering. Production uses the wall
 * clock; tests inject a fixed anchor via setScorecardNow() (module-level,
 * so the page component can ask loadScorecardData() for the now without
 * any prop drilling).
 */
let nowFn: (() => number) | null = null;

export function setScorecardNow(fn: (() => number) | null): void {
  nowFn = fn;
}

export function scorecardNow(): number {
  return nowFn === null ? Date.now() : nowFn();
}

/**
 * Load the per-family scorecard bundle for one render. Throws the store
 * error hierarchy on open/gate failures (the caller maps them to UI
 * states); per-family data is read-only via the same handle, never
 * mutated.
 */
export async function loadScorecardData(
  family: string,
  window: Window,
  now: number = scorecardNow()
): Promise<ScorecardData> {
  const config = loadConfig();
  const store = openStore(config.researchDbPath);
  try {
    const families = await listFamilies(store);
    const familyExists = families.some((f) => f.family === family);

    const [status, scoreboardAll, series, recommendations, callOuts, pnl] =
      await Promise.all([
        getStoreStatus(store, { now }),
        familyExists ? getScoreboard(store, family) : Promise.resolve({
          families: [{ ...emptyFamilyCounts(), family }],
          unattributed: { success: 0, fail: 0, pending: 0, unscored: 0 },
        }),
        getSeriesWindow(store, family, window, { now }),
        getRecommendations(store, family),
        getCallOuts(store, family),
        getFamilyPnl(store, family, "all"),
      ]);

    const scoreboard = scoreboardAll.families[0] ?? {
      ...emptyFamilyCounts(),
      family,
    };

    return {
      family,
      familyExists,
      window,
      now,
      status,
      scoreboard,
      series,
      recommendations,
      callOuts,
      pnl,
    };
  } finally {
    store.close();
  }
}
