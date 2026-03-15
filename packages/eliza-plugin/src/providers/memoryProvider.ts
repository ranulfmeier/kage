import { Provider, IAgentRuntime, Memory, State, ProviderResult } from "@elizaos/core";
import { KageService } from "../services/KageService.js";

/**
 * memoryProvider — injects the agent's encrypted memory count and recent
 * memory summary into the ElizaOS context state so the LLM knows it has
 * a Kage vault available.
 */
export const memoryProvider: Provider = {
  name: "KAGE_MEMORY",
  description:
    "Provides Kage vault memory context — how many encrypted memories exist " +
    "and the vault's Solana public key.",

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined
  ): Promise<ProviderResult> => {
    const svc = runtime.getService<KageService>("kage");
    if (!svc) {
      return {
        text: "Kage vault: not connected",
        values: { kageConnected: false },
        data: {},
      };
    }

    try {
      const [memories, info] = await Promise.all([
        svc.listMemories(),
        svc.agentInfo(),
      ]);

      const count = memories.length;
      const pubkey = info.publicKey?.slice(0, 8) ?? "unknown";

      const text =
        `Kage vault (${pubkey}…): ${count} encrypted ${count === 1 ? "memory" : "memories"} stored on ${info.network ?? "devnet"}. ` +
        `Use KAGE_STORE_MEMORY to save information and KAGE_RECALL_MEMORY to retrieve it.`;

      return {
        text,
        values: {
          kageConnected: true,
          memoryCount: count,
          agentPublicKey: info.publicKey,
          network: info.network,
        },
        data: { memories },
      };
    } catch {
      return {
        text: "Kage vault: connection error — memories unavailable",
        values: { kageConnected: false },
        data: {},
      };
    }
  },
};
