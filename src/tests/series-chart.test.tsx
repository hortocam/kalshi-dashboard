/**
 * series-chart.test.tsx — T031 chart rendering unit tests, adapted for the
 * Recharts migration (T043). Recharts renders most of its SVG through
 * ResponsiveContainer, which is not present in the server-rendered HTML,
 * so the test surface shifts from counting `<rect>` / `<circle>` elements
 * to asserting the semantic data-* attributes and testids the chart
 * exposes on its wrapping figure. The visual contract — band rows render
 * as a band rectangle + midpoint dot, point rows as a single dot — is
 * preserved by the Recharts implementation (ReferenceArea + ReferenceDot
 * for bands, Scatter for points); these tests pin the *semantic contract*
 * the contract spec.md calls out (FR-007, D6), not Recharts' internal
 * SVG layout (which is a third-party detail, not part of our contract).
 *
 * The contract:
 *   - empty points render the explicit "no observations" fallback;
 *   - band-only series: every band row contributes 1 to band count, 0 to
 *     point count (mixed inputs are pinned: the store's source-priority
 *     dedupe already guarantees one row per date, so band and point never
 *     coexist on the same date);
 *   - point-only series: 0 band count, N point count;
 *   - the component is exported from charts/series-chart and accepts the
 *     pinned SeriesPoint shape from getSeriesWindow().
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SeriesChart } from "@/components/charts/series-chart";
import type { SeriesPoint } from "@/lib/store/observations";

function band(obsDate: string, lo: number, hi: number): SeriesPoint {
  const mid = lo / 2 + hi / 2;
  return {
    obsDate,
    value: null,
    lo,
    hi,
    mid,
    source: "kalshi_settlement",
    quality: "final",
    unit: null,
  };
}

function point(obsDate: string, value: number): SeriesPoint {
  return {
    obsDate,
    value,
    lo: null,
    hi: null,
    mid: null,
    source: "kalshi_expiration_value",
    quality: "final",
    unit: null,
  };
}

describe("SeriesChart (T031, FR-007 / D6, T043 Recharts)", () => {
  it("empty points: explicit 'no observations' fallback", () => {
    const html = renderToStaticMarkup(<SeriesChart points={[]} />);
    expect(html).toContain("data-testid=\"series-chart-empty\"");
    expect(html).toContain("no observations");
  });

  it("band-only series: every date contributes 1 to band count, 0 to point count", () => {
    const points = [
      band("2026-09-22", 6.5, 6.505),
      band("2026-09-23", 6.52, 6.525),
      band("2026-09-24", 6.51, 6.515),
    ];
    const html = renderToStaticMarkup(<SeriesChart points={points} />);
    expect(html).toContain("data-testid=\"series-chart\"");
    expect(html).toMatch(/data-band-count="3"/);
    expect(html).toMatch(/data-point-count="0"/);
  });

  it("point-only series: every date contributes 1 to point count, 0 to band count", () => {
    const points = [
      point("2026-09-25", 4.4999),
      point("2026-09-26", 4.5),
    ];
    const html = renderToStaticMarkup(<SeriesChart points={points} />);
    expect(html).toMatch(/data-band-count="0"/);
    expect(html).toMatch(/data-point-count="2"/);
  });

  it("mixed band + point dates (one row per date) carry the right counts", () => {
    const points = [
      band("2026-09-23", 6.52, 6.525), // band
      point("2026-09-24", 6.51), // point
    ];
    const html = renderToStaticMarkup(<SeriesChart points={points} />);
    expect(html).toMatch(/data-band-count="1"/);
    expect(html).toMatch(/data-point-count="1"/);
  });

  it("the component is exported from charts/series-chart and accepts the pinned SeriesPoint shape", () => {
    // Sanity check: the type contract that getSeriesWindow() produces is
    // exactly what SeriesChart accepts. Pinned so a future chart refactor
    // cannot silently break the contract.
    const sample: SeriesPoint = band("2026-09-24", 6.51, 6.515);
    const html = renderToStaticMarkup(<SeriesChart points={[sample]} />);
    expect(html).toContain("data-testid=\"series-chart\"");
    expect(html).toMatch(/data-band-count="1"/);
  });
});
