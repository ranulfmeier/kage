import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { KageService } from "../services/KageService.js";

export const storeTeamSecretAction: Action = {
  name: "KAGE_STORE_TEAM_SECRET",
  description:
    "Store an encrypted secret in a Kage Team Vault with role-based access control. " +
    "Uses Shamir's Secret Sharing for m-of-n threshold key reconstruction. " +
    "Triggers when the user asks to store a team secret, API key, or shared credential.",
  similes: [
    "STORE_TEAM_SECRET", "TEAM_VAULT_STORE", "KAGE_TEAM_SECRET",
    "SHARED_SECRET", "VAULT_SECRET", "TEAM_CREDENTIAL",
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return runtime.getService<KageService>("kage") !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: unknown,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const svc = runtime.getService<KageService>("kage");
    if (!svc) {
      return { success: false, text: "Kage service not available", error: "No KageService" };
    }

    const opts = options as {
      teamId?: string;
      label?: string;
      data?: unknown;
      description?: string;
    } | undefined;

    const { teamId, label, data, description } = opts ?? {};

    if (!teamId || !label || data === undefined) {
      return {
        success: false,
        text: "Required: teamId, label, data",
        error: "Missing team secret parameters",
      };
    }

    try {
      const secret = await svc.storeTeamSecret(teamId, label, data, description);

      const responseText = secret.explorerUrl
        ? `Team secret "${label}" encrypted and stored.\nSecret ID: ${secret.id}\nProof: ${secret.explorerUrl}`
        : `Team secret "${label}" encrypted and stored in vault.`;

      if (callback) {
        await callback({
          text: responseText,
          actions: ["KAGE_STORE_TEAM_SECRET"],
          source: message.content.source as string | undefined,
        });
      }

      return {
        success: true,
        text: responseText,
        values: {
          secretId: secret.id,
          label: secret.label,
          teamId,
          explorerUrl: secret.explorerUrl,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, text: `Failed to store team secret: ${msg}`, error: msg };
    }
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "Store the Binance API key in the trading team vault" },
      },
      {
        name: "agent",
        content: { text: 'Team secret "Binance API Key" encrypted and stored in vault.' },
      },
    ],
  ],
};
