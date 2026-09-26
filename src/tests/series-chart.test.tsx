/**
 * series-chart.test.ts — T031 chart rendering unit tests. Band rows
 * render as <rect> + midpoint dot; point rows render as <circle>; mixed
 * inputs render exactly the per-date pick the store's source-priority
 * dedupe enforces (a band and a point never both render for the same
 * date — D6). Empty inputs render the explicit "no observations" text.
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

describe("SeriesChart (T031, FR-007 / D6)", () => {
  it("empty points: explicit 'no observations' fallback", () => {
    const html = renderToStaticMarkup(<SeriesChart points={[]} />);
    expect(html).toContain("data-testid=\"series-chart-empty\"");
    expect(html).toContain("no observations");
  });

  it("band-only series: every date renders as a band rectangle + midpoint", () => {
    const points = [
      band("2026-09-22", 6.5, 6.505),
      band("2026-09-23", 6.52, 6.525),
      band("2026-09-24", 6.51, 6.515),
    ];
    const html = renderToStaticMarkup(<SeriesChart points={points} />);
    expect(html).toContain("data-testid=\"series-chart\"");
    expect(html).toMatch(/data-band-count="3"/);
    expect(html).toMatch(/data-point-count="0"/);
    // 3 <rect> bands + 3 <circle> midpoints.
    const rectCount = (html.match(/<rect /g) || []).length;
    const circleCount = (html.match(/<circle /g) || []).length;
    expect(rectCount).toBe(3);
    expect(circleCount).toBe(3);
  });

  it("point-only series: every date renders as a single dot", () => {
    const points = [
      point("2026-09-25", 4.4999),
      point("2026-09-26", 4.5),
    ];
    const html = renderToStaticMarkup(<SeriesChart points={points} />);
    expect(html).toMatch(/data-band-count="0"/);
    expect(html).toMatch(/data-point-count="2"/);
    const rectCount = (html.match(/<rect /g) || []).length;
    const circleCount = (html.match(/<circle /g) || []).length;
    expect(rectCount).toBe(0);
    expect(circleCount).toBe(2);
  });

  it("mixed band + point dates (one row per date) render the right element per row", () => {
    const points = [
      band("2026-09-23", 6.52, 6.525), // band
      point("2026-09-24", 6.51),       // point
    ];
    const html = renderToStaticMarkup(<SeriesChart points={points} />);
    expect(html).toMatch(/data-band-count="1"/);
    expect(html).toMatch(/data-point-count="1"/);
  });

  it("range padding prevents band/point kissing the axes", () => {
    // A wide range so padding has room to act; the lo tick label is below
    // the band's lo value, proving the band does not extend to the axis.
    const points = [
      band("2026-08-01", 4.5, 4.55),
      band("2026-08-02", 4.5, 4.55),
      band("2026-08-03", 4.5, 4.55),
    ];
    const html = renderToStaticMarkup(<SeriesChart points={points} />);
    // At least one tick label is below 4.5 (the band lo).
    expect(html).toMatch(/[34]\.\d{3}/);
    // And at least one tick label is above 4.55 (the band hi).
    const matches = html.match(/[34]\.\d{3}/g) ?? [];
    const labels = matches.map((s) => parseFloat(s));
    expect(Math.min(...labels)).toBeLessThan(4.5);
    expect(Math.max(...labels)).toBeGreaterThan(4.55);
  });
});
