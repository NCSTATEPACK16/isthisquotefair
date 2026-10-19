import { redactVendor } from "../validators/pii.ts";
import { LLMError, type ContentPart, type LLMProvider, type LLMUsage } from "../providers/llm.ts";
import { EXTRACTION_SYSTEM_PROMPT, extractionUserText } from "./prompt.ts";
import { reconcile, type Reconciliation } from "./reconcile.ts";
import { ExtractionSchema, type Extraction, type RawExtraction } from "./schema.ts";

export * from "./schema.ts";
export * from "./reconcile.ts";
export { EXTRACTION_SYSTEM_PROMPT } from "./prompt.ts";

export interface ExtractConfig {
  model: string; // default claude-haiku-5-5
  fallbackModel?: string; // default claude-sonnet-5-5
}

export interface ExtractAttempt {
  model: string;
  usage: LLMUsage | null;
  latencyMs: number;
  reconciliation: Reconciliation | null;
  confidence: Extraction["confidence"] | null;
  error?: string;
}

export interface ExtractResult {
  extraction: Extraction;
  /** Transient. Pass to validateOutgoing() then drop it; never return or persist. */
  vendorNameTransient: string | null;
  reconciliation: Reconciliation;
  attempts: ExtractAttempt[];
  usedFallback: boolean;
}

/** Drops vendor_name and redacts it from descriptions. */
export function scrubVendor(raw: RawExtraction): { extraction: Extraction; vendorName: string | null } {
  const { vendor_name, ...rest } = raw;
  return {
    vendorName: vendor_name,
    extraction: { ...rest, line_items: rest.line_items.map((l) => ({ ...l, description: redactVendor(l.description, vendor_name) })) },
  };
}

function needsFallback(a: ExtractAttempt): boolean {
  return a.error !== undefined || a.confidence === "low" || !a.reconciliation?.reconciles;
}

/**
 * §8 step 1: extract with the default model; retry once on the fallback model if the result
 * is low-confidence, doesn't reconcile, or failed. Returns the better of the two attempts.
 */
export async function extractInvoice(
  llm: LLMProvider,
  pages: ContentPart[],
  config: ExtractConfig,
  hints: { category?: string; zip?: string } = {},
): Promise<ExtractResult> {
  const content: ContentPart[] = [...pages, { type: "text", text: extractionUserText(hints) }];
  const attempts: ExtractAttempt[] = [];
  const results: { raw: RawExtraction; attempt: ExtractAttempt }[] = [];

  const run = async (model: string) => {
    const started = Date.now();
    try {
      const res = await llm.generateStructured({ model, system: EXTRACTION_SYSTEM_PROMPT, content, schema: ExtractionSchema });
      const attempt: ExtractAttempt = {
        model,
        usage: res.usage,
        latencyMs: res.latencyMs,
        reconciliation: reconcile(res.data),
        confidence: res.data.confidence,
      };
      attempts.push(attempt);
      results.push({ raw: res.data, attempt });
      return attempt;
    } catch (err) {
      if (!(err instanceof LLMError)) throw err; // network / auth errors are not a reason to switch models
      const attempt: ExtractAttempt = {
        model,
        usage: null,
        latencyMs: Date.now() - started,
        reconciliation: null,
        confidence: null,
        error: `${err.reason}: ${err.message}`,
      };
      attempts.push(attempt);
      return attempt;
    }
  };

  const first = await run(config.model);
  if (needsFallback(first) && config.fallbackModel) await run(config.fallbackModel);

  // Prefer a reconciling result, then the later (stronger-model) one.
  const best = [...results].reverse().sort((a, b) => Number(!!b.attempt.reconciliation?.reconciles) - Number(!!a.attempt.reconciliation?.reconciles))[0];
  if (!best) throw new LLMError(`extraction failed: ${attempts.map((a) => a.error).join("; ")}`, "unparseable");

  const { extraction, vendorName } = scrubVendor(best.raw);
  return {
    extraction,
    vendorNameTransient: vendorName,
    reconciliation: best.attempt.reconciliation!,
    attempts,
    usedFallback: attempts.length > 1,
  };
}

/** Exact service date → first-of-month, which is all we ever store (§9). */
export function toServiceMonth(date: string | null): string | null {
  const m = date?.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : null;
}
