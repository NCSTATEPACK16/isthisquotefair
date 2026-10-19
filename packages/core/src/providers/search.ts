/**
 * Grounding search (§8 step 3) behind one interface so we can benchmark Claude web search against
 * a cheaper API (open decision §15.4).
 *
 * A provider returns *evidence*: URLs plus the exact text it saw. Turning evidence into
 * low/typical/high numbers is a separate structured-output step (see ground/), and every number
 * must appear verbatim in an excerpt from a returned URL, so the model can't invent prices.
 */
export interface SearchEvidence {
  url: string;
  title: string | null;
  excerpt: string;
}

export interface SearchRequest {
  query: string;
  /** Hard cap on searches this call may run (cost guard). */
  maxSearches: number;
  location?: { city: string; region: string; country: "US" };
}

export interface SearchResponse {
  evidence: SearchEvidence[];
  searches: number;
  costUsd: number;
}

export interface SearchProvider {
  readonly name: string;
  search(req: SearchRequest): Promise<SearchResponse>;
}
