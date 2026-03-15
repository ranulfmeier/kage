import { Provider, IAgentRuntime, Memory, State, ProviderResult } from "@elizaos/core";
import { KageService } from "../services/KageService.js";

interface DidResponse {
  did?: string;
  document?: { kage?: { agentType?: string; capabilities?: string[] } };
}

interface ReputationResponse {
  reputation?: {
    score?: number;
    tier?: string;
    totalTasks?: number;
    successfulTasks?: number;
  };
}

/**
 * identityProvider — injects the agent's DID and reputation score into
 * the ElizaOS context state, giving the LLM awareness of its on-chain identity.
 */
export const identityProvider: Provider = {
  name: "KAGE_IDENTITY",
  description:
    "Provides the agent's Decentralized Identity (DID) and reputation score " +
    "from the Kage protocol, anchored on Solana.",

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined
  ): Promise<ProviderResult> => {
    const svc = runtime.getService<KageService>("kage");
    if (!svc) {
      return {
        text: "Kage identity: not connected",
        values: { kageIdentityAvailable: false },
        data: {},
      };
    }

    try {
      const [didRes, repRes] = await Promise.all([
        svc.getDid() as Promise<DidResponse>,
        svc.getReputation() as Promise<ReputationResponse>,
      ]);

      const did = didRes?.did ?? "unknown";
      const rep = repRes?.reputation ?? {};
      const score = rep.score ?? 0;
      const tier = rep.tier ?? "newcomer";
      const caps = didRes?.document?.kage?.capabilities ?? [];

      const text =
        `Agent DID: ${did}. ` +
        `Reputation: ${score}/1000 (${tier.toUpperCase()}). ` +
        `Tasks completed: ${rep.totalTasks ?? 0} (${rep.successfulTasks ?? 0} successful). ` +
        (caps.length ? `Capabilities: ${caps.join(", ")}.` : "");

      return {
        text,
        values: {
          kageIdentityAvailable: true,
          did,
          reputationScore: score,
          reputationTier: tier,
          totalTasks: rep.totalTasks ?? 0,
          successfulTasks: rep.successfulTasks ?? 0,
          capabilities: caps,
        },
        data: { did: didRes, reputation: rep },
      };
    } catch {
      return {
        text: "Kage identity: unable to fetch DID or reputation",
        values: { kageIdentityAvailable: false },
        data: {},
      };
    }
  },
};
