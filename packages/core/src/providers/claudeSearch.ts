import Anthropic from "@anthropic-ai/sdk";
import { tokenCostUsd, WEB_SEARCH_USD_PER_CALL } from "./pricing.ts";
import type { SearchEvidence, SearchProvider, SearchRequest, SearchResponse } from "./search.ts";

/**
 * Claude's server-side web search. Result page content is encrypted, so the readable evidence is
 * the `cited_text` of each web_search_result_location citation on the answer text.
 *
 * ⚠ Not yet exercised against the live API. Haiku 5.5 is documented for the basic
 * `web_search_20250305` tool; the newer dynamic-filtering variants are Opus/Sonnet only.
 */
export class ClaudeWebSearchProvider implements SearchProvider {
  readonly name = "claude-web-search";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: { apiKey?: string; client?: Anthropic; model?: string } = {}) {
    this.client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
    this.model = opts.model ?? "claude-haiku-5-5";
  }

  async search(req: SearchRequest): Promise<SearchResponse> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      system:
        "You research typical local prices for home and auto services. Search the web, then quote the price figures you found " +
        "verbatim with citations. Prefer pages with local (city/state) prices and recent dates. Do not estimate or add figures that " +
        "are not on a page you cite.",
      messages: [{ role: "user", content: `Find typical prices for: ${req.query}` }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: req.maxSearches,
          ...(req.location ? { user_location: { type: "approximate" as const, ...req.location } } : {}),
        },
      ],
    });

    const evidence: SearchEvidence[] = [];
    for (const block of res.content) {
      if (block.type !== "text" || !block.citations) continue;
      for (const c of block.citations) {
        if (c.type === "web_search_result_location") evidence.push({ url: c.url, title: c.title, excerpt: c.cited_text });
      }
    }
    const searches = res.usage.server_tool_use?.web_search_requests ?? 0;
    return {
      evidence,
      searches,
      costUsd: tokenCostUsd(this.model, res.usage.input_tokens, res.usage.output_tokens) + searches * WEB_SEARCH_USD_PER_CALL,
    };
  }
}

/** Placeholder for Brave Search API (needs BRAVE_SEARCH_API_KEY). */
export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";
  constructor(readonly opts: { apiKey: string }) {}
  async search(_req: SearchRequest): Promise<SearchResponse> {
    throw new Error("BraveSearchProvider is not implemented yet");
  }
}
