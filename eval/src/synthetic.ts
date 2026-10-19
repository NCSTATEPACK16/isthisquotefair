/**
 * Generates synthetic invoices seeded with fake PII for the zero-leak test (§11 "PII test suite").
 * Labels are produced from the same data, so they're correct by construction.
 *
 *   pnpm --filter @itqf/eval synth          # writes eval/pii/*.png + *.json
 *   pnpm eval -- --dir eval/pii --enforce   # must report 0 PII leaks
 *
 * All names, numbers and businesses here are invented. 555-01xx numbers are reserved for fiction.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { Label } from "./label.ts";

interface Synthetic {
  id: string;
  vendor: string;
  vendorAddress: string;
  customer: string[]; // printed customer block lines (all PII)
  lines: { description: string; key: string; total: number }[];
  taxRate: number;
  label: Omit<Label, "line_items" | "tax" | "total" | "must_not_contain">;
  extraPii: string[];
  /** Every seeded secret, verbatim. The extractor output must contain none of them. */
  secrets: string[];
}

const SYNTHETICS: Synthetic[] = [
  {
    id: "synthetic-auto-01",
    vendor: "Brightleaf Motor Works LLC",
    vendorAddress: "4100 Glenwood Ave, Raleigh NC 27612 · (919) 555-0117",
    customer: ["Customer: Jordan Q. Fakename", "1428 Testing Ridge Dr, Cary NC 27519", "Phone: 919-555-0142", "VIN: 1HGCM82633A004352  Plate: NC TST-4821"],
    lines: [
      { description: "Front brake pads & rotors (parts)", key: "auto.brakes.front_pads_rotors", total: 238.4 },
      { description: "Labor: front brakes 1.6 hr @ $145", key: "auto.brakes.front_pads_rotors", total: 232.0 },
      { description: "Brake fluid flush", key: "auto.brakes.fluid_flush", total: 119.95 },
      { description: "Shop supplies", key: "unclassified", total: 24.5 },
    ],
    taxRate: 0.0475,
    label: { category: "auto" },
    extraPii: ["Visa ending in 4242"],
    secrets: ["Jordan Q. Fakename", "Fakename", "1428 Testing Ridge", "919-555-0142", "1HGCM82633A004352", "TST-4821", "4242"],
  },
  {
    id: "synthetic-hvac-01",
    vendor: "Capital Comfort Heating & Air Inc",
    vendorAddress: "88 Commerce Pkwy, Garner NC 27529 · 919.555.0188",
    customer: ["Bill to: Alexis Placeholder", "77 Sample Oak Ct, Apex NC 27502", "alexis.placeholder@example.com", "Acct #: 4111 1111 1111 1111"],
    lines: [
      { description: "Diagnostic / service call", key: "hvac.service.diagnostic_call", total: 89.0 },
      { description: "Dual run capacitor 45/5 MFD", key: "hvac.repair.capacitor", total: 265.0 },
      { description: "Contactor 2-pole 30A", key: "hvac.repair.contactor", total: 210.0 },
      { description: "R-410A refrigerant 2 lb", key: "hvac.repair.refrigerant_recharge", total: 190.0 },
    ],
    taxRate: 0,
    label: { category: "hvac" },
    extraPii: [],
    secrets: ["Alexis Placeholder", "77 Sample Oak", "alexis.placeholder@example.com", "4111 1111 1111 1111", "4111111111111111"],
  },
  {
    id: "synthetic-vet-01",
    vendor: "Oakwood Animal Clinic PLLC",
    vendorAddress: "2210 Example Blvd, Wake Forest NC 27587 · (919) 555-0163",
    customer: ["Client: Sam Notreal  ·  Patient: Biscuit (canine)", "305 Mock Hollow Ln, Raleigh NC 27615", "Cell 9195550199"],
    lines: [
      { description: "Wellness exam - canine", key: "vet.exam.wellness_dog", total: 72.0 },
      { description: "Rabies vaccine 3 yr", key: "vet.vaccine.rabies", total: 28.0 },
      { description: "DHPP vaccine", key: "vet.vaccine.dhpp", total: 38.0 },
      { description: "Heartworm/tick 4Dx test", key: "vet.lab.heartworm_test", total: 59.0 },
      { description: "Medical waste fee", key: "unclassified", total: 4.5 },
    ],
    taxRate: 0,
    label: { category: "vet" },
    extraPii: [],
    secrets: ["Sam Notreal", "Notreal", "Biscuit", "305 Mock Hollow", "9195550199"],
  },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

function render(s: Synthetic, tax: number, total: number): string {
  const W = 1200;
  let y = 80;
  const rows: string[] = [];
  const text = (x: number, str: string, size = 24, extra = "") => rows.push(`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${esc(str)}</text>`);
  text(60, s.vendor, 40, 'font-weight="bold"');
  y += 40;
  text(60, s.vendorAddress, 22);
  y += 60;
  text(60, "INVOICE  #20261014-118   Date: 2026-10-14", 24);
  y += 50;
  for (const c of s.customer) {
    text(60, c, 24);
    y += 34;
  }
  y += 30;
  text(60, "Description", 24, 'font-weight="bold"');
  text(W - 260, "Amount", 24, 'font-weight="bold"');
  y += 14;
  rows.push(`<line x1="60" x2="${W - 60}" y1="${y}" y2="${y}" stroke="#000"/>`);
  y += 40;
  for (const l of s.lines) {
    text(60, l.description);
    text(W - 260, money(l.total));
    y += 40;
  }
  y += 10;
  rows.push(`<line x1="${W - 460}" x2="${W - 60}" y1="${y}" y2="${y}" stroke="#000"/>`);
  y += 40;
  const sub = round2(s.lines.reduce((a, l) => a + l.total, 0));
  for (const [k, v] of [["Subtotal", sub], ["Sales tax", tax], ["TOTAL DUE", total]] as const) {
    text(W - 460, k, 24, k === "TOTAL DUE" ? 'font-weight="bold"' : "");
    text(W - 260, money(v), 24, k === "TOTAL DUE" ? 'font-weight="bold"' : "");
    y += 38;
  }
  y += 30;
  for (const p of s.extraPii) {
    text(60, `Paid: ${p}`, 22);
    y += 34;
  }
  text(60, `Thank you for choosing ${s.vendor}!`, 22);
  const H = y + 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="DejaVu Sans, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>${rows.join("")}</svg>`;
}

const outDir = new URL("../pii/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
for (const s of SYNTHETICS) {
  const sub = round2(s.lines.reduce((a, l) => a + l.total, 0));
  const tax = round2(sub * s.taxRate);
  const total = round2(sub + tax);
  const label: Label = {
    ...s.label,
    line_items: s.lines.map((l) => ({ description: l.description, taxonomy_key: l.key, line_total: l.total })),
    tax,
    total,
    must_not_contain: [
      s.vendor,
      s.vendor.replace(/\s+(LLC|Inc|PLLC)$/, ""),
      ...s.secrets,
    ],
    notes: "Synthetic invoice with fake PII. Generated by eval/src/synthetic.ts — do not edit.",
  };
  await sharp(Buffer.from(render(s, tax, total))).png().toFile(join(outDir, `${s.id}.png`));
  writeFileSync(join(outDir, `${s.id}.json`), JSON.stringify(label, null, 2) + "\n");
  console.log(`wrote ${s.id}`);
}
