/**
 * §8 step 3 helpers: query building and the anti-hallucination check that turns search evidence
 * into benchmark sources. Every number we store must be visible in an excerpt from its URL.
 */
import { z } from "zod";
import type { BenchmarkSource } from "../compare/index.ts";
import type { County } from "../geo/counties.ts";
import type { SearchEvidence } from "../providers/search.ts";
import type { TaxonomyService } from "../taxonomy/schema.ts";

export const BENCHMARK_TTL_DAYS = 30;
export const CONTRIBUTED_LOOKBACK_MONTHS = 24;
export const MAX_SEARCHES_PER_KEY = 3;

const COUNTY_SEAT: Record<string, string> = { "37183": "Raleigh", "37085": "Lillington", "37101": "Smithfield" };

export function buildQueries(service: TaxonomyService, county: County, year: number): string[] {
  const city = COUNTY_SEAT[county.fips] ?? county.name;
  return [`${service.search_hint} cost ${city} ${county.state} ${year}`, `${service.search_hint} price ${county.name} County ${county.state}`].slice(
    0,
    MAX_SEARCHES_PER_KEY,
  );
}

/** Structured-output schema for pulling price figures out of evidence excerpts. */
export const PriceQuotesSchema = z.object({
  quotes: z.array(
    z.object({
      url: z.string().describe("Must be one of the evidence URLs"),
      low: z.number().nullable(),
      typical: z.number().nullable(),
      high: z.number().nullable(),
      unit_matches: z.boolean().describe("True only if the figure is for the same unit (per job / hour / each / month) as requested"),
    }),
  ),
});
export type PriceQuote = z.infer<typeof PriceQuotesSchema>["quotes"][number];

/** All the ways a number might be printed: 1200, 1,200, 1200.00, $1.2k. */
function numberForms(n: number): string[] {
  const forms = new Set<string>();
  const fixed = n.toFixed(2);
  forms.add(fixed);
  if (Number.isInteger(n)) forms.add(String(n));
  forms.add(n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
  forms.add(n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  if (n >= 1000 && n % 100 === 0) forms.add(`${n / 1000}k`);
  return [...forms];
}

export function numberAppearsIn(n: number, text: string): boolean {
  const hay = text.toLowerCase();
  return numberForms(n).some((f) => new RegExp(`(?<![\\d.,])${f.replace(/[.,]/g, "\\$&")}(?![\\d]|[.,]\\d)`).test(hay));
}

export interface VerifiedQuotes {
  sources: BenchmarkSource[];
  rejected: { quote: PriceQuote; reason: string }[];
}

/**
 * Keeps only quotes whose URL came back from search, whose unit matches, and whose every figure is
 * printed in that URL's excerpts. Point estimates become a zero-width range.
 */
export function verifyQuotes(quotes: readonly PriceQuote[], evidence: readonly SearchEvidence[]): VerifiedQuotes {
  const byUrl = new Map<string, string>();
  for (const e of evidence) byUrl.set(e.url, `${byUrl.get(e.url) ?? ""}\n${e.excerpt}`);
  const sources: BenchmarkSource[] = [];
  const rejected: VerifiedQuotes["rejected"] = [];

  for (const q of quotes) {
    const text = byUrl.get(q.url);
    const nums = [q.low, q.typical, q.high].filter((x): x is number => x != null);
    const reason = !text
      ? "url not in search results"
      : !q.unit_matches
        ? "unit mismatch"
        : nums.length === 0
          ? "no figures"
          : nums.some((n) => n <= 0)
            ? "non-positive figure"
            : nums.find((n) => !numberAppearsIn(n, text)) !== undefined
              ? "figure not found in excerpt"
              : null;
    if (reason) {
      rejected.push({ quote: q, reason });
      continue;
    }
    const low = q.low ?? q.typical ?? q.high!;
    const high = q.high ?? q.typical ?? q.low!;
    const typical = q.typical ?? (low + high) / 2;
    if (!(low <= typical && typical <= high)) {
      rejected.push({ quote: q, reason: "low/typical/high out of order" });
      continue;
    }
    sources.push({ low, typical, high, url: q.url });
  }
  return { sources, rejected };
}
