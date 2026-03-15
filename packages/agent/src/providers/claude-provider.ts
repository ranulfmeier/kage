import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMMessage, LLMChatOptions, LLMThinkOptions, LLMResponse } from "./llm-provider.js";

const FAST_MODEL = "claude-haiku-4-5-20251001";
const THINK_MODEL = "claude-3-7-sonnet-20250219";

export interface ClaudeProviderConfig {
  apiKey: string;
  /** Override fast model (default: claude-haiku-4-5) */
  fastModel?: string;
  /** Override deep-think model (default: claude-3-7-sonnet) */
  thinkModel?: string;
}

/**
 * ClaudeProvider — wraps Anthropic SDK.
 *
 * - chat()   → claude-haiku (fast, cheap)
 * - think()  → claude-3-7-sonnet with Extended Thinking
 * - reason() → haiku chain-of-thought simulation (numbered steps)
 */
export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  readonly model: string;

  private client: Anthropic;
  private fastModel: string;
  private thinkModel: string;

  constructor(config: ClaudeProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.fastModel = config.fastModel ?? FAST_MODEL;
    this.thinkModel = config.thinkModel ?? THINK_MODEL;
    this.model = this.fastModel;
  }

  async chat(
    messages: LLMMessage[],
    systemPrompt: string,
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const resp = await this.client.messages.create({
      model: this.fastModel,
      max_tokens: options?.maxTokens ?? 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = resp.content.find((c) => c.type === "text") as
      | { type: "text"; text: string }
      | undefined;

    return { text: textBlock?.text ?? "" };
  }

  async think(
    messages: LLMMessage[],
    systemPrompt: string,
    options?: LLMThinkOptions
  ): Promise<LLMResponse> {
    const params: Parameters<typeof this.client.messages.create>[0] = {
      model: this.thinkModel,
      max_tokens: options?.maxTokens ?? 16000,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    // @ts-ignore — Extended Thinking API (not yet in type defs)
    params.thinking = { type: "enabled", budget_tokens: options?.budgetTokens ?? 8000 };

    const resp = await this.client.messages.create(params) as Awaited<
      ReturnType<typeof this.client.messages.create>
    >;

    const thinkingBlock = (resp as any).content?.find((c: any) => c.type === "thinking");
    const textBlock = (resp as any).content?.find((c: any) => c.type === "text");

    const reasoning: string = thinkingBlock?.thinking ?? "";
    const reasoningSteps = reasoning
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 20)
      .slice(0, 6);

    return {
      text: textBlock?.text ?? "",
      reasoning: reasoning || undefined,
      reasoningSteps,
    };
  }

  async reason(userMessage: string): Promise<string[]> {
    const resp = await this.client.messages.create({
      model: this.fastModel,
      max_tokens: 350,
      system:
        "You are a concise reasoning assistant. Given a task or question, outline your chain-of-thought in 3-5 numbered steps. Each step must be one short, specific sentence. Output only the numbered list.",
      messages: [{ role: "user", content: `Reason through: "${userMessage}"` }],
    });

    const textBlock = resp.content.find((c) => c.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    const raw = textBlock?.text ?? "";

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

export function createClaudeProvider(apiKey: string, options?: Partial<ClaudeProviderConfig>): ClaudeProvider {
  return new ClaudeProvider({ apiKey, ...options });
}
