import { describe, expect, it } from "vitest";
import { findPii, findVendorName, redactVendor } from "../src/validators/pii.ts";
import { validateOutgoing } from "../src/validators/index.ts";

const kinds = (v: unknown) => findPii(v).map((f) => f.kind);

describe("findPii — catches seeded PII", () => {
  it.each([
    ["phone (919) 555-0142", "phone"],
    ["call 919-555-0142", "phone"],
    ["919.555.0142", "phone"],
    ["+1 919 555 0142", "phone"],
    ["9195550142", "phone"],
    ["VIN 1HGCM82633A004352", "vin"],
    ["vin: 5yjsa1e26hf000337", "vin"],
    ["card 4111 1111 1111 1111", "card_number"],
    ["4111-1111-1111-1111", "card_number"],
    ["378282246310005", "card_number"],
    ["Visa XXXX-XXXX-XXXX-4242", "card_number"],
    ["paid with card ending in 4242", "card_number"],
    ["jane.doe@example.com", "email"],
    ["123 Main St, Raleigh NC", "street_address"],
    ["4501 N. Hills Blvd.", "street_address"],
    ["Service at 88 Oak Forest Dr Apt 3", "street_address"],
    ["700 Fayetteville Street Raleigh, NC 27601", "street_address"],
    ["12 Elm Ct 27513", "street_address"],
  ])("%s → %s", (text, kind) => {
    expect(kinds({ talking_points: [text] })).toContain(kind);
  });

  it("checks integer numbers too (phone stored as a number)", () => {
    expect(kinds({ x: 9195550142 })).toContain("phone");
  });

  it("reports JSON paths", () => {
    expect(findPii({ lines: [{ description: "ok" }, { description: "call 919-555-0142" }] })[0]?.path).toBe("lines[1].description");
  });
});

describe("findPii — leaves normal invoice text alone", () => {
  it.each([
    "Front brake pads and rotors",
    "1.5 hr labor drive belt replacement",
    "Replace serpentine belt — 2.3 hrs @ $145.00/hr",
    "Capacitor 45/5 MFD 440V",
    "R-410A refrigerant 3 lb",
    "Oil change 5W-30 full synthetic, 5 qt",
    "Invoice total $1,284.37",
    "Rabies vaccine 3 year",
    "Panel upgrade 200A, 40 circuits",
    "Above typical local range by 18%",
    "Ask whether the labor estimate uses book time.",
    "Part #45-1032 brake pad set",
    "Service month 2026-10",
    "2 Ave Maria tires", // number + word + "Ave" mid-phrase
  ])("%s", (text) => {
    expect(findPii({ description: text })).toEqual([]);
  });

  it("ignores plain prices as numbers", () => {
    expect(findPii({ line_total: 1284.37, qty: 2, unit_price: 145 })).toEqual([]);
  });
});

describe("vendor name", () => {
  it("finds vendor names case/punctuation-insensitively, with or without suffix", () => {
    expect(findVendorName({ d: "Thanks for choosing SMITH-PLUMBING!" }, "Smith Plumbing LLC")).toHaveLength(1);
    expect(findVendorName({ d: "smith plumbing llc" }, "Smith Plumbing LLC")).toHaveLength(1);
    expect(findVendorName({ d: "Kitchen faucet" }, "Smith Plumbing LLC")).toEqual([]);
  });
  it("ignores very short vendor names to avoid matching everything", () => {
    expect(findVendorName({ d: "AC tune up" }, "AC")).toEqual([]);
  });
  it("redacts vendor names in descriptions", () => {
    expect(redactVendor("Smith Plumbing, LLC service call", "Smith Plumbing, LLC")).toBe("[business] service call");
    expect(redactVendor("SMITH PLUMBING warranty", "Smith Plumbing LLC")).toBe("[business] warranty");
  });
});

describe("validateOutgoing", () => {
  it("passes a clean verdict", () => {
    const r = validateOutgoing({ flag: "above", talking_points: ["Ask for an itemized parts list."], lines: [{ description: "Front pads" }] });
    expect(r.ok).toBe(true);
  });
  it("fails on PII, vendor name, or banned words", () => {
    expect(validateOutgoing({ t: "919-555-0142" }).ok).toBe(false);
    expect(validateOutgoing({ t: "Acme Heating did the job" }, { vendorName: "Acme Heating" }).ok).toBe(false);
    expect(validateOutgoing({ talking_points: ["This looks like a scam"] }).ok).toBe(false);
  });
});
