# Phase 0: review notes and status

## PRD questions and pushback

Items marked **(decision)** need an answer from John. The rest describe what was assumed in code.

### Verdict math (§8 step 4)

1. **Contributed data when 3 ≤ n < 10.** The PRD weights contributed invoices "higher once n ≥ 10,
   benchmarks otherwise". Implemented: below 10, the range comes from benchmarks only and
   contributed rows count toward confidence only. At n ≥ 10 the blend is 70 % contributed
   (p25/p50/p75) and 30 % benchmark medians. The 0.7 weight is a guess. **(decision)**
2. **Zero benchmarks but n ≥ 10 local invoices.** The PRD says "zero benchmarks → not enough data",
   which throws away the local data the product is built on. Implemented: a contributed-only range
   (confidence Medium). **(decision)**
3. **Overall verdict and overall confidence aren't defined.** Implemented: sum of the comparable
   lines against the sum of their low/typical/high values. Overall confidence is the *weakest*
   line's, so a thin line can't hide behind strong ones.
4. **"Based on 14 Wake County invoices" is per key, not per quote.** The headline count currently
   uses the largest per-line n. A quote mixing a well-covered key with a thin one should probably
   show per-line counts in the table.

### Quality bar (§11)

5. **"100 % total reconciliation" isn't defined, and it's harsh on 30 phone photos.** Implemented
   as: the printed total is read correctly *and* Σ lines + tax equals it (±$0.05). One blurry photo
   blocks launch. Suggest keeping 100 % but letting a label mark a photo `unreadable`, so it's
   excluded from the gate and tracked separately. **(decision)**
6. **"Line-item accuracy" mixes reading with judgment.** Reading the amount is objective; choosing
   the taxonomy key is partly subjective. The eval reports both (`amounts found` and
   `key right | amount`), and the 95 % gate currently requires both. Consider gating on amounts and
   tracking key accuracy. **(decision)**
7. **Phase 0's exit criterion depends on the 30 real invoices,** which only John can supply.

### Privacy and data (§9)

8. **Images go to Anthropic.** "Never written to storage" is true for *our* storage, but the
   images are sent to the model provider, which has its own retention. The privacy copy should say
   so. Consider asking Anthropic about zero data retention before launch. **(decision)**
9. **Stripe Checkout collects an email** (and Stripe keeps it), so "no account" ≠ "no personal
   data". The privacy page should say so.
10. **Linking risk between `check_events` and `contributed_items`.** An opted-in check writes both,
    and timestamps could join them. `contributed_at` is therefore a **date**, not a timestamp.
    Batching contributions daily would close this fully.
11. **Vendor names in the golden set.** §11 says to black out PII; CLAUDE.md also requires blacking
    out the business name, since "no vendor names" otherwise has an exception in the repo itself.

### Flow and pricing (§5, §6)

12. **Ask for the ZIP before payment.** Otherwise someone outside Wake County pays and gets "not
    enough local data". That's a refund request at best and a chargeback at worst. **(decision)**
13. **Which ZIP sets the county:** the customer's (entered) or the vendor's (printed)? Assumed the
    customer's, with the vendor's ZIP as a fallback. ZIPs also don't nest in counties (27526, 27529,
    27587, 27592 and 27597 straddle county lines).
14. **3-packs without accounts.** The credit token lives only in the browser, so a cleared browser
    or a new phone loses paid credits. Options: email a magic recovery link from the Stripe receipt,
    or accept it and say so at purchase. **(decision)**
15. **Refund policy for failed checks** (unreadable photo, refusal, no data). Suggest restoring the
    credit automatically when the outcome isn't `success`.

### Categories (§4)

16. **Phone/internet bills conflict with "never name the vendor".** Telecom fees are
    provider-specific ("Is $15/mo for this modem normal?"), and plan prices are public *per
    provider*. Comparing against the same provider's list price needs the provider's identity.
    Suggest allowing **provider names for telecom in benchmarks only** (big national carriers,
    public prices), never in stored contributions or scorecards. **(decision)**

### Models (§8)

17. **Web search on Haiku 5.5** is the basic `web_search_20250305` tool (dynamic filtering is
    Opus/Sonnet only). That's fine for cost. The grounding step quotes only `cited_text` (page bodies
    come back encrypted), and every number must appear verbatim in a cited excerpt.
18. **Map to taxonomy keys inside the extraction call.** §8 lists Normalize as a separate step.
    Implemented: the extractor picks the key from an enum of all 89 keys in the same call, which is
    cheaper and faster. Deterministic normalization (ZIP → county, unclassified exclusion) is
    still its own step.

## Schema deviations from §9

| Change | Why |
|---|---|
| `county` → `county_fips char(5)` | Statewide expansion without name collisions |
| `check_tokens.token_hash` (sha-256), `created_at` | Never store the bearer token itself |
| `consume_check_credit(hash)` function | Atomic single-use spend (no double-spend race) |
| `check_events.used_fallback` | Track how often Sonnet is needed (cost) |
| `contributed_items.contributed_at` is a `date` | See note 10 |
| `subscribers.updated_at` | Webhook ordering / debugging |
| Postgres enums for category / unit / outcome / confidence / status / total bucket | Reject bad writes at the DB |

## Done

- **Supabase project** `isthisquotefair` (ref `brmbbpkrttlklavjdgml`, us-east-1) created, with the
  init migration applied and 89 taxonomy keys seeded. Live check: anon reads only `taxonomy_keys`.
  Security advisor shows only the expected INFO "RLS enabled, no policy" on the four
  service-role-only tables.
- Fix: `compareQuote` merges lines that share a taxonomy key (parts + labor for one job) before
  comparing against whole-job benchmarks (`mergeLinesByKey`).

- Monorepo scaffold (§11 layout), pnpm workspaces, CI (`.github/workflows/ci.yml`) and an eval
  gate workflow (`eval.yml`, which runs when the `ANTHROPIC_API_KEY` secret is set).
- `supabase/migrations/20261018000000_init.sql`: all 7 tables, RLS on each, a seed generated from
  the taxonomy, and `pnpm db:test`, which applies everything to a throwaway Postgres 16 and asserts
  the access rules. A deliberate leak was checked to make the suite fail.
- `/taxonomy`: 6 categories, 89 service keys (12–19 each), schema-validated, compiled to TS + SQL.
- `packages/core`: `LLMProvider` (Claude implemented via structured outputs), `SearchProvider`
  interface, extraction schema/prompt with a Haiku → Sonnet fallback, compare math, PII and
  banned-word validators, a grounding verifier, pricing/cost helpers. Loads in Node and Deno.
- `/eval`: golden-set loader, scorer, CLI with `--enforce`, and 3 synthetic invoices seeded with
  fake PII (`eval/pii/`).
- `apps/web`: React 19 + Vite 8 + Tailwind 4 PWA shell that builds and installs. The Anthropic SDK
  is kept out of the bundle.

## Stubbed / not yet verified

- **No live model call has been made** (no API key in this environment). The Claude provider and
  the extraction prompt are untested against the real API, and the eval hasn't produced a real number.
- Edge functions return 501 (Phase 1).
- `ClaudeWebSearchProvider` is written but unexercised; `BraveSearchProvider`, `GeminiProvider`,
  and `OpenAICompatibleProvider` throw `not_implemented`.
- The ZIP → county map is hand-entered for Wake only and needs regenerating from the HUD USPS crosswalk.
- `docs/privacy.md` and `docs/sponsor-policy.md` are placeholders pending lawyer review.
- The web UI is a placeholder until the Claude Design pass (§16).
