/**
 * Deterministic verdict math (§8 step 4). The LLM never touches these numbers.
 *
 * Prices are compared per taxonomy *unit* (job / hour / each / month): unit price = line_total / qty.
 */
import type { Confidence, Flag } from "../types.ts";
import { UNCLASSIFIED } from "../types.ts";
import { median, percentileRank, quantile, round2 } from "./stats.ts";

export interface BenchmarkSource {
  low: number;
  typical: number;
  high: number;
  url: string;
}

export interface CompareLineInput {
  key: string; // taxonomy key or "unclassified"
  description: string;
  qty: number;
  lineTotal: number;
}

export interface CompareContext {
  /** Benchmark sources for this key + county (already filtered to non-expired). */
  benchmarks: readonly BenchmarkSource[];
  /** Unit prices from opted-in invoices, same key + county, last 24 months. */
  contributedUnitPrices: readonly number[];
}

export interface Range {
  low: number;
  typical: number;
  high: number;
  basis: "benchmarks" | "blended" | "contributed";
}

export interface LineResult {
  key: string;
  description: string;
  unitPrice: number;
  flag: Flag;
  range: Range | null;
  pctVsMedian: number | null;
  percentile: number | null;
  confidence: Confidence | null;
  benchmarkCount: number;
  contributedCount: number;
  sourceUrls: string[];
}

export interface Verdict {
  flag: Flag;
  pctVsMedian: number | null;
  confidence: Confidence | null;
  lines: LineResult[];
  comparedTotal: number;
  typicalTotal: number | null;
  benchmarkSourceCount: number;
  contributedInvoiceCount: number;
}

export const CONTRIBUTED_WEIGHT_MIN_N = 10;
/** Weight given to contributed invoices once n ≥ 10 (benchmarks get the rest). */
export const CONTRIBUTED_WEIGHT = 0.7;

export function confidenceFor(benchmarkCount: number, contributedCount: number): Confidence {
  if (contributedCount >= 10 && benchmarkCount >= 2) return "high";
  if (benchmarkCount >= 2 || contributedCount >= 3) return "medium";
  return "low";
}

const CONF_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function buildRange(ctx: CompareContext): Range | null {
  const b = ctx.benchmarks;
  const c = ctx.contributedUnitPrices;
  const bench =
    b.length > 0
      ? { low: median(b.map((x) => x.low)), typical: median(b.map((x) => x.typical)), high: median(b.map((x) => x.high)) }
      : null;
  const contrib =
    c.length >= CONTRIBUTED_WEIGHT_MIN_N ? { low: quantile(c, 0.25), typical: quantile(c, 0.5), high: quantile(c, 0.75) } : null;

  if (bench && contrib) {
    const w = CONTRIBUTED_WEIGHT;
    const mix = (k: "low" | "typical" | "high") => w * contrib[k] + (1 - w) * bench[k];
    return { low: mix("low"), typical: mix("typical"), high: mix("high"), basis: "blended" };
  }
  if (bench) return { ...bench, basis: "benchmarks" };
  if (contrib) return { ...contrib, basis: "contributed" };
  return null;
}

export function flagFor(price: number, range: Range): Exclude<Flag, "insufficient_data" | "unclassified"> {
  if (price < range.low) return "below";
  if (price > range.high) return "above";
  return "within";
}

export function compareLine(line: CompareLineInput, ctx: CompareContext | undefined): LineResult {
  const qty = line.qty > 0 ? line.qty : 1;
  const unitPrice = round2(line.lineTotal / qty);
  const base = { key: line.key, description: line.description, unitPrice };
  const benchmarkCount = ctx?.benchmarks.length ?? 0;
  const contributedCount = ctx?.contributedUnitPrices.length ?? 0;
  const empty = {
    range: null,
    pctVsMedian: null,
    percentile: null,
    confidence: null,
    benchmarkCount,
    contributedCount,
    sourceUrls: [],
  };

  if (line.key === UNCLASSIFIED) return { ...base, ...empty, flag: "unclassified" };
  const range = ctx ? buildRange(ctx) : null;
  if (!ctx || !range) return { ...base, ...empty, flag: "insufficient_data" };

  return {
    ...base,
    flag: flagFor(unitPrice, range),
    range: { ...range, low: round2(range.low), typical: round2(range.typical), high: round2(range.high) },
    pctVsMedian: round2(((unitPrice - range.typical) / range.typical) * 100),
    percentile: contributedCount > 0 ? round2(percentileRank(ctx.contributedUnitPrices, unitPrice)) : null,
    confidence: confidenceFor(benchmarkCount, contributedCount),
    benchmarkCount,
    contributedCount,
    sourceUrls: [...new Set(ctx.benchmarks.map((s) => s.url))],
  };
}

/**
 * Invoices often split one job into parts + labor (+ fee) lines under the same taxonomy key, while
 * benchmarks price the whole job. Lines sharing a key are merged into one comparison: totals are
 * summed and qty is the largest printed qty (e.g. "2 outlets" on the parts line, qty 1 on labor).
 * Unclassified lines stay separate. Order follows each key's first appearance.
 */
export function mergeLinesByKey(lines: readonly CompareLineInput[]): CompareLineInput[] {
  const out: CompareLineInput[] = [];
  const byKey = new Map<string, CompareLineInput>();
  for (const l of lines) {
    const prev = l.key === UNCLASSIFIED ? undefined : byKey.get(l.key);
    if (!prev) {
      const copy = { ...l };
      out.push(copy);
      if (l.key !== UNCLASSIFIED) byKey.set(l.key, copy);
      continue;
    }
    prev.lineTotal = round2(prev.lineTotal + l.lineTotal);
    prev.qty = Math.max(prev.qty, l.qty);
    prev.description = `${prev.description} + ${l.description}`;
  }
  return out;
}

/**
 * Overall verdict: merges lines by key (see mergeLinesByKey), then sums the quote's comparable lines (those with a range) against the summed
 * low / typical / high of the same lines, scaled by qty. Overall confidence is the *lowest*
 * confidence among compared lines, so a single thin line can't be hidden by strong ones.
 */
export function compareQuote(rawLines: readonly CompareLineInput[], contexts: ReadonlyMap<string, CompareContext>): Verdict {
  const lines = mergeLinesByKey(rawLines);
  const results = lines.map((l) => compareLine(l, contexts.get(l.key)));
  const compared = results
    .map((r, i) => ({ r, qty: lines[i]!.qty > 0 ? lines[i]!.qty : 1 }))
    .filter(({ r }) => r.range !== null);

  const sources = new Set(results.flatMap((r) => r.sourceUrls));
  const contributedInvoiceCount = Math.max(0, ...results.map((r) => r.contributedCount));

  if (compared.length === 0) {
    return {
      flag: "insufficient_data",
      pctVsMedian: null,
      confidence: null,
      lines: results,
      comparedTotal: 0,
      typicalTotal: null,
      benchmarkSourceCount: sources.size,
      contributedInvoiceCount,
    };
  }

  const sum = (f: (x: (typeof compared)[number]) => number) => compared.reduce((a, x) => a + f(x), 0);
  const total = sum(({ r, qty }) => r.unitPrice * qty);
  const low = sum(({ r, qty }) => r.range!.low * qty);
  const typical = sum(({ r, qty }) => r.range!.typical * qty);
  const high = sum(({ r, qty }) => r.range!.high * qty);
  const confidence = compared
    .map(({ r }) => r.confidence!)
    .reduce((a, c) => (CONF_ORDER[c] < CONF_ORDER[a] ? c : a), "high" as Confidence);

  return {
    flag: flagFor(total, { low, typical, high, basis: "benchmarks" }),
    pctVsMedian: round2(((total - typical) / typical) * 100),
    confidence,
    lines: results,
    comparedTotal: round2(total),
    typicalTotal: round2(typical),
    benchmarkSourceCount: sources.size,
    contributedInvoiceCount,
  };
}
