import { findBannedWords, type BannedFinding } from "./bannedWords.ts";
import { findPii, findVendorName, type PiiFinding } from "./pii.ts";

export * from "./bannedWords.ts";
export * from "./pii.ts";

export interface ValidationResult {
  ok: boolean;
  pii: PiiFinding[];
  banned: BannedFinding[];
}

/**
 * Final gate before any payload leaves the pipeline (verdict JSON, scorecard text, stored
 * contributed rows). If `ok` is false the caller must not send / store the payload.
 */
export function validateOutgoing(payload: unknown, opts: { vendorName?: string | null } = {}): ValidationResult {
  const pii = [...findPii(payload), ...findVendorName(payload, opts.vendorName)];
  const banned = findBannedWords(payload);
  return { ok: pii.length === 0 && banned.length === 0, pii, banned };
}
