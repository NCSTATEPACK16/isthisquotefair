# Service taxonomy

One YAML file per category. Each service key is `<category>.<group>.<service>` and is the unit
benchmarks and contributed invoices are stored against (per key + county).

Fields per service:

| field | meaning |
|---|---|
| `key` | stable id, lowercase `a-z0-9_` segments joined by `.`; **never rename a shipped key** (add a new one and migrate) |
| `label` | plain-English name shown to users |
| `unit` | what one "unit price" means: `job` (whole service, qty 1), `hour`, `each`, `month` |
| `search_hint` | phrase used to build grounding queries, e.g. `"<hint> cost Raleigh NC 2026"` |
| `aliases` | common invoice wording, given to the extractor as mapping hints |

After editing, run `pnpm taxonomy:build` to regenerate `packages/core/src/taxonomy/generated.ts`
and `supabase/seed.sql`. CI (`pnpm taxonomy:check`) fails if they're stale.
