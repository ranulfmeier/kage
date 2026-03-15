import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { KageService } from "../services/KageService.js";

export const sendPaymentAction: Action = {
  name: "KAGE_SEND_PAYMENT",
  description:
    "Send a shielded SOL payment using Umbra-style stealth addresses. " +
    "The recipient's identity is protected via X25519 key agreement. " +
    "Triggers when the user asks to send a private or shielded payment.",
  similes: [
    "SEND_PAYMENT", "SHIELDED_PAYMENT", "PRIVATE_PAYMENT", "KAGE_PAY",
    "STEALTH_TRANSFER", "SEND_SOL_PRIVATE",
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
      recipientSolana?: string;
      recipientViewing?: string;
      amountSol?: number;
      memo?: string;
    } | undefined;

    const { recipientSolana, recipientViewing, amountSol, memo } = opts ?? {};

    if (!recipientSolana || !recipientViewing || !amountSol) {
      return {
        success: false,
        text: "Required: recipientSolana, recipientViewing (X25519 key), amountSol",
        error: "Missing payment parameters",
      };
    }

    try {
      const result = await svc.sendPayment(
        recipientSolana,
        recipientViewing,
        amountSol,
        memo
      ) as { payment?: { stealthAddress?: string; explorerUrl?: string; paymentId?: string } };

      const payment = result.payment ?? {};
      const responseText = payment.explorerUrl
        ? `Shielded payment of ${amountSol} SOL sent.\nStealth address: ${payment.stealthAddress?.slice(0, 12)}…\nProof: ${payment.explorerUrl}`
        : `Shielded payment of ${amountSol} SOL sent to stealth address.`;

      if (callback) {
        await callback({
          text: responseText,
          actions: ["KAGE_SEND_PAYMENT"],
          source: message.content.source as string | undefined,
        });
      }

      return {
        success: true,
        text: responseText,
        values: {
          paymentId: payment.paymentId,
          amountSol,
          stealthAddress: payment.stealthAddress,
          explorerUrl: payment.explorerUrl,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, text: `Failed to send payment: ${msg}`, error: msg };
    }
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "Send 0.05 SOL to agent XYZ privately" },
      },
      {
        name: "agent",
        content: { text: "Shielded payment of 0.05 SOL sent to stealth address." },
      },
    ],
  ],
};
