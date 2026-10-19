import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Extraction } from "@itqf/core";
import { loadCases } from "../src/cases.ts";
import { LabelSchema, type Label } from "../src/label.ts";
import { matchLines, scoreCase, summarize } from "../src/score.ts";

const label: Label = LabelSchema.parse({
  category: "auto",
  line_items: [
    { description: "Front brake pads", taxonomy_key: "auto.brakes.front_pads_rotors", line_total: 240 },
    { description: "Brake labor 1.5 hr", taxonomy_key: "auto.brakes.front_pads_rotors", line_total: 210 },
    { description: "Shop supplies", taxonomy_key: "unclassified", line_total: 18.5 },
  ],
  tax: 16.8,
  total: 485.3,
  must_not_contain: ["Jane Q. Testperson"],
});

const line = (description: string, taxonomy_key: string, line_total: number): Extraction["line_items"][number] => ({
  description,
  kind: "part",
  taxonomy_key,
  qty: null,
  unit_price: null,
  line_total,
  labor_hours: null,
  labor_rate: null,
});

const extraction = (lines: Extraction["line_items"], total: number | null = 485.3): Extraction => ({
  category: "auto",
  vendor_zip: null,
  service_date: null,
  line_items: lines,
  subtotal: null,
  tax: 16.8,
  total,
  confidence: "high",
});

const perfect = [
  line("FRONT PADS", "auto.brakes.front_pads_rotors", 240),
  line("LABOR", "auto.brakes.front_pads_rotors", 210),
  line("SHOP SUPPLIES", "unclassified", 18.5),
];

describe("scoreCase", () => {
  it("scores a perfect extraction", () => {
    const s = scoreCase("a", label, extraction(perfect), null);
    expect(s).toMatchObject({ correct: 3, amountMatched: 3, totalReconciled: true, piiLeaks: [] });
  });

  it("counts a wrong key as an incorrect line but a found amount", () => {
    const s = scoreCase("a", label, extraction([perfect[0]!, line("LABOR", "auto.labor.hourly_rate", 210), perfect[2]!]), null);
    expect(s.correct).toBe(2);
    expect(s.amountMatched).toBe(3);
  });

  it("penalizes extra lines through the denominator", () => {
    const s = scoreCase("a", label, extraction([...perfect, line("Subtotal", "unclassified", 468.5)], 485.3), null);
    expect(s.correct).toBe(3);
    expect(s.predictedCount).toBe(4);
    expect(s.internallyReconciles).toBe(false); // the subtotal line broke the sum
    expect(summarize([s], 0).lineItemAccuracy).toBe(0.75);
  });

  it("requires both a correct total and internal reconciliation", () => {
    expect(scoreCase("a", label, extraction(perfect, 490), null).totalReconciled).toBe(false);
  });

  it("detects PII, vendor names and must_not_contain strings", () => {
    const leaky = extraction([line("Customer Jane Q. Testperson 919-555-0142", "unclassified", 18.5), perfect[0]!, perfect[1]!]);
    const s = scoreCase("a", label, leaky, null);
    expect(s.piiLeaks.some((l) => l.startsWith("phone"))).toBe(true);
    expect(s.piiLeaks.some((l) => l.includes("must_not_contain"))).toBe(true);
    expect(scoreCase("a", label, extraction([line("Oak City Auto labor", "unclassified", 18.5)]), "Oak City Auto").piiLeaks).toHaveLength(1);
  });
});

describe("matchLines", () => {
  it("pairs duplicate amounts one-to-one, preferring the matching key", () => {
    const l = LabelSchema.parse({
      category: "telecom",
      line_items: [
        { description: "Modem rental", taxonomy_key: "telecom.internet.modem_rental", line_total: 15 },
        { description: "Admin fee", taxonomy_key: "telecom.fees.admin_regulatory", line_total: 15 },
      ],
      total: 30,
    });
    const { matches, extra } = matchLines(l, [line("Administrative fee", "telecom.fees.admin_regulatory", 15), line("Gateway rental", "telecom.internet.modem_rental", 15)]);
    expect(matches.every((m) => m.keyOk)).toBe(true);
    expect(extra).toEqual([]);
  });
});

describe("summarize", () => {
  it("counts errored cases against total reconciliation and blocks a pass", () => {
    const s = scoreCase("a", label, extraction(perfect), null);
    const sum = summarize([s], 1);
    expect(sum.totalReconciliation).toBe(0.5);
    expect(sum.passes).toBe(false);
    expect(summarize([s], 0).passes).toBe(true);
    expect(summarize([], 0).passes).toBe(false);
  });
});

describe("loadCases", () => {
  it("pairs labels with single and multi-page images and reports orphans", () => {
    const dir = mkdtempSync(join(tmpdir(), "golden-"));
    const json = JSON.stringify({ category: "auto", line_items: [{ description: "x", taxonomy_key: "unclassified", line_total: 1 }], total: 1 });
    writeFileSync(join(dir, "auto-01.json"), json);
    writeFileSync(join(dir, "auto-01.jpg"), "");
    writeFileSync(join(dir, "hvac-01.json"), json);
    writeFileSync(join(dir, "hvac-01.p2.jpg"), "");
    writeFileSync(join(dir, "hvac-01.p1.jpg"), "");
    writeFileSync(join(dir, "orphan.png"), "");
    writeFileSync(join(dir, "nolabel.json"), json);
    const { cases, problems } = loadCases(dir);
    expect(cases.map((c) => [c.id, c.pages.map((p) => p.split("/").pop())])).toEqual([
      ["auto-01", ["auto-01.jpg"]],
      ["hvac-01", ["hvac-01.p1.jpg", "hvac-01.p2.jpg"]],
    ]);
    expect(problems).toHaveLength(2);
  });

  it("rejects labels with unknown taxonomy keys", () => {
    expect(LabelSchema.safeParse({ category: "auto", line_items: [{ description: "x", taxonomy_key: "auto.nope.nope", line_total: 1 }], total: 1 }).success).toBe(false);
  });
});
