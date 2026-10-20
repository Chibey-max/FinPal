export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  /** Ask for a single JSON object back (OpenAI-style JSON mode). */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/**
 * A chat-completion model used only for wording. Callers must treat the
 * reply as untrusted text: validate it and never let it change a decision.
 */
export interface LlmClient {
  readonly model: string;
  complete(request: LlmCompletionRequest): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    readonly code: "LLM_UNAVAILABLE" | "LLM_AUTH_FAILED" | "LLM_BAD_RESPONSE",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
