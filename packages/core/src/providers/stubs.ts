import type { z } from "zod";
import { LLMError, type LLMProvider, type StructuredRequest, type StructuredResponse } from "./llm.ts";

/** Placeholder so config can name it; implement with Gemini's `responseSchema` when needed. */
export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  async generateStructured<S extends z.ZodType>(_req: StructuredRequest<S>): Promise<StructuredResponse<z.infer<S>>> {
    throw new LLMError("GeminiProvider is not implemented yet", "not_implemented");
  }
}

/** Placeholder for any OpenAI-compatible endpoint (`response_format: json_schema`). */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai-compatible";
  constructor(readonly opts: { baseUrl: string; apiKey: string }) {}
  async generateStructured<S extends z.ZodType>(_req: StructuredRequest<S>): Promise<StructuredResponse<z.infer<S>>> {
    throw new LLMError("OpenAICompatibleProvider is not implemented yet", "not_implemented");
  }
}
