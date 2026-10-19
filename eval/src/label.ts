import { z } from "zod";
import { CATEGORIES, isTaxonomyKey, UNCLASSIFIED } from "@itqf/core";

/** Hand-labeled ground truth for one golden invoice: eval/golden/<id>.json */
export const LabelSchema = z.object({
  category: z.enum(CATEGORIES),
  line_items: z
    .array(
      z.object({
        description: z.string(),
        taxonomy_key: z.string().refine((k) => k === UNCLASSIFIED || isTaxonomyKey(k), { message: "unknown taxonomy key" }),
        line_total: z.number(),
      }),
    )
    .min(1),
  tax: z.number().nullable().default(null),
  total: z.number(),
  /** Strings that must never appear in extractor output (seeded fake PII / vendor on synthetic invoices). */
  must_not_contain: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type Label = z.infer<typeof LabelSchema>;
