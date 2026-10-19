import { describe, expect, it } from "vitest";
import { buildRange, compareLine, compareQuote, confidenceFor, type BenchmarkSource, type CompareContext } from "../src/compare/index.ts";
import { median, percentileRank, quantile } from "../src/compare/stats.ts";

const src = (low: number, typical: number, high: number, url = `https://example.com/${low}`): BenchmarkSource => ({ low, typical, high, url });
const ctx = (benchmarks: BenchmarkSource[], contributed: number[] = []): CompareContext => ({ benchmarks, contributedUnitPrices: contributed });

describe("stats", () => {
  it("median / quantile interpolate", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(() => median([])).toThrow();
  });
  it("percentileRank counts half of ties", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(62.5);
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
    expect(percentileRank([1, 2, 3, 4], 9)).toBe(100);
  });
});

describe("confidenceFor (§8 step 4)", () => {
  it.each([
    [2, 10, "high"],
    [1, 10, "medium"], // n ≥ 3 but < 2 benchmarks
    [2, 9, "medium"],
    [2, 0, "medium"],
    [0, 3, "medium"],
    [1, 2, "low"],
    [0, 0, "low"],
  ] as const)("benchmarks=%i contributed=%i → %s", (b, c, want) => {
    expect(confidenceFor(b, c)).toBe(want);
  });
});

describe("buildRange", () => {
  it("uses median of benchmark sources when n < 10", () => {
    const r = buildRange(ctx([src(100, 200, 300), src(200, 300, 500), src(150, 250, 400)], [1, 2, 3]));
    expect(r).toEqual({ low: 150, typical: 250, high: 400, basis: "benchmarks" });
  });
  it("blends contributed (weighted 0.7) once n ≥ 10", () => {
    const contributed = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190]; // p25=122.5 p50=145 p75=167.5
    const r = buildRange(ctx([src(200, 300, 400)], contributed))!;
    expect(r.basis).toBe("blended");
    expect(r.typical).toBeCloseTo(0.7 * 145 + 0.3 * 300);
    expect(r.low).toBeCloseTo(0.7 * 122.5 + 0.3 * 200);
  });
  it("falls back to contributed-only with no benchmarks but n ≥ 10", () => {
    expect(buildRange(ctx([], Array.from({ length: 10 }, (_, i) => 100 + i)))?.basis).toBe("contributed");
  });
  it("returns null with zero benchmarks and n < 10 (never guesses)", () => {
    expect(buildRange(ctx([], [100, 200]))).toBeNull();
  });
});

describe("compareLine", () => {
  const c = ctx([src(300, 450, 600), src(350, 500, 700)]);
  it("flags above / within / below on unit price", () => {
    expect(compareLine({ key: "auto.brakes.front_pads_rotors", description: "x", qty: 1, lineTotal: 900 }, c).flag).toBe("above");
    expect(compareLine({ key: "auto.brakes.front_pads_rotors", description: "x", qty: 1, lineTotal: 500 }, c).flag).toBe("within");
    expect(compareLine({ key: "auto.brakes.front_pads_rotors", description: "x", qty: 1, lineTotal: 200 }, c).flag).toBe("below");
  });
  it("divides by qty to get unit price", () => {
    const r = compareLine({ key: "k", description: "x", qty: 2, lineTotal: 950 }, c);
    expect(r.unitPrice).toBe(475);
    expect(r.flag).toBe("within");
    expect(r.pctVsMedian).toBe(0);
  });
  it("range boundaries are inclusive", () => {
    expect(compareLine({ key: "k", description: "x", qty: 1, lineTotal: 325 }, c).flag).toBe("within");
    expect(compareLine({ key: "k", description: "x", qty: 1, lineTotal: 650 }, c).flag).toBe("within");
  });
  it("unclassified lines never get a verdict", () => {
    const r = compareLine({ key: "unclassified", description: "x", qty: 1, lineTotal: 10 }, c);
    expect(r).toMatchObject({ flag: "unclassified", range: null, confidence: null });
  });
  it("no data → insufficient_data, not a guess", () => {
    expect(compareLine({ key: "k", description: "x", qty: 1, lineTotal: 10 }, undefined).flag).toBe("insufficient_data");
    expect(compareLine({ key: "k", description: "x", qty: 1, lineTotal: 10 }, ctx([], [5])).flag).toBe("insufficient_data");
  });
  it("treats qty ≤ 0 as 1 and dedupes source URLs", () => {
    const r = compareLine({ key: "k", description: "x", qty: 0, lineTotal: 500 }, ctx([src(1, 2, 3, "u"), src(1, 2, 3, "u")]));
    expect(r.unitPrice).toBe(500);
    expect(r.sourceUrls).toEqual(["u"]);
  });
  it("reports percentile only when contributed data exists", () => {
    expect(compareLine({ key: "k", description: "x", qty: 1, lineTotal: 500 }, c).percentile).toBeNull();
    expect(compareLine({ key: "k", description: "x", qty: 1, lineTotal: 500 }, ctx([src(1, 2, 3)], [100, 600])).percentile).toBe(50);
  });
});

describe("compareQuote", () => {
  const contexts = new Map<string, CompareContext>([
    ["a", ctx([src(100, 150, 200), src(100, 150, 200)])], // medium
    ["b", ctx([src(40, 50, 60)])], // low (1 source)
  ]);
  it("sums compared lines and excludes unclassified / no-data lines", () => {
    const v = compareQuote(
      [
        { key: "a", description: "a", qty: 1, lineTotal: 260 },
        { key: "b", description: "b", qty: 2, lineTotal: 100 },
        { key: "unclassified", description: "shop rag", qty: 1, lineTotal: 9999 },
        { key: "zzz", description: "no data", qty: 1, lineTotal: 9999 },
      ],
      contexts,
    );
    // total = 260 + 100 = 360; typical = 150 + 2*50 = 250; high = 200 + 120 = 320
    expect(v.comparedTotal).toBe(360);
    expect(v.typicalTotal).toBe(250);
    expect(v.flag).toBe("above");
    expect(v.pctVsMedian).toBe(44);
    expect(v.confidence).toBe("low"); // weakest line wins
    expect(v.lines.map((l) => l.flag)).toEqual(["above", "within", "unclassified", "insufficient_data"]);
    expect(v.benchmarkSourceCount).toBe(2);
  });
  it("returns insufficient_data overall when nothing is comparable", () => {
    const v = compareQuote([{ key: "zzz", description: "x", qty: 1, lineTotal: 1 }], contexts);
    expect(v).toMatchObject({ flag: "insufficient_data", pctVsMedian: null, confidence: null });
  });
});
