import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { extractInvoice, scrubVendor, toServiceMonth, ExtractionSchema, type RawExtraction } from "../src/extract/index.ts";
import { reconcile } from "../src/extract/reconcile.ts";
import { LLMError, type LLMProvider, type StructuredRequest } from "../src/providers/llm.ts";

const raw = (over: Partial<RawExtraction> = {}): RawExtraction => ({
  category: "auto",
  vendor_name: "Oak City Auto LLC",
  vendor_zip: "27603",
  service_date: "2026-09-14",
  line_items: [
    { description: "Front pads & rotors", kind: "part", taxonomy_key: "auto.brakes.front_pads_rotors", qty: 1, unit_price: 240, line_total: 240, labor_hours: null, labor_rate: null },
    { description: "Labor - Oak City Auto tech", kind: "labor", taxonomy_key: "auto.brakes.front_pads_rotors", qty: null, unit_price: null, line_total: 210, labor_hours: 1.5, labor_rate: 140 },
    { description: "Shop supplies", kind: "fee", taxonomy_key: "unclassified", qty: null, unit_price: null, line_total: 18.5, labor_hours: null, labor_rate: null },
  ],
  subtotal: 468.5,
  tax: 16.8,
  total: 485.3,
  confidence: "high",
  ...over,
});

class FakeLLM implements LLMProvider {
  readonly name = "fake";
  calls: string[] = [];
  constructor(private readonly byModel: Record<string, RawExtraction | Error>) {}
  async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>) {
    this.calls.push(req.model);
    const r = this.byModel[req.model];
    if (!r) throw new Error(`no fixture for ${req.model}`);
    if (r instanceof Error) throw r;
    return { data: r as z.infer<S>, latencyMs: 1, usage: { model: req.model, inputTokens: 1000, outputTokens: 200, costUsd: 0.0002 } };
  }
}

describe("ExtractionSchema", () => {
  it("compiles to a structured-output JSON schema with no PII fields", () => {
    const fmt = zodOutputFormat(ExtractionSchema) as { schema: Record<string, unknown> };
    const s = JSON.stringify(fmt.schema);
    for (const banned of ["customer", "vin", "plate", "phone", "address", "email", "pet_name", "card"]) {
      expect(s.toLowerCase()).not.toContain(`"${banned}`);
    }
    expect(s).toContain('"additionalProperties":false');
  });
});

describe("reconcile", () => {
  it("Σ lines + tax = total within tolerance", () => {
    expect(reconcile(raw())).toMatchObject({ reconciles: true, lineSum: 468.5, diff: 0 });
    expect(reconcile(raw({ total: 485.34 })).reconciles).toBe(true);
    expect(reconcile(raw({ total: 500 })).reconciles).toBe(false);
    expect(reconcile(raw({ total: null })).reconciles).toBe(false);
  });
});

describe("scrubVendor", () => {
  it("drops vendor_name and redacts it from descriptions", () => {
    const { extraction, vendorName } = scrubVendor(raw());
    expect(vendorName).toBe("Oak City Auto LLC");
    expect("vendor_name" in extraction).toBe(false);
    expect(extraction.line_items[1]!.description).toBe("Labor - [business] tech");
  });
});

describe("extractInvoice fallback", () => {
  const pages = [{ type: "text" as const, text: "(image)" }];
  const cfg = { model: "haiku", fallbackModel: "sonnet" };

  it("uses only the primary model when the result is good", async () => {
    const llm = new FakeLLM({ haiku: raw() });
    const r = await extractInvoice(llm, pages, cfg);
    expect(llm.calls).toEqual(["haiku"]);
    expect(r.usedFallback).toBe(false);
    expect(r.vendorNameTransient).toBe("Oak City Auto LLC");
  });

  it("falls back when totals don't reconcile, and prefers the reconciling result", async () => {
    const llm = new FakeLLM({ haiku: raw({ total: 999 }), sonnet: raw() });
    const r = await extractInvoice(llm, pages, cfg);
    expect(llm.calls).toEqual(["haiku", "sonnet"]);
    expect(r.reconciliation.reconciles).toBe(true);
    expect(r.usedFallback).toBe(true);
  });

  it("falls back on low confidence", async () => {
    const llm = new FakeLLM({ haiku: raw({ confidence: "low" }), sonnet: raw() });
    await extractInvoice(llm, pages, cfg);
    expect(llm.calls).toEqual(["haiku", "sonnet"]);
  });

  it("keeps the primary result if the fallback is worse", async () => {
    const llm = new FakeLLM({ haiku: raw({ confidence: "low" }), sonnet: raw({ total: 1 }) });
    const r = await extractInvoice(llm, pages, cfg);
    expect(r.reconciliation.reconciles).toBe(true);
    expect(r.attempts).toHaveLength(2);
  });

  it("falls back on a model-level failure (refusal / truncation)", async () => {
    const llm = new FakeLLM({ haiku: new LLMError("cut off", "truncated"), sonnet: raw() });
    const r = await extractInvoice(llm, pages, cfg);
    expect(r.attempts[0]!.error).toMatch(/truncated/);
    expect(r.extraction.total).toBe(485.3);
  });

  it("does not mask infrastructure errors", async () => {
    const llm = new FakeLLM({ haiku: new Error("ECONNRESET"), sonnet: raw() });
    await expect(extractInvoice(llm, pages, cfg)).rejects.toThrow("ECONNRESET");
  });

  it("throws if every attempt fails", async () => {
    const llm = new FakeLLM({ haiku: new LLMError("no", "refusal"), sonnet: new LLMError("no", "refusal") });
    await expect(extractInvoice(llm, pages, cfg)).rejects.toThrow(/extraction failed/);
  });
});

describe("toServiceMonth", () => {
  it("keeps only year and month", () => {
    expect(toServiceMonth("2026-09-14")).toBe("2026-09-01");
    expect(toServiceMonth(null)).toBeNull();
    expect(toServiceMonth("Sept 14")).toBeNull();
  });
});
