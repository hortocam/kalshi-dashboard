/**
 * Homepage banner display helpers (FR-004, D5). Pure display logic over the
 * store's BannerEntry — no store access, no family-specific branches.
 *
 * The signed-edge rule (kalshi-research): predictions.edge_points is signed
 * for YES calls only, so the edge is shown for up/flat calls and suppressed
 * for NO-side calls (down/no) rather than rendering a misleading sign.
 */
import type { StoreStatus } from "@/lib/store/freshness";
import { formatPercent, formatPrice } from "@/lib/format";

/** Banner line: direction/forecast for the recorded call. */
export function directionLabel(
  direction: string | null,
  pYes: number,
  pointForecast: number | null
): string {
  const p = formatPercent(pYes);
  if (direction === null) {
    return pointForecast === null
      ? `p_yes ${p}`
      : `p_yes ${p}, forecast ${formatPrice(pointForecast)}`;
  }
  return pointForecast === null
    ? `${direction} (${p} YES)`
    : `${direction} (${p} YES, forecast ${formatPrice(pointForecast)})`;
}

/** Edge chip text, or null when the edge must not be shown. */
export function edgeLabel(
  edgePoints: number | null,
  direction: string | null
): string | null {
  if (edgePoints === null) return null;
  if (direction === "down" || direction === "no") return null;
  const pts = (edgePoints * 100).toFixed(1);
  return `edge ${edgePoints >= 0 ? "+" : ""}${pts} pts`;
}

/** As-of line (FR-016): the store's last run start, second precision. */
export function renderAsOfText(status: StoreStatus): string {
  return status.lastRunAt === null
    ? "data as of unknown"
    : `data as of ${status.lastRunAt.slice(0, 19)}Z`;
}

/** Stale-artifact line (FR-017). */
export function renderStaleCount(staleCount: number): string {
  return `stale artifacts: ${staleCount}`;
}