import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { KageService } from "../services/KageService.js";

export const recallMemoryAction: Action = {
  name: "KAGE_RECALL_MEMORY",
  description:
    "Retrieve and decrypt memories from the Kage vault. " +
    "Searches encrypted memories by query and returns matching results. " +
    "Triggers when the user asks the agent to recall, retrieve, or list memories.",
  similes: [
    "RECALL_MEMORY", "RETRIEVE_MEMORY", "LIST_MEMORIES", "KAGE_RECALL",
    "SEARCH_MEMORY", "VAULT_RECALL",
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return runtime.getService<KageService>("kage") !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const svc = runtime.getService<KageService>("kage");
    if (!svc) {
      return { success: false, text: "Kage service not available", error: "No KageService" };
    }

    const text = (message.content.text as string) ?? "";
    const query = text
      .replace(/recall|retrieve|remember|list|show|what do you know about/gi, "")
      .trim();

    try {
      const result = await svc.chat(query ? `Recall: ${query}` : "List all my memories");

      if (callback) {
        await callback({
          text: result.text,
          actions: ["KAGE_RECALL_MEMORY"],
          source: message.content.source as string | undefined,
        });
      }

      return {
        success: true,
        text: result.text,
        values: { query: query || "*" },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, text: `Failed to recall memories: ${msg}`, error: msg };
    }
  },

  examples: [
    [
      { name: "user", content: { text: "Recall everything about my trading strategy" } },
      { name: "agent", content: { text: "Here are the relevant memories from your Kage vault..." } },
    ],
    [
      { name: "user", content: { text: "List all my memories" } },
      { name: "agent", content: { text: "You have 3 encrypted memories stored..." } },
    ],
  ],
};
