import { z } from "zod";

import {
  LlmError,
  type LlmClient,
  type LlmCompletionRequest,
} from "./llm-client";

export interface GroqHttpClientOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

// Reasoning models spend part of the completion budget on hidden reasoning,
// so they get low effort and room for it on top of the visible reply.
const isReasoningModel = (model: string) => model.startsWith("openai/gpt-oss");
const REASONING_ALLOWANCE = 600;
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

const completionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
});

/** Groq's OpenAI-compatible chat completions endpoint. */
export function createGroqHttpClient(
  options: GroqHttpClientOptions,
): LlmClient {
  let baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const model = options.model ?? DEFAULT_GROQ_MODEL;

  return {
    model,
    async complete(request: LlmCompletionRequest): Promise<string> {
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: request.messages,
            temperature: request.temperature ?? 0.2,
            max_completion_tokens:
              (request.maxTokens ?? 300) +
              (isReasoningModel(model) ? REASONING_ALLOWANCE : 0),
            ...(isReasoningModel(model) ? { reasoning_effort: "low" } : {}),
            ...(request.json
              ? { response_format: { type: "json_object" } }
              : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new LlmError("LLM_UNAVAILABLE", "Groq could not be reached.");
      }

      if (response.status === 401 || response.status === 403) {
        throw new LlmError("LLM_AUTH_FAILED", "Groq rejected the API key.");
      }
      if (!response.ok) {
        throw new LlmError(
          "LLM_UNAVAILABLE",
          `Groq returned HTTP ${response.status}.`,
        );
      }

      const parsed = completionSchema.safeParse(
        await response.json().catch(() => null),
      );
      const content = parsed.success
        ? parsed.data.choices[0]?.message.content?.trim()
        : undefined;
      if (!content) {
        throw new LlmError("LLM_BAD_RESPONSE", "Groq returned no text.");
      }
      return content;
    },
  };
}
