import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  MessagingEngine,
  AgentMessage,
  MessageContent,
  createMessagingEngine,
} from "@kage/sdk";

export interface KageMessagingPluginConfig {
  rpcUrl: string;
}

export class KageMessagingPlugin {
  private engine: MessagingEngine | null = null;
  private config: KageMessagingPluginConfig;
  private initialized = false;

  readonly name = "kage-messaging";
  readonly description = "Encrypted agent-to-agent messaging";
  readonly version = "0.1.0";

  constructor(config: KageMessagingPluginConfig) {
    this.config = config;
  }

  async initialize(keypair: Keypair): Promise<void> {
    const connection = new Connection(this.config.rpcUrl, "confirmed");
    this.engine = createMessagingEngine(connection, keypair);
    this.initialized = true;
    console.log(`[KageMessaging] Plugin initialized. X25519 pub: ${this.engine.x25519PublicKey.slice(0, 16)}…`);
  }

  /** X25519 public key to share with counterparties */
  getX25519PublicKey(): string {
    return this.engine?.x25519PublicKey ?? "";
  }

  async sendMessage(params: {
    recipientPubkey: string;
    recipientX25519Pub: string;
    text: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    message?: AgentMessage;
    explorerUrl?: string;
    error?: string;
  }> {
    if (!this.initialized || !this.engine) {
      return { success: false, error: "Plugin not initialized" };
    }
    try {
      const recipientSolanaPub = new PublicKey(params.recipientPubkey);
      const msg = await this.engine.sendMessage(
        recipientSolanaPub,
        params.recipientX25519Pub,
        { text: params.text, metadata: params.metadata }
      );
      return { success: true, message: msg, explorerUrl: msg.explorerUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  receiveMessage(msg: AgentMessage): {
    success: boolean;
    content?: MessageContent;
    error?: string;
  } {
    if (!this.initialized || !this.engine) {
      return { success: false, error: "Plugin not initialized" };
    }
    try {
      const content = this.engine.receiveMessage(msg);
      return { success: true, content };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  deliverToInbox(msg: AgentMessage): void {
    this.engine?.deliverToInbox(msg);
  }

  getInbox(): AgentMessage[] {
    return this.engine?.getInbox() ?? [];
  }

  getUnreadMessages(): AgentMessage[] {
    return this.engine?.getUnreadMessages() ?? [];
  }

  getOutbox(): AgentMessage[] {
    return this.engine?.getOutbox() ?? [];
  }

  readMessage(messageId: string): MessageContent | null {
    return this.engine?.readMessage(messageId) ?? null;
  }
}

export function createKageMessagingPlugin(
  config: KageMessagingPluginConfig
): KageMessagingPlugin {
  return new KageMessagingPlugin(config);
}
