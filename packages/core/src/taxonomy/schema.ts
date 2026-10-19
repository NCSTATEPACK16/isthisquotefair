import { z } from "zod";
import { CATEGORIES, UNITS } from "../types.ts";

const KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$/;

export const TaxonomyServiceSchema = z.object({
  key: z.string().regex(KEY_RE, "key must be <category>.<group>.<service> in lowercase snake_case"),
  label: z.string().min(3),
  unit: z.enum(UNITS),
  search_hint: z.string().min(3),
  aliases: z.array(z.string()).default([]),
});

export const TaxonomyFileSchema = z
  .object({
    category: z.enum(CATEGORIES),
    label: z.string(),
    services: z.array(TaxonomyServiceSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const [i, s] of file.services.entries()) {
      if (!s.key.startsWith(`${file.category}.`)) {
        ctx.addIssue({ code: "custom", path: ["services", i, "key"], message: `key must start with "${file.category}."` });
      }
      if (seen.has(s.key)) {
        ctx.addIssue({ code: "custom", path: ["services", i, "key"], message: `duplicate key ${s.key}` });
      }
      seen.add(s.key);
    }
  });

export type TaxonomyService = z.infer<typeof TaxonomyServiceSchema> & { category: z.infer<typeof TaxonomyFileSchema>["category"] };
export type TaxonomyFile = z.infer<typeof TaxonomyFileSchema>;
