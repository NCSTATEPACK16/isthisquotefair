# PRD — IsThisQuoteFair (working name)

> Repo codename: `isthisquotefair` · Owner: John · Status: Draft v1 · Last updated: 2026-10-18
> Earlier codename: FairPrice Radar. Brand name is not final (see §12).

---

## 1. Summary

A mobile-first web app (PWA) for Wake County, NC residents. A user photographs a service invoice or quote and gets a clear verdict: **below, within, or above the typical local range**. The verdict includes a line-by-line breakdown and talking points.

Each verdict is grounded in two sources: local price benchmarks gathered by search at check time, and real invoices that other users chose to contribute. The model never guesses from its own memory.

The business is pay-per-check from day one. A monthly plan adds deeper analysis. Local content, and later carefully gated local sponsorships, come only after the product is proven.

**What we are not building:** a B2B data product, a contractor marketplace, a review site, or a native app.

## 2. Problem & positioning

People get quotes for car repair, HVAC, plumbing, vet care and similar services with no idea what's normal locally. Existing options fall into three groups:

- **Lead-gen sites** (Angi, Thumbtack, HomeAdvisor). Their published prices are built to capture leads.
- **National estimate tools** (RepairPal, KBB). They give broad ranges, not what people actually pay locally.
- **AI receipt checkers.**
  - **RipCheck** (getripcheck.com) is the direct competitor. It covers 20+ categories, is a PWA, charges $2.99 per check or $6.99/month, gives the first check free, and runs on Claude.
  - **FairQuote** is an iOS app that checks home-repair quotes against regional ranges and stores everything on the device.

**How we win:**

1. **Local ground truth.** Verdicts say what they're based on ("Based on 14 Wake County invoices + 3 local price sources"), not a generic "fair range."
2. **Design and trust.** The competitors look dated. A polished, fast, honest UI is a real advantage for a $1–2 impulse purchase.
3. **Neutral, defensible verdicts.** We never name the vendor and never use language like "scam" or "rip-off." That keeps us safe legally and credible enough for sponsors later.
4. **Local content later.** Opt-in data powers SEO pages such as "What does a brake job cost in Fuquay-Varina?"

## 3. Target user

- **Primary:** Homeowners and car owners in Wake County (Raleigh, Cary, Apex, Fuquay-Varina, Holly Springs, Garner, Wake Forest). They're holding a quote they haven't paid yet, or they just paid and feel uneasy.
- **Secondary:** Adult children checking quotes for aging parents. Accessibility matters: large type, high contrast, simple flow.
- **Launch region:** Wake County only. Harnett and Johnston counties are next. The data model is county-keyed so we can expand statewide without schema changes.

## 4. Scope — service categories

We launch with six categories and add two more once the first six are stable. Health-related categories are deferred because they involve health data and very complex pricing.

| Phase | Category | Why |
|---|---|---|
| v1 | Auto repair | Standardized labor times, high distrust, high ticket |
| v1 | HVAC | High ticket, seasonal spikes, many local providers |
| v1 | Plumbing | High ticket, emergency pricing |
| v1 | Electrical | Panel and service upgrades are high-ticket and opaque |
| v1 | Veterinary | Opaque pricing; pet records are not HIPAA-covered |
| v1 | Phone / internet bills | Easy wins (rental fees, add-ons); plan prices are public |
| v1.1 | Appliance repair | Common, mid-ticket |
| v1.1 | Roofing | Very high ticket; insurance overlap |
| Deferred | Dental, medical | Health data (sensitive under privacy law), insurance EOB complexity |
| Out | Grocery, restaurants | Not "quotes"; needs retail price feeds |

Each category has a **service taxonomy** in `/taxonomy/*.yaml`. Example keys: `auto.brakes.front_pads_rotors`, `hvac.repair.capacitor`. Extraction maps each line item to a key, and benchmarks are stored per key and county.

## 5. User flow (v1)

1. **Landing.**
   - Hero with the value proposition.
   - **Demo video** (30–45 sec) showing a real sample check.
   - Price shown up front.
   - "Check my quote" button.
2. **Pay.** Stripe Checkout, one check at a time. No account required. Payment returns a single-use check token.
3. **Upload.**
   - Camera or file upload; multi-page allowed, up to 5 images or a PDF.
   - The user picks a category (pre-filled by AI, editable) and enters a ZIP.
   - Cloudflare Turnstile blocks bots.
4. **Consent.** A checkbox at the bottom, **unchecked by default**: "Add my anonymized line items to the local price database." It links to a plain-English explanation.
5. **Processing.** Takes about 10–20 seconds and shows progress: "Reading invoice → Finding local prices → Comparing."
6. **Verdict.**
   - Overall gauge: Below / Within / Above typical range, plus a % difference from the local median.
   - Line-item table: each item, its typical range, and a flag.
   - A **"Based on"** box listing benchmark sources (with links), the count of local invoices, and a confidence level (Low / Medium / High).
   - 3–5 neutral talking points, e.g. "Ask whether the labor estimate uses book time."
   - A shareable scorecard image with **no vendor name and no prices tied to a business**.
7. **Session end.** Without opt-in, nothing about the invoice is stored server-side. The result exists only in the browser tab, and the user can download it as a PNG or PDF.

**Monthly plan users** sign in with an email magic link and get unlimited checks (subject to a fair-use cap), deep analysis (§7), and saved history.

## 6. Pricing & monetization

| Offer | Price (proposed) | Notes |
|---|---|---|
| Single check | **$1.99** (decision needed, see below) | Pay before upload; no account |
| 3-pack | $3.99 | Credits expire after 12 months |
| Monthly | $9/mo | Unlimited checks (fair-use cap 30/mo), deep analysis, history; cancel anytime |

**⚠ Decision: the $1.00–$1.50 price point.** Standard US card processing runs about 2.9% + $0.30 per transaction (verify current Stripe pricing). On a $1.00 charge that's about a third of revenue; on $1.50 it's about 23%. Options:

- (a) Charge $1.99.
- (b) Keep $1–1.50 but sell credits in packs to spread the fee.
- (c) Price at $1.50 and accept the margin during validation.

My recommendation is (a), or (b) with $1.50 shown as the per-check price inside a pack.

**⚠ Risk: paywall before the first check.** RipCheck gives the first check free. The demo video has to do the convincing. Track landing→paid conversion. If it's below 2% after about 500 landing visits, test a free first check limited to a line-item extraction preview.

**Later revenue (not built in v1):**
- **Phase 3, local content pages:** SEO, plus clearly labeled display ads.
- **Phase 4, sponsorships** (see §10 guardrails).
- **Deferred indefinitely:** review aggregation and B2B data sales.

## 7. What each tier gets

| Feature | Single check | Monthly |
|---|---|---|
| Overall verdict + % vs median | ✓ | ✓ |
| Line-item flags + typical ranges | ✓ | ✓ |
| "Based on" sources + confidence | ✓ | ✓ |
| 3–5 talking points | ✓ | ✓ |
| Shareable scorecard | ✓ | ✓ |
| **Deep analysis**: negotiation script, "questions to ask before you sign", parts vs labor split, labor-hour sanity check, second-opinion checklist | — | ✓ |
| Saved history + re-check a revised quote | — | ✓ |
| Price alerts for a saved service type (Phase 3) | — | ✓ |

## 8. How a verdict is produced

The LLM is only allowed to compare against data we hand it. It never estimates from memory.

```
image(s) ──► [1] Extract ──► [2] Normalize ──► [3] Ground ──► [4] Compare ──► [5] Validate ──► verdict
```

1. **Extract** (vision LLM, structured output). Pulls line items, quantities, unit prices, labor hours and rate, fees, tax, total, service date, and vendor ZIP if printed.
   - PII (names, addresses, phone, VIN, plate, card digits, pet name) is **never requested in the output schema**.
   - Vendor name is extracted only to a transient field used to drop it. It is never returned or stored.
2. **Normalize.** Maps each line to a taxonomy key and maps the ZIP to a county. Unmapped items are flagged "unclassified" and excluded from the verdict math.
3. **Ground.** For each taxonomy key and county:
   - Check `price_benchmarks` for a cached entry less than 30 days old. If there is one, use it.
   - If not, run 1–3 targeted web searches (e.g. "front brake pads and rotors replacement cost Raleigh NC 2026"). Extract low/typical/high values with source URLs, store them, and set them to expire in 30 days.
   - Pull opt-in invoices for the same key and county from the last 24 months.
4. **Compare** (deterministic code, not the LLM).
   - Computes the percentile or % difference against a blended range: contributed invoices weighted higher once n ≥ 10, benchmarks otherwise.
   - Confidence: **High** = n ≥ 10 local invoices plus at least 2 benchmark sources; **Medium** = at least 2 benchmarks or n ≥ 3; **Low** = otherwise.
   - If confidence is Low, the verdict says so plainly and still shows the ranges found.
   - With zero benchmarks, the app returns "Not enough local data for this item" instead of guessing.
5. **Validate.**
   - A regex sweep on the outgoing JSON catches PII: phone numbers, 17-character VINs, card-like digit runs, emails, street addresses.
   - A banned-words check blocks "scam," "rip-off," "fraud" and similar language.
   - The LLM writes **only** the talking points and deep-analysis prose, and only from the computed numbers.

### Models

All model calls go through `LLMProvider`, an interface with implementations for Claude, Gemini, and an OpenAI-compatible endpoint, so the model can be swapped by config.

| Step | Default | Fallback |
|---|---|---|
| Extract | Claude Haiku 5.5 (`claude-haiku-5-5`) | Claude Sonnet 5.5 if extraction confidence is low or totals don't reconcile |
| Ground (search) | Claude web search tool, or a cheaper search API (Brave or Parallel) behind a `SearchProvider` interface | — |
| Talking points / deep analysis | Claude Haiku 5.5 | — |

Haiku 5.5 notes:
- It costs $0.10 / $0.50 per million input/output tokens for prompts up to 100K tokens, which every check will be.
- It does **not** accept assistant prefill or sampling parameters, so use tool or structured outputs for JSON.
- Its tokenizer produces about 30% more tokens than older models; budget accordingly.

### Estimated cost per check

| Item | Estimate |
|---|---|
| Extraction (~5K input incl. images, ~1.5K output) | ≈ $0.0013 |
| Talking points (~3K in / 800 out) | ≈ $0.0007 |
| Web search on cache miss (2 searches at $0.01 + ~30K result tokens) | ≈ $0.023 |
| **Cache hit** | **≈ $0.002** |
| **Cache miss** | **≈ $0.025** |

At 10K checks/month with a 70% cache-hit rate, model and search cost is roughly **$90/month**. Stripe fees will be far larger than LLM costs; the pricing decision in §6 matters more than the model choice.

Log tokens, searches, cost, and latency on every check (§9, `check_events`).

## 9. Data & privacy

**Principles:** collect the minimum, keep images only briefly, never store vendor names, and require explicit opt-in.

- **Images:** sent straight to the processing function and handled in memory. They are **never written to storage**.
  - If an async path is needed later, use Cloudflare R2 with a lifecycle rule for deletion and document the actual deletion window.
- **No opt-in:** the only row stored is in `check_events`, with category, county, model, tokens, cost, latency, and success/fail. There are **no prices, line items, or images**.
  - ⚠ Confirm you're OK with this operational row. Without it there is no way to monitor cost or errors.
- **Opt-in:** normalized line items, taxonomy keys, prices, labor hours/rate, county, ZIP, and service month (not the exact date) go to `contributed_items`. No vendor, no PII, no image.
- **Deletion:** opt-in rows are not linked to an identity, so they can't be deleted per user. Say this plainly in the consent text.
  - Monthly-plan users' history is linked to their account and is deleted when they delete the account.
- **Privacy law:** NC has pending comprehensive privacy bills (e.g. H 462, S 757); enactment wasn't confirmed as of this draft. Build to the common standard anyway (notice, access, delete, no sale of data) and re-check before launch.
- **Payments:** Stripe holds all card data. We store only the Stripe session or customer ID.

### Tables (Supabase / Postgres)

```
taxonomy_keys       (key PK, category, label, unit)
price_benchmarks    (id, key FK, county, low, typical, high, source_urls jsonb,
                     fetched_at, expires_at)
contributed_items   (id, key FK, county, zip5, service_month, unit_price, qty,
                     labor_hours, labor_rate, line_total, invoice_total_bucket,
                     contributed_at)
check_events        (id, created_at, category, county, model, input_tokens,
                     output_tokens, searches, cost_usd, latency_ms, outcome,
                     confidence, opted_in bool)
check_tokens        (id, stripe_session_id, credits_remaining, expires_at)
subscribers         (user_id FK auth.users, stripe_customer_id, status, period_end)
saved_checks        (id, user_id FK, created_at, result jsonb)  -- monthly plan only
```

Row-level security (RLS) is on for every table. Only edge functions (service role) write to the benchmark and contribution tables.

## 10. Legal & trust guardrails

- **No vendor names** in any output, scorecard, page, or stored row.
- **Neutral language only:** "above typical local range," never "scam" or "ripped off." This is enforced by the validation step in §8 and by the brand name.
- **Clear disclaimer** on every verdict: informational only; prices vary by scope, parts quality, and urgency; not professional advice.
- **Sources shown:** every verdict lists what it was based on.
- **Sponsor rules (Phase 4, only after Reddit and beta testing):**
  - Sponsors appear only as clearly labeled "Sponsored" listings, **never inside a verdict**.
  - A sponsor is eligible only if its own opted-in invoices score within range.
  - Sponsorship never changes a verdict. Publish a sponsorship policy page.
- **Before charging money:** a lawyer reviews the ToS, privacy policy, refund policy, and sponsor policy.

## 11. Tech stack & repo

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite + TypeScript, PWA (installable), Tailwind |
| Hosting | Netlify (frontend); Supabase Edge Functions (pipeline) |
| DB / Auth | Supabase Postgres + RLS; magic-link auth for monthly users only |
| Payments | Stripe Checkout + webhooks (one-time + subscription) |
| Bot protection | Cloudflare Turnstile (free) |
| Object storage | None in v1; Cloudflare R2 (existing free 10 GB) reserved if async processing is needed |
| LLM | Claude Haiku 5.5 via `LLMProvider` interface |
| Analytics | Privacy-friendly (Plausible or self-hosted Umami); no ad trackers in v1 |

```
/apps/web            React PWA
/supabase/functions  extract, ground, compare, checkout, stripe-webhook
/supabase/migrations SQL schema + RLS
/packages/core       taxonomy, compare math, PII/banned-word validators, provider interfaces
/taxonomy            category YAML files
/eval                golden invoice set + scorer
/docs                PRD.md, privacy.md, sponsor-policy.md
CLAUDE.md            working rules for Claude Code sessions
```

### Quality bar

- **Golden set:** 30 real invoices (5 per v1 category), hand-labeled, with PII blacked out before committing. Extraction must hit **≥ 95% line-item accuracy and 100% total reconciliation** before launch.
- **PII test suite:** synthetic invoices seeded with fake names, VINs, and phone numbers. **Zero leaks** is a launch blocker.
- **Cost guard:** an alert fires if the average cost per check exceeds $0.05 or a single check exceeds $0.25.

## 12. Name

| Candidate | Status |
|---|---|
| **IsThisQuoteFair** | No existing product found in a quick search. Neutral and descriptive. **Recommended working name.** |
| FairQuote | ❌ Already an iOS app that checks home-repair quotes, plus a B2B quoting SaaS with the same name. Avoid. |
| FairPrice | ⚠ Likely conflicts with NTUC FairPrice (major Singapore grocery chain) and many "FairPrice" businesses. Weak for search and trademark. |

**To do before buying:**
- Check domain availability at a registrar (`isthisquotefair.com`, `.app`).
- Run a USPTO trademark search.
- Check social handles.
- Consider a short alias domain for sharing (e.g. `fairq.*`).

## 13. Phases & milestones

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundations** (wk 1–2) | Repo, schema, taxonomy for 6 categories, `LLMProvider`, golden set, eval harness | Extraction ≥ 95% on golden set |
| **1. MVP** (wk 3–6) | Landing + demo video, Stripe single check, upload, pipeline, verdict, scorecard, consent | 25 friends-and-family checks; zero PII leaks; p90 latency < 25s |
| **2. Monthly plan** (wk 7–9) | Magic-link auth, $9/mo, deep analysis, history | First 10 paying subscribers |
| **3. Local content** (after ~500 opt-in invoices) | Auto-generated "cost of X in [town]" pages from aggregated data (min n ≥ 10 per page), labeled ads | Organic search traffic growing month over month |
| **4. Sponsors** (after Reddit + beta validation) | Sponsor listings under §10 rules | Lawyer-reviewed policy; 3 pilot sponsors |
| v1.1 categories | Appliance repair, roofing | Golden set extended |

## 14. 90-day success metrics

| Metric | Target |
|---|---|
| Landing → paid conversion | ≥ 3% (re-test the paywall below 2%) |
| Opt-in rate on paid checks | ≥ 30% |
| "Was this helpful?" yes | ≥ 70% |
| Avg model+search cost per check | < $0.05 |
| Single → monthly upgrade | ≥ 5% of single-check buyers |
| Reddit / Nextdoor feedback threads | 3+ posts with net-positive reception |

If people won't pay about $2 to check an $800 quote, stop or rethink.

## 15. Open decisions

1. Single-check price: $1.99, or $1.00–1.50 via packs (§6)
2. Keep the operational `check_events` row for non-opt-in checks (§9)
3. Final brand name + domain (§12)
4. Search provider: Claude web search vs a cheaper search API (benchmark on 50 checks)
5. Free-first-check fallback trigger (§6)

## 16. Appendix — designing screens in Claude Design

Do this after Phase 0 so the taxonomy and verdict fields are real.

1. In a regular claude.ai chat (not Claude Code), attach this PRD and ask: *"Create a design for IsThisQuoteFair in Claude Design: landing page with demo video slot, upload screen, processing state, verdict screen, shareable scorecard, and monthly-plan upsell. Mobile-first, high contrast, large type, trustworthy and modern, no 'scam' language. Use §5 and §7 for content."*
2. Iterate on the canvas: ask for 2–3 visual directions first, then refine one.
3. Ask Claude to also create a **design system** (colors, type, spacing, components) from the chosen direction so future screens stay consistent.
4. Export or share the design link and add it to `/docs/design.md`. Then give it to Claude Code: *"Implement the screens in `/docs/design.md` in `/apps/web` using Tailwind; match spacing and colors exactly."*
