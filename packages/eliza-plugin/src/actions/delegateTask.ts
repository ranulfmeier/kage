import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { KageService } from "../services/KageService.js";

export const delegateTaskAction: Action = {
  name: "KAGE_DELEGATE_TASK",
  description:
    "Delegate an encrypted task to another Kage agent on Solana. " +
    "The task payload is AES-256-GCM encrypted before transmission. " +
    "Triggers when the user asks to delegate, assign, or forward a task to another agent.",
  similes: [
    "DELEGATE_TASK", "ASSIGN_TASK", "FORWARD_TASK", "KAGE_DELEGATE",
    "SEND_TASK", "ENCRYPTED_DELEGATION",
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
      recipientPubkey?: string;
      instruction?: string;
      priority?: "low" | "normal" | "high";
    } | undefined;

    const recipientPubkey = opts?.recipientPubkey;
    const instruction = opts?.instruction ?? (message.content.text as string);
    const priority = opts?.priority ?? "normal";

    if (!recipientPubkey) {
      return {
        success: false,
        text: "Recipient public key required. Provide `recipientPubkey` in options.",
        error: "Missing recipientPubkey",
      };
    }

    try {
      const result = await svc.delegate(recipientPubkey, instruction, priority) as {
        taskId?: string;
        explorerUrl?: string;
      };

      const responseText = result.explorerUrl
        ? `Task delegated (${priority} priority).\nTask ID: ${result.taskId}\nProof: ${result.explorerUrl}`
        : `Task encrypted and delegated to ${recipientPubkey.slice(0, 8)}…`;

      if (callback) {
        await callback({
          text: responseText,
          actions: ["KAGE_DELEGATE_TASK"],
          source: message.content.source as string | undefined,
        });
      }

      return {
        success: true,
        text: responseText,
        values: {
          taskId: result.taskId,
          recipientPubkey,
          priority,
          explorerUrl: result.explorerUrl,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, text: `Failed to delegate task: ${msg}`, error: msg };
    }
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "Delegate a market analysis task to agent ABC123 with high priority" },
      },
      {
        name: "agent",
        content: { text: "Task encrypted and delegated to ABC123… (high priority)" },
      },
    ],
  ],
};
