import { describe, expect, it } from "vitest";
import { buildQueries, numberAppearsIn, verifyQuotes, type PriceQuote } from "../src/ground/index.ts";
import { countyForZip, COUNTIES } from "../src/geo/counties.ts";
import { getService } from "../src/taxonomy/index.ts";

describe("numberAppearsIn", () => {
  it.each([
    [1200, "costs between $1,200 and $2,000"],
    [1200, "around $1200 typically"],
    [149.99, "only $149.99"],
    [150, "$150.00 per visit"],
    [2000, "up to $2k"],
  ])("%d in %s", (n, text) => expect(numberAppearsIn(n, text)).toBe(true));

  it.each([
    [120, "costs $1,200"],
    [200, "costs $1,200"],
    [12, "costs $1,200"],
    [450, "$45.00"],
  ])("%d not in %s", (n, text) => expect(numberAppearsIn(n, text)).toBe(false));
});

describe("verifyQuotes", () => {
  const evidence = [
    { url: "https://a.example", title: "A", excerpt: "Brake jobs in Raleigh run $300 to $600, most people pay about $450." },
    { url: "https://b.example", title: "B", excerpt: "Expect $350–$700." },
  ];
  const q = (over: Partial<PriceQuote>): PriceQuote => ({ url: "https://a.example", low: 300, typical: 450, high: 600, unit_matches: true, ...over });

  it("accepts quotes whose figures are in the excerpt", () => {
    const r = verifyQuotes([q({}), q({ url: "https://b.example", low: 350, typical: null, high: 700 })], evidence);
    expect(r.sources).toEqual([
      { low: 300, typical: 450, high: 600, url: "https://a.example" },
      { low: 350, typical: 525, high: 700, url: "https://b.example" },
    ]);
    expect(r.rejected).toEqual([]);
  });

  it("rejects invented numbers, unknown URLs, unit mismatches and bad ordering", () => {
    const r = verifyQuotes(
      [q({ high: 900 }), q({ url: "https://made-up.example" }), q({ unit_matches: false }), q({ low: 600, high: 300, typical: 450 }), q({ low: null, typical: null, high: null })],
      evidence,
    );
    expect(r.sources).toEqual([]);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      "figure not found in excerpt",
      "url not in search results",
      "unit mismatch",
      "low/typical/high out of order",
      "no figures",
    ]);
  });

  it("turns a single figure into a point range", () => {
    const r = verifyQuotes([q({ low: null, high: null })], evidence);
    expect(r.sources[0]).toMatchObject({ low: 450, typical: 450, high: 450 });
  });
});

describe("buildQueries / geo", () => {
  it("builds local queries", () => {
    const qs = buildQueries(getService("auto.brakes.front_pads_rotors")!, COUNTIES["37183"]!, 2026);
    expect(qs[0]).toBe("front brake pads and rotors replacement cost Raleigh NC 2026");
    expect(qs.length).toBeLessThanOrEqual(3);
  });
  it("maps Wake ZIPs, rejects others", () => {
    expect(countyForZip("27519")?.name).toBe("Wake");
    expect(countyForZip("27526-1234")?.name).toBe("Wake");
    expect(countyForZip("90210")).toBeUndefined();
    expect(countyForZip("abc")).toBeUndefined();
    expect(countyForZip(null)).toBeUndefined();
  });
});
