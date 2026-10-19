# Privacy policy (draft, not reviewed)

> ⚠ Placeholder. A lawyer must review this before we charge money (PRD §10). Re-check NC privacy
> law status (H 462 / S 757) before launch.

Plain-English summary of what the product does today (keep in sync with `supabase/migrations`):

- **Invoice images** are processed in memory to read the line items and are never saved.
- **Without opt-in**, we keep one operational record per check: category, county, model used,
  token counts, cost, processing time, and whether it succeeded. No prices, line items or images.
- **With opt-in**, we add each line item's service type, price, quantity, labor hours/rate, county,
  ZIP and service month to a shared local price database. No business name, no personal details,
  no image. These rows aren't linked to you, so we can't find and delete them later.
- **Monthly plan**: your saved checks are linked to your account and deleted when you delete it.
- **Payments** are handled by Stripe; we store only Stripe's session / customer ID.
- We don't sell data.
