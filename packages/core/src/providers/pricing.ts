/**
 * USD per million tokens. Verify against Anthropic's pricing page before relying on cost alerts.
 * Haiku 5.5 rates apply to prompts ≤ 100K tokens (every check is far below that).
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** Claude web search: $10 per 1,000 searches. */
export const WEB_SEARCH_USD_PER_CALL = 0.01;

export function tokenCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICES[model];
  if (!p) return Number.NaN; // unknown model: surface as NaN so the cost guard notices
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** §11 cost guard thresholds. */
export const COST_ALERT_AVG_USD = 0.05;
export const COST_ALERT_SINGLE_USD = 0.25;
