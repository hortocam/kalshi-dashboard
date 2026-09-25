/**
 * Homepage — the four-section project summary (US1, FR-001..FR-004,
 * FR-016/017, T020-T026).
 *
 * Server component: every read goes through lib/home-data.ts → the P2 data
 * layer (openStore + the store/* query functions). No SQL here, no direct
 * node:sqlite anywhere in app code, no store writes (FR-011: a lens, not an
 * actor). Store failures render their dedicated UI states (SC-005) in
 * production; in dev they throw so failures stay visible while developing.
 *
 * Page-module exports stay Next-safe: only the default component plus the
 * plain helper objects the P3 render tests re-export for unit assertions.
 */
import Link from "next/link";

import {
  FamilyCardFailure,
  FamilyCardGrid,
  type FamilySnapshot,
} from "@/components/family-card";
import {
  directionLabel,
  edgeLabel,
  renderAsOfText,
  renderStaleCount,
} from "@/lib/banner-view";
import { formatPrice, formatSignedUsd3, formatUsd3 } from "@/lib/format";
import { loadHomepageData, type HomepageData } from "@/lib/home-data";
import { deserializeHomepageData, serializeHomepageData } from "@/lib/payload";
import type { BannerEntry } from "@/lib/store/banner";
import type { Window } from "@/lib/store/observations";
import {
  SchemaMismatchError,
  StoreError,
  StoreMissingError,
} from "@/lib/store/open";
import {
  parseWindow,
  WINDOW_LABELS,
  WINDOW_OPTIONS,
} from "@/lib/windows";

/**
 * Rethrow gate for store failures. Rendered failure states (SC-005) are the
 * production behaviour; in dev — and in any process that opts in via
 * KALSHI_DEBUG_STORE_ERRORS — the raw error propagates instead, so a broken
 * store fails loudly while developing and in dedicated failure-state tests.
 */
function storeErrorRethrow(): boolean {
  if (process.env.KALSHI_DEBUG_STORE_ERRORS === "1") return true;
  return process.env.NODE_ENV === "development";
}

export interface HomeProps {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}

export default async function Home(props: HomeProps) {
  const sp = (await props.searchParams) ?? {};
  const window = parseWindow(typeof sp.window === "string" ? sp.window : undefined);
  try {
    const data = await loadHomepageData(window);
    return <HomepageView data={data} />;
  } catch (err) {
    if (storeErrorRethrow()) {
      // Dev/test: surface the real error (Next dev overlay / failing test).
      throw err;
    }
    return <StoreStateView error={err} />;
  }
}

function WindowSelector({ selected }: { selected: Window }) {
  return (
    <nav aria-label="P&L window" className="flex gap-1">
      {WINDOW_OPTIONS.map((w) => (
        <Link
          key={w}
          href={`/?window=${w}`}
          data-window={w}
          data-window-selected={w === selected ? w : undefined}
          className={
            w === selected
              ? "rounded border px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground"
              : "rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          }
        >
          {WINDOW_LABELS[w]}
        </Link>
      ))}
    </nav>
  );
}

function PnlCard({ data }: { data: HomepageData }) {
  const { pnl } = data;
  return (
    <section
      data-testid="pnl-card"
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold">overall P&L</h2>
        <WindowSelector selected={data.window} />
      </div>
      <div data-testid="pnl-total" className="font-mono text-3xl font-semibold">
        {formatUsd3(pnl.totalRealized)}
      </div>
      <div className="text-xs text-muted-foreground">realized P&L</div>

      {pnl.realized.length === 0 ? (
        <p
          data-testid="pnl-realized-empty"
          className="text-xs text-muted-foreground"
        >
          no realized positions
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {pnl.realized.map((p) => (
            <div key={p.id} className="font-mono text-xs">
              {p.marketTicker} {p.side} ×{formatPrice(p.contracts)} @{" "}
              {formatPrice(p.fillPrice)} fee {formatPrice(p.fee)} ={" "}
              {formatSignedUsd3(p.realizedPnl)} (settled{" "}
              {p.settledAt.slice(0, 19)}Z)
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        open positions (unrealized)
      </div>
      {pnl.open.length === 0 ? (
        <p
          data-testid="pnl-open-empty"
          className="text-xs text-muted-foreground"
        >
          no open positions
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-xs">open positions: {pnl.open.length}</p>
          {pnl.open.map((p) => (
            <div key={p.id} className="font-mono text-xs">
              {p.marketTicker} {p.side} ×{formatPrice(p.contracts)} @{" "}
              {formatPrice(p.fillPrice)}{" "}
              {p.mark === null
                ? `mark unavailable (${p.markNote ?? "unavailable"})`
                : `unrealized mark ${formatSignedUsd3(p.mark)} (mark ${formatUsd3(
                    p.markQuote as number
                  )})`}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BannerCard({ banner }: { banner: BannerEntry[] }) {
  return (
    <section
      data-testid="banner-card"
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-2"
    >
      <h2 className="text-sm font-semibold">latest daily recommendations</h2>
      {banner.length === 0 ? (
        <p
          data-testid="banner-empty"
          className="text-xs text-muted-foreground"
        >
          no recommendations yet
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {banner.map((entry) => {
            const edge = edgeLabel(entry.edgePoints, entry.direction);
            return (
              <div
                key={entry.predictionId}
                data-testid={`banner-entry-${entry.family}`}
              >
                <div className="text-xs">
                  <span className="font-semibold">{entry.family}</span>
                  {" — "}
                  {directionLabel(
                    entry.direction,
                    entry.pYes,
                    entry.pointForecast
                  )}
                  {edge === null ? null : <span>, {edge}</span>}
                  {entry.targetDate === null ? null : (
                    <span>, target {entry.targetDate}</span>
                  )}
                  {" — "}
                  <span
                    data-testid={`banner-state-${entry.family}`}
                    className={
                      entry.traded ? "text-primary" : "text-muted-foreground"
                    }
                  >
                    {entry.traded ? "traded" : "no position taken"}
                  </span>
                </div>
                {entry.rationale === null ? null : (
                  <p className="text-xs text-muted-foreground">
                    {entry.rationale}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SkillChangesCard({ data }: { data: HomepageData }) {
  return (
    <section
      data-testid="skill-changes-card"
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-2"
    >
      <h2 className="text-sm font-semibold">skill changes</h2>
      {data.skillChanges.length === 0 ? (
        <p
          data-testid="skill-changes-empty"
          className="text-xs text-muted-foreground"
        >
          skill changes unavailable
          {data.skillRepoConfigured
            ? " (no commits in the last 30 days, or the configured path is not a git repo)"
            : " (KALSHI_SKILL_REPO_DIR not configured)"}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {data.skillChanges.map((c) => (
            <div key={c.hash} className="text-xs flex gap-2">
              <span className="text-muted-foreground">{c.date}</span>
              <span className="font-mono">{c.hash.slice(0, 7)}</span>
              <span>{c.subject}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Store failure states (T026, SC-005): dedicated UI per StoreError kind —
 * never a stack trace, never guessed data. The JSON envelope
 * (serialize/deserialize contract) carries machine-readable diagnostics.
 */
function errorKind(error: unknown): string {
  if (error instanceof StoreMissingError) return "StoreMissingError";
  if (error instanceof SchemaMismatchError) return "SchemaMismatchError";
  return "StoreUnavailableError";
}

function StoreStateView({ error }: { error: unknown }) {
  if (error instanceof SchemaMismatchError) {
    const payload = deserializeHomepageData(
      serializeHomepageData({ kind: "SchemaMismatchError", found: error.found })
    ) as { kind: string };
    return (
      <div
        data-testid="store-schema-mismatch"
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
        <span data-testid="store-error-payload">{payload.kind}</span>
      </div>
    );
  }
  const detail =
    error instanceof StoreError
      ? error.message
      : "unknown error opening the store";
  const payload = deserializeHomepageData(
    serializeHomepageData({ kind: errorKind(error), message: detail })
  ) as { kind: string };
  return (
    <div
      data-testid="store-not-available"
      className="p-4 flex flex-col gap-2"
    >
      <h2 className="text-sm font-semibold text-destructive">
        store not available
      </h2>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <span data-testid="store-error-payload">{payload.kind}</span>
    </div>
  );
}

function HomepageView({ data }: { data: HomepageData }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Kalshi Research Dashboard
        </h1>
        <div className="text-xs text-muted-foreground flex gap-3">
          <span data-testid="as-of">{renderAsOfText(data.status)}</span>
          <span data-testid="stale-count">
            {renderStaleCount(data.status.staleCount)}
          </span>
        </div>
      </div>

      <PnlCard data={data} />

      <BannerCard banner={data.banner} />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">market families</h2>
        <FamilyCardGrid
          snapshots={
            data.snapshots
              .map((s) => s.snapshot)
              .filter((s): s is FamilySnapshot => s !== undefined)
          }
        />
        {data.snapshots
          .filter((s) => s.error !== undefined)
          .map((s) => (
            <FamilyCardFailure
              key={s.family}
              family={s.family}
              message={s.error as string}
            />
          ))}
      </section>

      <SkillChangesCard data={data} />
    </div>
  );
}