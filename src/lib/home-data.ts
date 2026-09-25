/**
 * Homepage data assembly (server-side). Loads everything the homepage
 * renders, exclusively through the P2 data layer (openStore + store/*
 * queries) — no SQL here, no second SQLite entry point (invariant 1).
 *
 * The store is opened per load and closed in a finally; reads only, never
 * writes (FR-011); no absolute host paths in code (FR-012): the path comes
 * from config (env) at load time.
 */
import { loadConfig } from "@/lib/config";
import type { Window } from "@/lib/store/observations";
import { getLatestRecommendations, type BannerEntry } from "@/lib/store/banner";
import { listFamilies } from "@/lib/store/families";
import { getStoreStatus, type StoreStatus } from "@/lib/store/freshness";
import { openStore } from "@/lib/store/open";
import { getPnl, type PnlView } from "@/lib/store/pnl";
import { getSkillChanges, type SkillChange } from "@/lib/store/skilllog";
import { getFamilySnapshot, type FamilySnapshot } from "@/components/family-card";

export interface FamilySnapshotResult {
  readonly family: string;
  readonly snapshot?: FamilySnapshot;
  readonly error?: string;
}

/**
 * Window anchor for deterministic rendering. Production uses the wall
 * clock; tests inject a fixed anchor via setHomepageNow() (module-level,
 * because Next's page-type validation allows only PageProps on the page
 * component — no extra props to carry a test clock).
 */
let nowFn: (() => number) | null = null;

export function setHomepageNow(fn: (() => number) | null): void {
  nowFn = fn;
}

export function homepageNow(): number {
  return nowFn === null ? Date.now() : nowFn();
}

export interface HomepageData {
  readonly window: Window;
  readonly now: number;
  readonly status: StoreStatus;
  readonly pnl: PnlView;
  readonly banner: BannerEntry[];
  readonly skillChanges: SkillChange[];
  readonly skillRepoConfigured: boolean;
  readonly snapshots: FamilySnapshotResult[];
}

/**
 * Load the homepage data set for one render. Throws the store error
 * hierarchy on open/gate failures (the caller maps them to UI states);
 * per-family read failures are captured per card and never mask the rest.
 * The clock defaults to homepageNow() (injectable for tests).
 */
export async function loadHomepageData(
  window: Window,
  now: number = homepageNow()
): Promise<HomepageData> {
  const config = loadConfig();
  const store = openStore(config.researchDbPath);
  try {
    const [status, families, pnl, banner] = await Promise.all([
      getStoreStatus(store, { now }),
      listFamilies(store),
      getPnl(store, window, { now }),
      getLatestRecommendations(store),
    ]);
    const snapshots = await Promise.all(
      families.map(async (f): Promise<FamilySnapshotResult> => {
        try {
          return {
            family: f.family,
            snapshot: await getFamilySnapshot(store, f.family, now),
          };
        } catch (err) {
          return {
            family: f.family,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );
    const skillChanges = await getSkillChanges({
      repoDir: config.skillRepoDir,
      now,
    });
    return {
      window,
      now,
      status,
      pnl,
      banner,
      skillChanges,
      skillRepoConfigured: config.skillRepoDir !== null,
      snapshots,
    };
  } finally {
    store.close();
  }
}