export const CATEGORIES = ["auto", "hvac", "plumbing", "electrical", "vet", "telecom"] as const;
export type Category = (typeof CATEGORIES)[number];

export const UNITS = ["job", "hour", "each", "month"] as const;
export type Unit = (typeof UNITS)[number];

export type Confidence = "low" | "medium" | "high";
export type Flag = "below" | "within" | "above" | "insufficient_data" | "unclassified";

/** Sentinel taxonomy key for line items the extractor could not map. Excluded from verdict math. */
export const UNCLASSIFIED = "unclassified" as const;
