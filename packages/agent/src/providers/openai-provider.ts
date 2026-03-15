import OpenAI from "openai";
import type { LLMProvider, LLMMessage, LLMChatOptions, LLMThinkOptions, LLMResponse } from "./llm-provider.js";

const FAST_MODEL = "gpt-4o-mini";
const THINK_MODEL = "o1";

export interface OpenAIProviderConfig {
  apiKey: string;
  /** Override fast model (default: gpt-4o-mini) */
  fastModel?: string;
  /**
   * Override reasoning model (default: o1).
   * Use "o3-mini" or "o3" for stronger reasoning.
   */
  thinkModel?: string;
  /** Optional base URL for compatible APIs (Ollama, Azure, Together, etc.) */
  baseURL?: string;
}

/**
 * OpenAIProvider — wraps the OpenAI SDK.
 *
 * - chat()   → gpt-4o-mini (fast, cheap)
 * - think()  → o1 (internal CoT, no system prompt)
 * - reason() → gpt-4o-mini numbered steps simulation
 *
 * Also works with any OpenAI-compatible API via baseURL:
 *   - Ollama:   baseURL = "http://localhost:11434/v1", apiKey = "ollama"
 *   - Together: baseURL = "https://api.together.xyz/v1"
 *   - Groq:     baseURL = "https://api.groq.com/openai/v1"
 */
export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;

  private client: OpenAI;
  private fastModel: string;
  private thinkModel: string;

  constructor(config: OpenAIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.fastModel = config.fastModel ?? FAST_MODEL;
    this.thinkModel = config.thinkModel ?? THINK_MODEL;
    this.model = this.fastModel;
    // Derive friendly name from baseURL if provided
    this.name = config.baseURL
      ? config.baseURL.includes("ollama") || config.baseURL.includes("11434")
        ? "ollama"
        : config.baseURL.includes("groq")
        ? "groq"
        : config.baseURL.includes("together")
        ? "together"
        : "openai-compatible"
      : "openai";
  }

  async chat(
    messages: LLMMessage[],
    systemPrompt: string,
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const resp = await this.client.chat.completions.create({
      model: this.fastModel,
      max_tokens: options?.maxTokens ?? 4096,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    return { text: resp.choices[0]?.message?.content ?? "" };
  }

  async think(
    messages: LLMMessage[],
    systemPrompt: string,
    options?: LLMThinkOptions
  ): Promise<LLMResponse> {
    // o1/o3 models don't accept system messages — prepend as first user message
    const combinedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "user",
        content: `[System context]\n${systemPrompt}\n\n[User message]\n${messages[messages.length - 1]?.content ?? ""}`,
      },
    ];

    const resp = await this.client.chat.completions.create({
      model: this.thinkModel,
      max_completion_tokens: options?.maxTokens ?? 16000,
      messages: combinedMessages,
    });

    const text = resp.choices[0]?.message?.content ?? "";

    // o1 exposes reasoning_tokens in usage but not the actual content
    // We simulate reasoning steps from the response for Kage's reasoning plugin
    const reasoningSteps = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 20)
      .slice(0, 6);

    return {
      text,
      // o1 doesn't expose raw reasoning text — use text as proxy for hashing
      reasoning: text.length > 0 ? `[o1 reasoning — ${resp.usage?.completion_tokens_details?.reasoning_tokens ?? 0} tokens]` : undefined,
      reasoningSteps,
    };
  }

  async reason(userMessage: string): Promise<string[]> {
    const resp = await this.client.chat.completions.create({
      model: this.fastModel,
      max_tokens: 350,
      messages: [
        {
          role: "system",
          content:
            "You are a concise reasoning assistant. Given a task or question, outline your chain-of-thought in 3-5 numbered steps. Each step must be one short, specific sentence. Output only the numbered list.",
        },
        { role: "user", content: `Reason through: "${userMessage}"` },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "";
    let steps = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+[\.\)]\s/.test(l))
      .slice(0, 5);

    if (steps.length === 0) {
      steps = raw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 15)
        .slice(0, 4);
    }

    return steps;
  }
}

export function createOpenAIProvider(apiKey: string, options?: Partial<OpenAIProviderConfig>): OpenAIProvider {
  return new OpenAIProvider({ apiKey, ...options });
}

/** Convenience: create Ollama provider (local, no API key needed) */
export function createOllamaProvider(model = "llama3.1"): OpenAIProvider {
  return new OpenAIProvider({
    apiKey: "ollama",
    baseURL: "http://localhost:11434/v1",
    fastModel: model,
    thinkModel: model,
  });
}
