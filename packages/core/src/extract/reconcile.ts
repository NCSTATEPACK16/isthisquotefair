import { round2 } from "../compare/stats.ts";
import type { Extraction } from "./schema.ts";

/** Dollars of slack for rounding on printed invoices. */
export const RECONCILE_TOLERANCE = 0.05;

export interface Reconciliation {
  reconciles: boolean;
  lineSum: number;
  expectedTotal: number | null;
  diff: number | null;
}

/** Internal consistency: Σ line_total + tax should equal the printed total. */
export function reconcile(x: Pick<Extraction, "line_items" | "tax" | "total">): Reconciliation {
  const lineSum = round2(x.line_items.reduce((a, l) => a + l.line_total, 0));
  if (x.total == null) return { reconciles: false, lineSum, expectedTotal: null, diff: null };
  const diff = round2(lineSum + (x.tax ?? 0) - x.total);
  return { reconciles: Math.abs(diff) <= RECONCILE_TOLERANCE, lineSum, expectedTotal: x.total, diff };
}
