export function median(xs: readonly number[]): number {
  return quantile(xs, 0.5);
}

/** Linear-interpolated quantile (same as numpy's default / Excel PERCENTILE.INC). */
export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) throw new Error("quantile of empty list");
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** Share of values strictly below x, plus half of ties, in [0, 100]. */
export function percentileRank(xs: readonly number[], x: number): number {
  if (xs.length === 0) throw new Error("percentileRank of empty list");
  let below = 0;
  let equal = 0;
  for (const v of xs) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return ((below + equal / 2) / xs.length) * 100;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
