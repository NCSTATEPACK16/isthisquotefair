import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { LLMError, type ContentPart, type LLMProvider, type StructuredRequest, type StructuredResponse } from "./llm.ts";
import { tokenCostUsd } from "./pricing.ts";

function toClaudeContent(parts: ContentPart[]): Anthropic.ContentBlockParam[] {
  return parts.map((p): Anthropic.ContentBlockParam => {
    switch (p.type) {
      case "text":
        return { type: "text", text: p.text };
      case "image":
        return { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } };
      case "pdf":
        return { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.base64 } };
    }
  });
}

/**
 * Claude via the Messages API with structured outputs (`output_config.format`).
 * Haiku 5.5 rejects assistant prefill and non-default sampling params, so neither is sent.
 */
export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  private readonly client: Anthropic;

  constructor(opts: { apiKey?: string; client?: Anthropic } = {}) {
    this.client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  }

  async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResponse<z.infer<S>>> {
    const started = Date.now();
    const res = await this.client.messages.parse({
      model: req.model,
      max_tokens: req.maxTokens ?? 8000,
      system: req.system,
      messages: [{ role: "user", content: toClaudeContent(req.content) }],
      output_config: { format: zodOutputFormat(req.schema), ...(req.effort ? { effort: req.effort } : {}) },
    });
    const latencyMs = Date.now() - started;

    if (res.stop_reason === "refusal") throw new LLMError(`model refused (${res.stop_details?.category ?? "unknown"})`, "refusal");
    if (res.stop_reason === "max_tokens") throw new LLMError("output hit max_tokens", "truncated");
    if (res.parsed_output == null) throw new LLMError("structured output missing or failed schema validation", "unparseable");

    return {
      data: res.parsed_output as z.infer<S>,
      latencyMs,
      usage: {
        model: req.model,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        costUsd: tokenCostUsd(req.model, res.usage.input_tokens, res.usage.output_tokens),
      },
    };
  }
}
