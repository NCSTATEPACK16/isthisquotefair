# CLAUDE.md — IsThisQuoteFair

Working rules for Claude Code sessions in this repo. The product spec is `docs/PRD.md`; when this
file and the PRD disagree, stop and ask.

## What this is

A mobile-first PWA for Wake County, NC. A user photographs a service quote and gets a verdict
(below / within / above the typical local range), with every number grounded in data we hand the
model: search-sourced benchmarks plus opted-in local invoices. **The model never prices from memory.**

## Stack and layout

| Path | What | Runtime |
|---|---|---|
| `apps/web` | React 19 + Vite + TS + Tailwind v4 PWA | browser (Netlify) |
| `packages/core` | taxonomy, compare math, validators, LLM/Search provider interfaces, extraction | Node **and** Deno |
| `supabase/functions` | `extract`, `ground`, `compare`, `checkout`, `stripe-webhook` | Deno (Supabase Edge) |
| `supabase/migrations` | SQL schema + RLS | Postgres 16 |
| `taxonomy/*.yaml` | service keys per category (source of truth) | — |
| `eval` | golden-set scorer, synthetic PII invoices | Node |
| `docs` | PRD, privacy, sponsor policy | — |

- Package manager: **pnpm** workspaces. Node ≥ 22.
- `packages/core` is consumed as TypeScript source (no build step). Relative imports **must use
  explicit `.ts` extensions** so Deno can load them; bare imports must be listed in
  `supabase/functions/deno.json`.
- `packages/core/src/providers/claude.ts` is exported separately (`@itqf/core/providers/claude`) so
  the web bundle never pulls in the Anthropic SDK. **Never import it from `apps/web`.** API keys live
  only in edge functions and local eval.

## Commands

```bash
pnpm install
pnpm test               # vitest in every package
pnpm typecheck
pnpm taxonomy:build     # after editing taxonomy/*.yaml (regenerates core + supabase/seed.sql)
pnpm taxonomy:check     # CI: fails if generated taxonomy is stale
pnpm db:test            # applies migrations to a throwaway Postgres and runs RLS assertions
pnpm eval               # golden-set extraction eval (needs ANTHROPIC_API_KEY)
pnpm dev                # web app
```

## Non-negotiable rules

1. **Never store vendor names or images.** No table, column, log line, eval report, fixture or
   analytics event may contain a business name or an invoice image. The extractor's `vendor_name`
   is transient: it is used to redact and to run `validateOutgoing`, then dropped. Images are
   processed in memory only.
2. **No PII fields in schemas.** Don't add customer name, address, phone, email, VIN, plate, card
   digits or pet name to any extraction schema, table, or type, even "temporarily".
3. **Every outgoing payload passes `validateOutgoing()`** (PII regex + vendor name + banned words)
   before it is returned, stored in `contributed_items` / `saved_checks`, or rendered into a
   scorecard. If it fails, block; don't "clean and continue" without a test for the case.
4. **Banned verdict language.** Never write (in UI copy, prompts, talking points, docs meant for
   users, or test fixtures that represent our output): scam, rip-off / ripoff / ripped off, fraud,
   gouging, overcharged, cheat, crook, shady, predatory, extortion, highway robbery, dishonest,
   illegal, or anything accusatory. Say "above the typical local range". The full list is
   `BANNED_TERMS` in `packages/core/src/validators/bannedWords.ts`; extend it there, with a test.
5. **The LLM does not do math.** Ranges, flags, % vs median, percentiles and confidence come from
   `packages/core/src/compare`. The LLM only extracts, maps to taxonomy keys, and writes prose from
   numbers we computed. Zero benchmarks → "Not enough local data", never a guess.
6. **Grounded numbers only.** A benchmark figure is stored only if `verifyQuotes()` finds it
   verbatim in an excerpt from a URL the search returned.
7. **RLS on every table.** New tables get `enable row level security` in the same migration, and
   `supabase/tests/rls.sql` gets an assertion for them. Only service-role edge functions write
   benchmark, contribution, token and event tables.
8. **Opt-in is explicit and unchecked by default.** Without opt-in the only stored row is
   `check_events` (no prices, no line items).

## Models and providers

- All model calls go through `LLMProvider` / `SearchProvider` (`packages/core/src/providers`).
  Don't call the Anthropic SDK from anywhere else.
- Defaults: extraction and prose on `claude-haiku-5-5`; extraction fallback `claude-sonnet-5-5`
  when confidence is low or totals don't reconcile. Model IDs come from config/env, not literals
  scattered through code.
- JSON comes from **structured outputs** (`output_config.format` via `messages.parse` +
  `zodOutputFormat`). Haiku 5.5 rejects assistant prefill and non-default
  `temperature`/`top_p`/`top_k`, so don't send them.
- Check `stop_reason` (`refusal`, `max_tokens`) before trusting output.
- Log tokens, searches, cost and latency for every check (`check_events`). Cost guard: alert if the
  average exceeds $0.05/check or any single check exceeds $0.25.

## Evals gate pipeline changes

Run `pnpm eval -- --enforce` **and** `pnpm eval -- --dir eval/pii --enforce` before merging any
change to:

- `packages/core/src/extract/**` (schema, prompt, fallback logic)
- `packages/core/src/providers/**`
- `taxonomy/*.yaml`
- default model IDs or extraction config

Paste the summary block into the PR. The bar: ≥ 95 % line-item accuracy, 100 % total
reconciliation, 0 PII leaks. Don't lower a threshold or edit a golden label to make a run pass;
if a label is wrong, fix it in its own commit and say why.

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess`. Zod for every external boundary (YAML, labels,
  LLM output, request bodies).
- Money is in dollars as `number`, rounded with `round2` at output; DB columns are `numeric(10,2)`.
- Counties are 5-digit FIPS (`37183` = Wake). ZIP → county goes through `countyForZip`.
- Store service **month** (`YYYY-MM-01`), never the exact date, for contributed rows.
- Taxonomy keys are `category.group.service`. Never rename a shipped key; add a new one and migrate.
- Tests sit next to their package in `test/`. New validator patterns need positive *and* negative
  cases; a PII regex change needs a test showing what it catches and what it leaves alone.
- Commit generated files (`taxonomy/generated.ts`, `supabase/seed.sql`) together with the YAML.
