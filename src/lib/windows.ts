/**
 * P&L window vocabulary (FR-001): the four selectable windows and their
 * labels. Re-exported Window type from the store module keeps one source
 * of truth; the P2 golden tests pin the window arithmetic.
 */
import type { Window } from "@/lib/store/observations";

export type { Window };

/** Selector options (FR-001): 7d / 30d / 90d / all-time. */
export const WINDOW_OPTIONS = ["7d", "30d", "90d", "all"] as const;

/** Default window (FR-001): 30d. */
export const DEFAULT_WINDOW: Window = "30d";

/** Human labels for the selector. */
export const WINDOW_LABELS: Record<Window, string> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  all: "all-time",
};

/** Parse a raw ?window= value into a Window; anything else -> default. */
export function parseWindow(raw: unknown): Window {
  return (WINDOW_OPTIONS as readonly string[]).includes(raw as string)
    ? (raw as Window)
    : DEFAULT_WINDOW;
}