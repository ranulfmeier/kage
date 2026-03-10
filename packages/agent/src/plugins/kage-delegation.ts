import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  DelegationEngine,
  DelegationTask,
  TaskPayload,
  TaskResult,
  createDelegationEngine,
} from "@kage/sdk";

export interface KageDelegationPluginConfig {
  rpcUrl: string;
  programId: string;
}

export interface DelegateTaskParams {
  recipientPubkey: string;
  /** Base64-encoded X25519 public key. If omitted, falls back to Ed25519 pub bytes (demo only). */
  recipientX25519Pub?: string;
  instruction: string;
  context?: Record<string, unknown>;
}

export class KageDelegationPlugin {
  private engine: DelegationEngine | null = null;
  private config: KageDelegationPluginConfig;
  private keypair: Keypair | null = null;
  private initialized = false;

  readonly name = "kage-delegation";
  readonly description = "Shielded task delegation between AI agents";
  readonly version = "0.1.0";

  constructor(config: KageDelegationPluginConfig) {
    this.config = config;
  }

  async initialize(keypair: Keypair): Promise<void> {
    this.keypair = keypair;
    const connection = new Connection(this.config.rpcUrl, "confirmed");

    this.engine = createDelegationEngine(
      connection,
      {
        rpcUrl: this.config.rpcUrl,
        programId: new PublicKey(this.config.programId),
      },
      keypair
    );

    this.initialized = true;
    console.log(`[KageDelegation] Plugin initialized for: ${keypair.publicKey.toBase58()}`);
  }

  /**
   * Delegate a task to another agent with shielded (encrypted) payload.
   * recipientX25519Pub: base64-encoded X25519 public key of the recipient.
   * If omitted, a fallback is derived from the Solana pubkey bytes (for demos).
   */
  async delegateTask(params: DelegateTaskParams): Promise<{
    success: boolean;
    task?: DelegationTask;
    txSignature?: string;
    explorerUrl?: string;
    error?: string;
  }> {
    if (!this.initialized || !this.engine) {
      return { success: false, error: "Plugin not initialized" };
    }

    try {
      const recipientSolanaPub = new PublicKey(params.recipientPubkey);

      // X25519 pubkey must be provided or derived (demo: use pubkey bytes directly)
      let recipientX25519Pub: Uint8Array;
      if (params.recipientX25519Pub) {
        recipientX25519Pub = Buffer.from(params.recipientX25519Pub, "base64");
      } else {
        // Demo fallback: treat Ed25519 pubkey bytes as X25519 (not secure — for testing)
        recipientX25519Pub = recipientSolanaPub.toBytes();
      }

      const payload: TaskPayload = {
        instruction: params.instruction,
        context: params.context,
        deadline: Date.now() + 60 * 60 * 1000,
      };

      const task = await this.engine.createTask(recipientSolanaPub, recipientX25519Pub, payload);

      console.log(`[KageDelegation] Task delegated: ${task.taskId}`);
      return { success: true, task, txSignature: task.txSignature, explorerUrl: task.explorerUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[KageDelegation] Delegate failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Accept and decrypt a task assigned to this agent.
   */
  acceptTask(task: DelegationTask): {
    success: boolean;
    payload?: TaskPayload;
    error?: string;
  } {
    if (!this.initialized || !this.engine) {
      return { success: false, error: "Plugin not initialized" };
    }
    try {
      const payload = this.engine.acceptTask(task);
      return { success: true, payload };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  /**
   * Complete a task and encrypt the result back to the sender.
   */
  async completeTask(taskId: string, output: unknown): Promise<{
    success: boolean;
    task?: DelegationTask;
    error?: string;
  }> {
    if (!this.initialized || !this.engine) {
      return { success: false, error: "Plugin not initialized" };
    }
    try {
      const updated = await this.engine.completeTask(taskId, output);
      return { success: true, task: updated };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  listTasks(): DelegationTask[] {
    return this.engine?.listTasks() ?? [];
  }

  getTask(taskId: string): DelegationTask | undefined {
    return this.engine?.getTask(taskId);
  }
}

export function createKageDelegationPlugin(
  config: KageDelegationPluginConfig
): KageDelegationPlugin {
  return new KageDelegationPlugin(config);
}
