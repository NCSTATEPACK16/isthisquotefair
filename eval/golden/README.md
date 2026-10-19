# Golden set

30 real invoices (5 per v1 category), hand-labeled. This is the launch gate in PRD §11:
**≥ 95 % line-item accuracy and 100 % total reconciliation**, plus zero PII leaks.

## Before you commit an invoice

Black out, **on the image itself** (not just in the label):

- customer name, address, phone, email
- VIN, license plate, account / card numbers, pet name
- **the business name, logo, address and phone** (we never store vendor names, golden set included)

Keep every price, quantity, hour and line description legible. Check the result at 100 % zoom.

## Files

```
eval/golden/
  auto-01.jpg            single page   (.jpg .jpeg .png .webp or .pdf)
  auto-01.json           label
  hvac-02.p1.jpg         multi-page: .p1, .p2, ... (max 5)
  hvac-02.p2.jpg
  hvac-02.json
```

Name cases `<category>-<nn>`, where category is one of `auto hvac plumbing electrical vet telecom`.

## Label format (`<id>.json`)

```json
{
  "category": "auto",
  "line_items": [
    { "description": "Front pads & rotors", "taxonomy_key": "auto.brakes.front_pads_rotors", "line_total": 238.40 },
    { "description": "Labor 1.6 hr",        "taxonomy_key": "auto.brakes.front_pads_rotors", "line_total": 232.00 },
    { "description": "Shop supplies",       "taxonomy_key": "unclassified",                  "line_total": 24.50 }
  ],
  "tax": 29.21,
  "total": 644.06,
  "must_not_contain": [],
  "notes": "optional free text"
}
```

Labeling rules (they mirror the extraction prompt in `packages/core/src/extract/prompt.ts`):

- One entry per billed line, in printed order. **No** subtotal, tax, total or payment lines.
- `line_total` is the printed extended amount; discounts are negative.
- Parts and labor for the same job are separate lines with the **same** `taxonomy_key`.
- Use `"unclassified"` when no key in `/taxonomy` fits (shop supplies, misc fees). Don't force a match.
- `tax` is the sum of tax lines (or `null`); `total` is the grand total / amount due.
- `must_not_contain`: strings that must never appear in output. Usually empty for real invoices
  (you've blacked them out). The synthetic PII set in `eval/pii/` uses it heavily.

## Scoring

- **Line-item accuracy** = labeled lines whose amount (±$0.01) *and* taxonomy key were both
  extracted, divided by `max(labeled lines, extracted lines)`, so missing and extra lines both count.
- **Total reconciliation**: extracted total = labeled total (±$0.01) **and** Σ extracted lines + tax =
  extracted total (±$0.05). An errored case counts as a failure.
- **PII leaks**: regex sweep + vendor-name check + `must_not_contain` on the extractor output.

Run `pnpm eval` (needs `ANTHROPIC_API_KEY`); add `-- --enforce` to exit non-zero below the bar.
