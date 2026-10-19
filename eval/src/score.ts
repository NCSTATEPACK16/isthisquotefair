import { reconcile, validateOutgoing, type Extraction } from "@itqf/core";
import type { Label } from "./label.ts";

export const AMOUNT_TOLERANCE = 0.01;

export interface LineMatch {
  label: Label["line_items"][number];
  predicted: Extraction["line_items"][number] | null;
  amountOk: boolean;
  keyOk: boolean;
}

export interface CaseScore {
  id: string;
  labelCount: number;
  predictedCount: number;
  /** Label lines with a predicted line of the same amount (±$0.01). */
  amountMatched: number;
  /** ...that also got the right taxonomy key. This is what "line-item accuracy" counts. */
  correct: number;
  matches: LineMatch[];
  extraPredicted: Extraction["line_items"];
  totalMatches: boolean;
  internallyReconciles: boolean;
  /** §11 "total reconciliation": printed total read correctly AND Σ lines + tax = total. */
  totalReconciled: boolean;
  piiLeaks: string[];
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1));
function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Matches each labeled line to at most one predicted line. A candidate must have the same amount;
 * ties are broken by taxonomy key, then description similarity. Lines are matched in amount order
 * across the whole invoice so duplicates (two $25 fees) pair up deterministically.
 */
export function matchLines(label: Label, predicted: Extraction["line_items"]): { matches: LineMatch[]; extra: Extraction["line_items"] } {
  const used = new Set<number>();
  const matches: LineMatch[] = label.line_items.map((l) => {
    let best = -1;
    let bestScore = -1;
    predicted.forEach((p, i) => {
      if (used.has(i) || Math.abs(p.line_total - l.line_total) > AMOUNT_TOLERANCE) return;
      const score = (p.taxonomy_key === l.taxonomy_key ? 10 : 0) + similarity(p.description, l.description);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best < 0) return { label: l, predicted: null, amountOk: false, keyOk: false };
    used.add(best);
    const p = predicted[best]!;
    return { label: l, predicted: p, amountOk: true, keyOk: p.taxonomy_key === l.taxonomy_key };
  });
  return { matches, extra: predicted.filter((_, i) => !used.has(i)) };
}

export function scoreCase(id: string, label: Label, extraction: Extraction, vendorNameTransient: string | null): CaseScore {
  const { matches, extra } = matchLines(label, extraction.line_items);
  const totalMatches = extraction.total != null && Math.abs(extraction.total - label.total) <= AMOUNT_TOLERANCE;
  const internallyReconciles = reconcile(extraction).reconciles;

  const v = validateOutgoing(extraction, { vendorName: vendorNameTransient });
  const serialized = JSON.stringify(extraction).toLowerCase();
  const piiLeaks = [
    ...v.pii.map((f) => `${f.kind} at ${f.path}: ${f.match}`),
    ...label.must_not_contain.filter((s) => serialized.includes(s.toLowerCase())).map((s) => `must_not_contain: ${s}`),
  ];

  return {
    id,
    labelCount: label.line_items.length,
    predictedCount: extraction.line_items.length,
    amountMatched: matches.filter((m) => m.amountOk).length,
    correct: matches.filter((m) => m.keyOk).length,
    matches,
    extraPredicted: extra,
    totalMatches,
    internallyReconciles,
    totalReconciled: totalMatches && internallyReconciles,
    piiLeaks,
  };
}

export interface Thresholds {
  lineItemAccuracy: number;
  totalReconciliation: number;
  maxPiiLeaks: number;
}
/** §11 / §13 launch bar. */
export const LAUNCH_THRESHOLDS: Thresholds = { lineItemAccuracy: 0.95, totalReconciliation: 1, maxPiiLeaks: 0 };

export interface Summary {
  cases: number;
  failedCases: number;
  /** Σ correct / Σ max(label lines, predicted lines) — extra or missing lines both count against it. */
  lineItemAccuracy: number;
  amountAccuracy: number;
  keyAccuracyOnMatched: number;
  totalReconciliation: number;
  piiLeaks: number;
  passes: boolean;
}

export function summarize(scores: readonly CaseScore[], failedCases: number, t: Thresholds = LAUNCH_THRESHOLDS): Summary {
  const denom = scores.reduce((a, s) => a + Math.max(s.labelCount, s.predictedCount), 0);
  const correct = scores.reduce((a, s) => a + s.correct, 0);
  const amount = scores.reduce((a, s) => a + s.amountMatched, 0);
  const cases = scores.length + failedCases;
  // A case that errored out counts as a reconciliation failure, not as missing data.
  const lineItemAccuracy = denom ? correct / denom : 0;
  const totalReconciliation = cases ? scores.filter((s) => s.totalReconciled).length / cases : 0;
  const piiLeaks = scores.reduce((a, s) => a + s.piiLeaks.length, 0);
  return {
    cases,
    failedCases,
    lineItemAccuracy,
    amountAccuracy: denom ? amount / denom : 0,
    keyAccuracyOnMatched: amount ? correct / amount : 0,
    totalReconciliation,
    piiLeaks,
    passes:
      cases > 0 &&
      failedCases === 0 &&
      lineItemAccuracy >= t.lineItemAccuracy &&
      totalReconciliation >= t.totalReconciliation &&
      piiLeaks <= t.maxPiiLeaks,
  };
}
