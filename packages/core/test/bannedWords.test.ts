import { describe, expect, it } from "vitest";
import { findBannedWords, normalizeForBannedCheck } from "../src/validators/bannedWords.ts";

const terms = (text: string) => findBannedWords({ talking_points: [text] }).map((f) => f.term);

describe("findBannedWords", () => {
  it.each([
    ["This quote is a scam.", "scam"],
    ["You got SCAMMED", "scammed"],
    ["a total rip-off", "rip off"],
    ["a total rip–off", "rip off"], // en dash
    ["ripoff pricing", "ripoff"],
    ["you were ripped off", "ripped off"],
    ["looks like fraud", "fraud"],
    ["price gouging during a heat wave", "price gouging"],
    ["they overcharged you", "overcharged"],
    ["s c a m", "scam"],
    ["sc@m", "scam"],
    ["r1p-0ff", "rip off"],
    ["fr​aud", "fraud"],
    ["shady shop", "shady"],
  ])("%s → %s", (text, term) => {
    expect(terms(text)).toContain(term);
  });

  it.each([
    "This quote is above the typical local range.",
    "Ask whether the labor estimate uses book time.",
    "Consider a second opinion before you sign.",
    "Scope of work may differ: OEM vs aftermarket parts.",
    "Prices vary by urgency, parts quality, and scope.",
    "Contractor estimates often include a trip charge.",
    "Confirm whether the condenser is covered by warranty.",
    "Ask about a con-current discount", // 'con' alone is not banned
  ])("allows neutral language: %s", (text) => {
    expect(terms(text)).toEqual([]);
  });

  it("skips invoice-derived description fields by default", () => {
    expect(findBannedWords({ lines: [{ description: "Fraud protection add-on" }] })).toEqual([]);
    expect(findBannedWords({ lines: [{ note: "Fraud protection add-on" }] })).toHaveLength(1);
  });

  it("normalizes leetspeak and punctuation", () => {
    expect(normalizeForBannedCheck("R1P-0FF!!")).toBe("rip off");
  });
});
