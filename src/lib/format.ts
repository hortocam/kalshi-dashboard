/**
 * Number formatting for dashboard display (P3).
 *
 * realized_pnl is stored in dollars with sub-cent precision (e.g. −5.001):
 * the spec's acceptance number (SC-004) is −$5.001, so P&L renders with 3
 * decimals — more would invent precision the store does not carry, less
 * would fail SC-004. Pure functions; no store access.
 */

/** USD with 3 decimals; the −0 rounding artifact is normalized to 0. */
export function formatUsd3(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${Math.abs(rounded).toFixed(3)}`;
}

/** Signed USD with 3 decimals; positive values carry an explicit '+'. */
export function formatSignedUsd3(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded > 0) return `+$${rounded.toFixed(3)}`;
  return formatUsd3(rounded);
}

/** Price display: up to 4 decimals, trailing zeros trimmed (no rounding). */
export function formatPrice(value: number): string {
  const s = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" ? "0" : s;
}

/** Ratio in [0,1] as a percent string with one decimal (0.66666 -> 66.7%). */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Probability in [0,1] as a percent string with one decimal (0.74 -> 74.0%). */
export function formatProbability(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}