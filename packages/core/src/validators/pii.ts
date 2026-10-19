/**
 * Regex sweep for PII on outgoing JSON (§8 step 5). Tuned to over-flag: a false positive costs a
 * redaction, a false negative is a launch blocker. Never weaken a pattern without adding a test.
 */
export type PiiKind = "email" | "phone" | "vin" | "card_number" | "street_address" | "vendor_name";

export interface PiiFinding {
  kind: PiiKind;
  path: string;
  match: string;
}

const SUFFIXES =
  "St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pkwy|Parkway|Hwy|Highway|Cir|Circle|Pl|Place|Ter|Terrace|Trl|Trail|Loop|Run|Pike|Sq|Square";

const PATTERNS: { kind: Exclude<PiiKind, "vendor_name">; re: RegExp; check?: (m: string) => boolean }[] = [
  { kind: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  // 17 chars, no I/O/Q, must mix letters and digits (filters out long words / pure numbers).
  { kind: "vin", re: /\b[A-HJ-NPR-Z0-9]{17}\b/gi, check: (m) => /\d/.test(m) && /[A-Z]/i.test(m) },
  // 13–19 digits, optionally grouped with spaces/dashes. Checked before phone so a card isn't
  // reported as a phone. No Luhn filter on purpose: partial / masked numbers still leak.
  { kind: "card_number", re: /\b\d(?:[ -]?\d){12,18}\b/g },
  // Masked card tails like "XXXX-XXXX-XXXX-1234" or "**** 1234" / "ending in 1234".
  { kind: "card_number", re: /(?:[X*•]{4}[ -]?){1,3}\d{4}\b|\bending in \d{4}\b/gi },
  { kind: "phone", re: /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  // House number + 1–4 words + street suffix, where the suffix ends the phrase (punctuation, end,
  // unit marker, or ZIP). "1 hr labor drive belt" doesn't match because "belt" follows "drive".
  {
    kind: "street_address",
    re: new RegExp(
      String.raw`\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Za-z0-9'.-]+\s+){0,3}[A-Za-z0-9'.-]+\s+(?:${SUFFIXES})\b\.?(?=\s*(?:[,#]|$|\n|(?:Apt|Suite|Ste|Unit)\b|[A-Z][a-z]+,?\s+(?:NC|North Carolina)\b|\d{5}\b))`,
      "gi",
    ),
  },
];

function scanString(s: string, path: string, out: PiiFinding[]) {
  const claimed: [number, number][] = [];
  for (const { kind, re, check } of PATTERNS) {
    for (const m of s.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (claimed.some(([a, b]) => start < b && end > a)) continue;
      if (check && !check(m[0])) continue;
      claimed.push([start, end]);
      out.push({ kind, path, match: m[0] });
    }
  }
}

function walk(v: unknown, path: string, out: PiiFinding[]) {
  if (typeof v === "string") scanString(v, path, out);
  // A phone/card stored as a JSON number would bypass string checks.
  else if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) >= 1e9) scanString(String(v), path, out);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, out);
}

export function findPii(value: unknown): PiiFinding[] {
  const out: PiiFinding[] = [];
  walk(value, "", out);
  return out;
}

/**
 * Finds the (transient) vendor name anywhere in the payload. Case-insensitive, whitespace- and
 * punctuation-tolerant, and also matches the name without a trailing business suffix
 * ("Smith Plumbing LLC" → "Smith Plumbing").
 */
export function findVendorName(value: unknown, vendorName: string | null | undefined): PiiFinding[] {
  const needles = vendorNeedles(vendorName);
  if (needles.length === 0) return [];
  const out: PiiFinding[] = [];
  const visit = (v: unknown, path: string) => {
    if (typeof v === "string") {
      const hay = normalize(v);
      if (needles.some((n) => hay.includes(n))) out.push({ kind: "vendor_name", path, match: v });
    } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, path ? `${path}.${k}` : k);
  };
  visit(value, "");
  return out;
}

const normalize = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const BUSINESS_SUFFIX = /\b(llc|inc|co|corp|company|ltd|pllc|services?|group)\b\.?/gi;

function vendorNeedles(name: string | null | undefined): string[] {
  if (!name) return [];
  const full = normalize(name);
  const short = normalize(name.replace(BUSINESS_SUFFIX, " "));
  // Single very short tokens ("AC", "Bob") would false-positive on everything; require ≥ 4 chars.
  return [...new Set([full, short])].filter((n) => n.trim().length >= 4);
}

/** Replaces vendor-name occurrences in a string with a neutral token. */
export function redactVendor(s: string, vendorName: string | null | undefined): string {
  if (!vendorName) return s;
  let out = s;
  for (const variant of [vendorName, vendorName.replace(BUSINESS_SUFFIX, " ").trim()]) {
    if (variant.length < 4) continue;
    const pattern = variant
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^A-Za-z0-9]+");
    out = out.replace(new RegExp(pattern, "gi"), "[business]");
  }
  return out;
}
