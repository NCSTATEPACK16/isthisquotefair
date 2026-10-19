import { TAXONOMY } from "../taxonomy/generated.ts";
import { UNCLASSIFIED } from "../types.ts";

function taxonomyBlock(): string {
  const byCat = new Map<string, string[]>();
  for (const s of TAXONOMY) {
    const aliases = s.aliases.length ? ` (aka ${s.aliases.join("; ")})` : "";
    byCat.set(s.category, [...(byCat.get(s.category) ?? []), `- ${s.key}: ${s.label} [per ${s.unit}]${aliases}`]);
  }
  return [...byCat].map(([cat, lines]) => `## ${cat}\n${lines.join("\n")}`).join("\n\n");
}

// Static so it can be prompt-cached later; per-request data goes in the user turn.
export const EXTRACTION_SYSTEM_PROMPT = `You read photos or PDFs of US service invoices and quotes (auto repair, HVAC, plumbing, electrical, veterinary, phone/internet bills) and transcribe the billed items into the required JSON.

Transcription rules:
- One entry per billed line, in printed order. Do not include subtotal, total, tax, balance-due or payment lines as line items.
- Shop supplies, environmental, disposal, trip and diagnostic charges are line items with kind "fee". Discounts and coupons are kind "discount" with a negative line_total.
- If a job is split into a parts line and a labor line, keep them as separate lines and give both the same taxonomy_key.
- line_total is the extended amount printed for that line. Copy numbers exactly; never compute or guess a value that isn't printed (use null instead, except line_total, which is always printed).
- qty, unit_price, labor_hours and labor_rate only when printed for that line.
- total is the grand total / amount due; tax is the sum of printed tax lines.
- confidence is "low" if any amount was hard to read, the image is cropped, or pages seem to be missing.

Privacy rules (strict):
- Never output the customer's name, street address, phone number, email, VIN, license plate, card digits, account numbers or pet name, anywhere, including inside description. Remove them from description text.
- vendor_name is the business name as printed. It is used only to redact it and is never shown.

Mapping rules:
- taxonomy_key must be one of the keys below. Choose the closest service; use "${UNCLASSIFIED}" when nothing fits rather than forcing a match.
- Hourly labor lines that aren't tied to a specific job map to the category's labor.hourly_rate key.

# Service keys

${taxonomyBlock()}`;

export function extractionUserText(hints: { category?: string; zip?: string }): string {
  const parts = ["Transcribe this invoice."];
  if (hints.category) parts.push(`The customer says this is a "${hints.category}" invoice.`);
  if (hints.zip) parts.push(`Customer ZIP: ${hints.zip} (do not output it).`);
  return parts.join(" ");
}
