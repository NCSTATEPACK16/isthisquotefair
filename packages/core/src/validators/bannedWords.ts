/**
 * Blocks accusatory language in anything user-facing (§10). The product says "above typical
 * local range", never that someone was scammed. Matching is done on a normalized copy so
 * "Rip-Off", "rip off", "r1p-0ff" and "s c a m" are all caught.
 */
export const BANNED_TERMS = [
  "scam",
  "scams",
  "scammed",
  "scammer",
  "scammy",
  "rip off",
  "ripoff",
  "ripped off",
  "ripping off",
  "fraud",
  "fraudulent",
  "fraudster",
  "con artist",
  "swindle",
  "swindled",
  "gouge",
  "gouged",
  "gouging",
  "price gouging",
  "cheat",
  "cheated",
  "cheating",
  "crook",
  "crooked",
  "shady",
  "predatory",
  "extortion",
  "extortionate",
  "highway robbery",
  "robbery",
  "overcharge",
  "overcharged",
  "overcharging",
  "dishonest",
  "unethical",
  "illegal",
  "criminal",
  "steal",
  "stolen",
  "taken advantage",
  "taking advantage",
] as const;

export interface BannedFinding {
  term: string;
  path: string;
  text: string;
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", $: "s" };

/** Lowercase, undo leetspeak, strip zero-width chars, collapse non-letters to single spaces. */
export function normalizeForBannedCheck(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[​-‍﻿]/g, "")
    .toLowerCase()
    // Only substitute symbols touching a letter, so prices and trailing "!!" stay non-letters.
    .replace(/(?<=[a-z])[0134@$5]|[0134@$5](?=[a-z])/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** Also collapse runs of single letters ("s c a m" → "scam") so spaced-out words are caught. */
function collapseSpacedLetters(s: string): string {
  return s.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ""));
}

const TERM_RES = BANNED_TERMS.map((t) => ({ term: t, re: new RegExp(`(?:^| )${t}(?: |$)`) }));

/**
 * Invoice-derived text (the vendor's own line descriptions) is not our language and may legitimately
 * contain e.g. "Fraud protection" on a phone bill, so `description` fields are skipped by default.
 */
export const isInvoiceText = (path: string) => /(^|\.)description$/.test(path);

export function findBannedWords(value: unknown, skip: (path: string) => boolean = isInvoiceText): BannedFinding[] {
  const out: BannedFinding[] = [];
  const visit = (v: unknown, path: string) => {
    if (skip(path)) return;
    if (typeof v === "string") {
      const n = normalizeForBannedCheck(v);
      for (const hay of new Set([n, collapseSpacedLetters(n)])) {
        for (const { term, re } of TERM_RES) {
          if (re.test(hay) && !out.some((f) => f.path === path && f.term === term)) out.push({ term, path, text: v });
        }
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, path ? `${path}.${k}` : k);
  };
  visit(value, "");
  return out;
}
