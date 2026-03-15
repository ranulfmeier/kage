import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { KageService } from "../services/KageService.js";

const STORE_PATTERNS = [
  /remember\s+(.+)/i,
  /store\s+(.+)/i,
  /save\s+(.+)/i,
  /note\s+(?:that\s+)?(.+)/i,
  /keep\s+(?:in mind\s+)?(.+)/i,
];

export const storeMemoryAction: Action = {
  name: "KAGE_STORE_MEMORY",
  description:
    "Encrypt and permanently store a memory in the Kage vault. " +
    "Anchors a commitment on Solana for tamper-proof verification. " +
    "Triggers when the user asks the agent to remember, save, or store something.",
  similes: [
    "STORE_MEMORY", "SAVE_MEMORY", "REMEMBER", "ENCRYPT_MEMORY",
    "KAGE_REMEMBER", "VAULT_STORE",
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const svc = runtime.getService<KageService>("kage");
    return svc !== null;
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

    // Extract what to store — look for explicit "remember X" pattern, else use full message
    let toStore = text;
    for (const pattern of STORE_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        toStore = match[1].trim();
        break;
      }
    }

    try {
      const result = await svc.chat(`Remember: ${toStore}`);

      const responseText = result.proof?.explorerUrl
        ? `Memory stored and anchored on Solana.\n\nProof: ${result.proof.explorerUrl}`
        : "Memory encrypted and stored in your Kage vault.";

      if (callback) {
        await callback({
          text: responseText,
          actions: ["KAGE_STORE_MEMORY"],
          source: message.content.source as string | undefined,
        });
      }

      return {
        success: true,
        text: responseText,
        values: {
          storedContent: toStore,
          txSignature: result.proof?.txSignature,
          explorerUrl: result.proof?.explorerUrl,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, text: `Failed to store memory: ${msg}`, error: msg };
    }
  },

  examples: [
    [
      { name: "user", content: { text: "Remember: my Solana wallet is 7xKpABCxyz" } },
      { name: "agent", content: { text: "Memory encrypted and stored in your Kage vault." } },
    ],
    [
      { name: "user", content: { text: "Store this: the API key for Binance is BNB_sk_xxx" } },
      { name: "agent", content: { text: "Memory stored and anchored on Solana." } },
    ],
  ],
};
