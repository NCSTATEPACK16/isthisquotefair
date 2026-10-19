/**
 * ZIP → county (5-digit county FIPS). Counties are keyed by FIPS so we can expand statewide
 * without schema changes (§3).
 *
 * ⚠ ZIPs do not nest in counties. Each entry is the ZIP's *primary* county (most addresses);
 * split ZIPs are marked. Before launch, regenerate this from the HUD USPS ZIP–County crosswalk.
 */
export interface County {
  fips: string;
  name: string;
  state: "NC";
}

export const COUNTIES: Record<string, County> = {
  "37183": { fips: "37183", name: "Wake", state: "NC" },
  "37085": { fips: "37085", name: "Harnett", state: "NC" },
  "37101": { fips: "37101", name: "Johnston", state: "NC" },
};

/** Launch region. Checks from other counties are refused at upload (Phase 1). */
export const LAUNCH_COUNTIES = new Set(["37183"]);

const WAKE = "37183";
// prettier-ignore
const ZIP_TO_FIPS: Record<string, string> = {
  // Raleigh
  "27601": WAKE, "27603": WAKE, "27604": WAKE, "27605": WAKE, "27606": WAKE, "27607": WAKE,
  "27608": WAKE, "27609": WAKE, "27610": WAKE, "27612": WAKE, "27613": WAKE, "27614": WAKE,
  "27615": WAKE, "27616": WAKE, "27617": WAKE,
  // Cary / Morrisville / Apex / New Hill
  "27511": WAKE, "27513": WAKE, "27518": WAKE, "27519": WAKE, "27560": WAKE,
  "27502": WAKE, "27523": WAKE, "27539": WAKE, "27562": WAKE,
  // Holly Springs / Fuquay-Varina (27526 split w/ Harnett) / Willow Spring (27592 split w/ Johnston)
  "27540": WAKE, "27526": WAKE, "27592": WAKE,
  // Garner (27529 split w/ Johnston) / Knightdale / Wendell / Zebulon (27597 split) / Rolesville
  "27529": WAKE, "27545": WAKE, "27591": WAKE, "27597": WAKE, "27571": WAKE,
  // Wake Forest (27587 split w/ Franklin/Granville)
  "27587": WAKE,
};

export function countyForZip(zip: string | null | undefined): County | undefined {
  const z5 = zip?.trim().slice(0, 5);
  if (!z5 || !/^\d{5}$/.test(z5)) return undefined;
  const fips = ZIP_TO_FIPS[z5];
  return fips ? COUNTIES[fips] : undefined;
}
