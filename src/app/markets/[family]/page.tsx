/**
 * Per-market scorecard page (US2 / Phase P4, T030-T036). One route per
 * tracked family: `/markets/[family]`. Every read goes through
 * lib/scorecard-data.ts → the P2/P3 data layer (openStore + the store/*
 * query functions); no SQL here, no direct node:sqlite anywhere in app
 * code, no store writes (FR-011).
 *
 * Reachability (T030, SC-002): the sidebar's per-family nav entry (FR-015)
 * and the homepage's family-card link (FR-002) both already link here.
 *
 * Failure states (SC-005, T026-style): the store-error hierarchy is
 * re-thrown in dev / KALSHI_DEBUG_STORE_ERRORS=1, otherwise each kind
 * renders its dedicated UI state — same convention as the homepage.
 *
 * Family validation (T036): an unknown family renders a "no data" state
 * for every section — not a 404 (the spec: pages must render zero states
 * rather than empty charts or exceptions).
 */
import Link from "next/link";

import { CallOutsCard } from "@/components/cards/call-outs-card";
import { HistoricalChartCard } from "@/components/cards/historical-chart-card";
import { PositionsHistoryCard } from "@/components/cards/positions-history-card";
import { RecommendationsListCard } from "@/components/cards/recommendations-list-card";
import { ScoreboardCard } from "@/components/cards/scoreboard-card";
import { renderAsOfText } from "@/lib/banner-view";
import { loadScorecardData, type ScorecardData } from "@/lib/scorecard-data";
import {
  SchemaMismatchError,
  StoreError,
  StoreMissingError,
} from "@/lib/store/open";
import { parseWindow } from "@/lib/windows";

/**
 * Rethrow gate for store failures — identical to the homepage's policy.
 * Production hides them in the failure state; dev / opt-in env re-throws.
 */
function storeErrorRethrow(): boolean {
  if (process.env.KALSHI_DEBUG_STORE_ERRORS === "1") return true;
  return process.env.NODE_ENV === "development";
}

export interface ScorecardProps {
  readonly params?: Promise<{ family: string }>;
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}

export default async function ScorecardPage(props: ScorecardProps) {
  const sp = (await props.searchParams) ?? {};
  const params = (await props.params) ?? { family: "" };
  const family = decodeURIComponent(params.family);
  const window = parseWindow(typeof sp.window === "string" ? sp.window : undefined);

  try {
    const data = await loadScorecardData(family, window);
    return <ScorecardView data={data} />;
  } catch (err) {
    if (storeErrorRethrow()) {
      throw err;
    }
    return <StoreStateView error={err} family={family} />;
  }
}

function Header({ data }: { data: ScorecardData }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-2">
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← overview
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{data.family}</h1>
      </div>
      <div className="text-xs text-muted-foreground flex gap-3">
        <span data-testid={`as-of-${data.family}`}>{renderAsOfText(data.status)}</span>
      </div>
    </div>
  );
}

function ScorecardView({ data }: { data: ScorecardData }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Header data={data} />
      {!data.familyExists ? (
        <p
          data-testid={`scorecard-unknown-${data.family}`}
          className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 text-sm text-muted-foreground"
        >
          no data for {data.family} (family not in the store)
        </p>
      ) : null}
      <ScoreboardCard family={data.family} board={data.scoreboard} />
      <HistoricalChartCard
        family={data.family}
        window={data.window}
        points={data.series}
      />
      <RecommendationsListCard
        family={data.family}
        entries={data.recommendations}
      />
      <PositionsHistoryCard family={data.family} pnl={data.pnl} />
      <CallOutsCard family={data.family} callOuts={data.callOuts} />
    </div>
  );
}

function errorKind(error: unknown): string {
  if (error instanceof StoreMissingError) return "StoreMissingError";
  if (error instanceof SchemaMismatchError) return "SchemaMismatchError";
  return "StoreUnavailableError";
}

function StoreStateView({
  error,
  family,
}: {
  error: unknown;
  family: string;
}) {
  if (error instanceof SchemaMismatchError) {
    return (
      <div
        data-testid={`store-schema-mismatch-${family}`}
        className="p-4 flex flex-col gap-2"
      >
        <h2 className="text-sm font-semibold text-destructive">
          store schema version mismatch
        </h2>
        <p className="text-sm text-muted-foreground">
          The research store reports schema version {error.found}; this
          dashboard supports version {error.supported.join(", ")}. No data is
          rendered from an unsupported schema.
        </p>
      </div>
    );
  }
  const detail =
    error instanceof StoreError
      ? error.message
      : "unknown error opening the store";
  return (
    <div
      data-testid={`store-not-available-${family}`}
      className="p-4 flex flex-col gap-2"
    >
      <h2 className="text-sm font-semibold text-destructive">
        store not available
      </h2>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <span className="font-mono text-xs">{errorKind(error)}</span>
    </div>
  );
}
