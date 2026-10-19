import { z } from "zod";
import { TAXONOMY } from "../taxonomy/generated.ts";
import { CATEGORIES, UNCLASSIFIED } from "../types.ts";

export const LINE_KINDS = ["part", "labor", "service", "fee", "discount", "other"] as const;

const TAXONOMY_KEYS: [string, ...string[]] = [UNCLASSIFIED, ...TAXONOMY.map((s) => s.key)];

/**
 * What the extractor is allowed to return. PII (customer name, address, phone, VIN, plate, card
 * digits, pet name) is deliberately *not* a field, so the model has nowhere to put it (§8 step 1).
 * `vendor_name` exists only so we can scrub it from descriptions; it is removed before anything
 * is returned or stored.
 */
export const ExtractionSchema = z.object({
  category: z.enum(CATEGORIES).describe("Best-fit service category for the whole invoice"),
  vendor_name: z
    .string()
    .nullable()
    .describe("Business name exactly as printed, used only to redact it. Null if not printed."),
  vendor_zip: z.string().nullable().describe("5-digit ZIP of the business if printed, else null"),
  service_date: z.string().nullable().describe("Service or quote date as YYYY-MM-DD, else null"),
  line_items: z.array(
    z.object({
      description: z.string().describe("Line text with any person names, phone numbers, VINs, plates or addresses removed"),
      kind: z.enum(LINE_KINDS),
      taxonomy_key: z.enum(TAXONOMY_KEYS).describe(`Closest service key, or "${UNCLASSIFIED}" if none fits`),
      qty: z.number().nullable(),
      unit_price: z.number().nullable(),
      line_total: z.number().describe("Extended amount for this line in USD; negative for discounts"),
      labor_hours: z.number().nullable(),
      labor_rate: z.number().nullable(),
    }),
  ),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable().describe("Grand total / amount due as printed"),
  confidence: z.enum(["low", "medium", "high"]).describe("How legible and unambiguous the invoice was"),
});

export type RawExtraction = z.infer<typeof ExtractionSchema>;
/** Extraction after the vendor name has been dropped. This is the only shape that leaves extract(). */
export type Extraction = Omit<RawExtraction, "vendor_name">;
export type ExtractedLine = Extraction["line_items"][number];
