import type { z } from "zod";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: ImageMediaType; base64: string }
  | { type: "pdf"; base64: string };

export interface LLMUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface StructuredRequest<S extends z.ZodType> {
  model: string;
  system: string;
  content: ContentPart[];
  schema: S;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface StructuredResponse<T> {
  data: T;
  usage: LLMUsage;
  latencyMs: number;
}

/**
 * Every model call goes through this interface (§8 Models) so the model/vendor is a config change.
 * Implementations must return schema-valid JSON via the vendor's native structured-output feature
 * (never assistant prefill or "please reply in JSON" parsing).
 */
export interface LLMProvider {
  readonly name: string;
  generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResponse<z.infer<S>>>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly reason: "refusal" | "truncated" | "unparseable" | "not_implemented",
  ) {
    super(message);
    this.name = "LLMError";
  }
}
