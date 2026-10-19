# Design brief: IsThisQuoteFair (Phase 1 screens)

Paste this whole file into Claude Design, attach `docs/PRD.md`, and start with:
**"Give me 3 distinct visual directions for the verdict screen first, using the sample data below.
Then I'll pick one and we'll do the rest of the screens and a design system."**

---

## Product in one line

Photograph a service quote (car repair, HVAC, plumbing, electrical, vet, phone/internet bill) and
see whether it's **below, within, or above the typical Wake County, NC range**, line by line, with
the sources shown. A $1.99 impulse purchase, so it has to look trustworthy in the first 3 seconds.

## Who it's for

- Homeowners and car owners in Raleigh, Cary, Apex, Fuquay-Varina, Holly Springs, Garner, Wake Forest.
  They're holding a quote they haven't paid yet, or they just paid and feel uneasy.
- **Adult children checking quotes for aging parents.** Design for them too: large type, high
  contrast, one obvious action per screen, nothing that depends on hover or small icons.

## Feel

Calm, neutral, factual, like a good bank statement or a weather app, **not** a consumer-outrage
site. Competitors look dated, and a polished, fast, honest UI is our edge. Local without being
kitschy (a hint of Raleigh is fine, no oak-leaf clip art).

## Hard rules

- **Mobile-first at 375 px wide**, then a desktop layout. Installable PWA (no browser chrome).
- Body text ≥ 18 px, tap targets ≥ 48 px, **WCAG AA contrast** at minimum. Light and dark themes.
- **Never use red/green alone** to signal above/below. Pair color with a label and an icon/shape
  (color-blind users, and red reads as "danger" or "accusation").
- **Banned words anywhere in the UI:** scam, rip-off, ripped off, fraud, gouging, overcharged,
  cheat, shady, predatory. Say "above the typical local range".
- **No business names, logos or addresses** anywhere, including the shareable scorecard.
- Every verdict shows a disclaimer: *"Informational only. Prices vary with scope, parts quality
  and urgency. Not professional advice."*
- Built afterwards in **React + Tailwind**, so prefer a spacing/color system that maps cleanly onto
  Tailwind tokens.

## Screens

1. **Landing**
   - Hero with the value proposition, and the **price shown up front** ($1.99 a check; 3 for $3.99;
     $9/mo unlimited).
   - **Demo video slot** (30–45 s, 9:16 on mobile, 16:9 on desktop) with a poster frame.
   - One primary button: **"Check my quote"**.
   - Trust strip: "Based on real Wake County invoices + local price sources", "We never store
     your photo", "We never name the business".
   - Short how-it-works (3 steps) and an FAQ.
2. **ZIP + category (before paying)**: enter a ZIP; if it's outside Wake County, show a friendly
   "We're only in Wake County for now. Get notified when we expand" with no payment.
3. **Pay**: hand-off to Stripe Checkout (just the pre-checkout summary and the return/success state).
4. **Upload**
   - Camera or file picker, up to 5 pages or a PDF, with page thumbnails (reorder, remove).
   - Category chips (pre-selected by AI, editable): Auto · HVAC · Plumbing · Electrical · Vet · Phone/Internet.
   - Turnstile bot check (invisible or small).
   - **Consent checkbox, unchecked by default**, at the bottom: "Add my anonymized line items to
     the local price database." with a "What does this mean?" link to a plain-English sheet.
5. **Processing** (10–20 s): three named steps that advance: *Reading invoice → Finding local
   prices → Comparing*. Should feel alive, not like a stuck spinner.
6. **Verdict** (the most important screen; see sample data)
   - Overall gauge: **Below / Within / Above typical range** + "% vs local median".
   - Line-item table: item, your price, typical range (as a small range bar with the price marked), flag.
   - **"Based on" box:** number of local invoices, number of price sources (tappable links),
     confidence **Low / Medium / High**.
   - 3–5 neutral talking points.
   - Actions: Download PNG / PDF, Share scorecard, "Was this helpful?" 👍/👎.
   - Monthly upsell card (deep analysis, history), clearly secondary.
7. **Shareable scorecard image** (1080×1350 and 1200×630): overall verdict, % vs median,
   category, town, "Based on N invoices + M sources", our brand. **No business name, no line prices.**
8. **Monthly plan upsell / paywall sheet**: compare Single vs Monthly (table in PRD §7).
9. **Sign-in** (magic link email) and **History** list for monthly users.

## States to design (don't skip these; they're most of real life)

- **Low confidence:** verdict still shown, with a plain "Limited local data" banner.
- **Not enough local data** for a line (no range; show "—" and an explanation), and for the
  whole quote.
- **Unclassified lines** (e.g. "Shop supplies $24.50"): listed but marked "Not compared".
- **Couldn't read the photo:** retake tips, and "Your check credit was not used".
- **Outside Wake County** (screen 2).
- **Offline / slow network** during processing.

## Sample data (fictional, for mockups)

Category: Auto repair · Cary (27519) · Based on **14 Wake County invoices + 3 price sources** ·
Confidence **Medium**

| Item | Your price | Typical range | Flag |
|---|---|---|---|
| Front brake pads & rotors (parts + labor) | $470.40 | $320 – $610 | Within |
| Brake fluid flush | $119.95 | $80 – $110 | Above (+20 % vs median $100) |
| Cabin air filter | $89.00 | $45 – $85 | Above |
| Shop supplies | $24.50 | — | Not compared |

Overall: **Within typical range**, +6 % vs local median. Total $703.85 (tax $29.21 not compared).

Talking points:
- Ask whether the brake fluid flush was recommended by mileage or by a moisture test.
- Cabin filters are often a do-it-yourself part. Ask for the part number and price it separately.
- Ask whether the labor estimate uses book time.

Second sample to also mock: HVAC, **Above typical range** (+31 %), confidence **High**
(27 invoices + 4 sources), with a line "Dual run capacitor 45/5 — $265 (typical $150–$230)".

## Deliverables

1. 3 visual directions for the verdict screen → pick one.
2. All screens and states above, mobile and desktop.
3. A **design system**: color tokens (light/dark), type scale, spacing, radii, and the components
   used (button, chip, range bar, gauge, flag badge, table row, banner, upload tile, step progress).
4. Export / share link → add it to `docs/design.md` for implementation in `apps/web`.
