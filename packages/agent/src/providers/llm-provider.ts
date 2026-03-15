/**
 * LLMProvider — agent-agnostic interface for language model backends.
 *
 * Any provider (Claude, OpenAI, Ollama, …) implements this interface.
 * KageAgent depends only on this interface, not on any specific SDK.
 */

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMChatOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface LLMThinkOptions extends LLMChatOptions {
  /** Token budget for internal chain-of-thought (provider-specific) */
  budgetTokens?: number;
}

export interface LLMResponse {
  /** Final visible text returned to the user */
  text: string;
  /**
   * Raw internal reasoning text (if the provider supports it).
   * Kage hashes this and anchors it on Solana — never shown to user.
   */
  reasoning?: string;
  /** Parsed reasoning steps for UI step-animation */
  reasoningSteps?: string[];
}

export interface LLMProvider {
  /** Human-readable name, e.g. "claude" | "openai" | "ollama" */
  readonly name: string;
  /** Model identifier that will be logged / shown in demo */
  readonly model: string;

  /**
   * Standard chat completion — fast path, no internal reasoning.
   */
  chat(
    messages: LLMMessage[],
    systemPrompt: string,
    options?: LLMChatOptions
  ): Promise<LLMResponse>;

  /**
   * Deep-think / extended reasoning — optional.
   * Providers that don't support this should either:
   *   - fall back to chat(), or
   *   - throw a descriptive error.
   */
  think?(
    messages: LLMMessage[],
    systemPrompt: string,
    options?: LLMThinkOptions
  ): Promise<LLMResponse>;

  /**
   * Fast chain-of-thought simulation — optional.
   * Used to generate numbered reasoning steps cheaply before the final answer.
   * Providers that skip this return an empty steps array.
   */
  reason?(userMessage: string): Promise<string[]>;
}
