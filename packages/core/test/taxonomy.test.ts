import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../src/types.ts";
import { servicesFor, TAXONOMY } from "../src/taxonomy/index.ts";

describe("taxonomy", () => {
  it("has ≥ 10 services for every v1 category", () => {
    for (const c of CATEGORIES) expect(servicesFor(c).length, c).toBeGreaterThanOrEqual(10);
  });
  it("has globally unique keys", () => {
    const keys = TAXONOMY.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("has an hourly labor key per category", () => {
    for (const c of CATEGORIES.filter((c) => c !== "telecom" && c !== "vet")) {
      expect(servicesFor(c).some((s) => s.unit === "hour"), c).toBe(true);
    }
  });
});
