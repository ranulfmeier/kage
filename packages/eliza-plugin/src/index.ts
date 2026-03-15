import type { Plugin } from "@elizaos/core";

import { KageService } from "./services/KageService.js";
import { storeMemoryAction } from "./actions/storeMemory.js";
import { recallMemoryAction } from "./actions/recallMemory.js";
import { delegateTaskAction } from "./actions/delegateTask.js";
import { sendPaymentAction } from "./actions/sendPayment.js";
import { storeTeamSecretAction } from "./actions/storeTeamSecret.js";
import { memoryProvider } from "./providers/memoryProvider.js";
import { identityProvider } from "./providers/identityProvider.js";

export { KageService };
export { storeMemoryAction, recallMemoryAction, delegateTaskAction, sendPaymentAction, storeTeamSecretAction };
export { memoryProvider, identityProvider };

/**
 * kagePlugin — the complete Kage privacy plugin for ElizaOS.
 *
 * Adds to any ElizaOS agent:
 *   - Encrypted memory vault (AES-256-GCM, Solana-anchored)
 *   - Shielded task delegation (X25519 encrypted payloads)
 *   - Shielded SOL payments (Umbra stealth addresses)
 *   - Team vaults (Shamir's Secret Sharing, role-based access)
 *   - DID + reputation context in every conversation
 *
 * Configuration (character settings / environment):
 *   KAGE_API_URL — Kage API server URL (default: http://localhost:3002)
 *
 * Usage:
 *   import { kagePlugin } from "@kage/plugin-eliza";
 *
 *   const character = {
 *     name: "MyAgent",
 *     plugins: [kagePlugin],
 *     settings: { secrets: { KAGE_API_URL: "https://kageapi.up.railway.app" } },
 *   };
 */
export const kagePlugin: Plugin = {
  name: "@kage/plugin-eliza",
  description:
    "Kage privacy vault — encrypted memories, DID, on-chain reputation, " +
    "team vaults, and shielded payments on Solana",

  services: [KageService],

  actions: [
    storeMemoryAction,
    recallMemoryAction,
    delegateTaskAction,
    sendPaymentAction,
    storeTeamSecretAction,
  ],

  providers: [
    memoryProvider,
    identityProvider,
  ],

  init: async (_config: Record<string, string>, runtime) => {
    const url = String(runtime.getSetting("KAGE_API_URL") ?? "http://localhost:3002");
    console.log(`[kagePlugin] Initialized — API: ${url}`);
  },
};

export default kagePlugin;
