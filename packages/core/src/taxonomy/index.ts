import type { Category } from "../types.ts";
import { TAXONOMY } from "./generated.ts";
import type { TaxonomyService } from "./schema.ts";

export { TAXONOMY };
export type { TaxonomyService };

const BY_KEY = new Map(TAXONOMY.map((s) => [s.key, s]));

export function getService(key: string): TaxonomyService | undefined {
  return BY_KEY.get(key);
}

export function isTaxonomyKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function servicesFor(category?: Category): TaxonomyService[] {
  return TAXONOMY.filter((s) => !category || s.category === category);
}
