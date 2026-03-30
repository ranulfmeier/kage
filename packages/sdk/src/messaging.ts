import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";
// @ts-ignore
import { x25519 } from "@noble/curves/ed25519.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  /** Unique message ID */
  messageId: string;
  /** Sender's Solana public key */
  from: string;
  /** Recipient's Solana public key */
  to: string;
  /** Sender's X25519 public key (base64) — recipient uses this for DH */
  senderX25519Pub: string;
  /** AES-256-GCM ciphertext — only decryptable by recipient */
  encryptedContent: string;
  /** SHA-256 of plaintext content — anchored on-chain */
  contentHash: string;
  /** Solana Memo tx that proves this message existed */
  txSignature?: string;
  /** Solscan link */
  explorerUrl?: string;
  /** Unix timestamp */
  sentAt: number;
  /** Whether this message has been read */
  read: boolean;
}

export interface MessageContent {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface MessagingConfig {
  rpcUrl: string;
  relayUrl?: string;
}

export interface MessageTransport {
  send(msg: AgentMessage): void;
  onMessage(handler: (msg: AgentMessage) => void): void;
  close(): void;
}

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ─── MessagingEngine ──────────────────────────────────────────────────────────

export class MessagingEngine {
  private connection: Connection;
  private agentKeypair: Keypair;
  private inbox: AgentMessage[] = [];
  private outbox: AgentMessage[] = [];
  private transport: MessageTransport | null = null;
  private relayWs: WebSocket | null = null;

  /** This agent's X25519 public key (base64) — share with other agents */
  readonly x25519PublicKey: string;

  constructor(connection: Connection, agentKeypair: Keypair) {
    this.connection = connection;
    this.agentKeypair = agentKeypair;

    const seed = agentKeypair.secretKey.slice(0, 32);
    const pub: Uint8Array = x25519.getPublicKey(seed);
    this.x25519PublicKey = Buffer.from(pub).toString("base64");
  }

  /**
   * Connect to an API relay server via WebSocket for real message transport.
   * Messages sent via sendMessage() will be relayed; incoming messages
   * are automatically delivered to the inbox.
   */
  connectRelay(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.relayWs = ws;

      ws.onopen = () => {
        console.log(`[Kage:Messaging] Relay connected: ${url}`);
        resolve();
      };

      ws.onerror = (err) => {
        console.warn(`[Kage:Messaging] Relay error:`, err);
        reject(new Error("WebSocket relay connection failed"));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(typeof event.data === "string" ? event.data : "{}");
          if (data.type === "message_sent" && data.message) {
            this.deliverToInbox(data.message);
          }
          if (data.type === "message_received" && data.content) {
            console.log(`[Kage:Messaging] Relay delivered: ${data.messageId}`);
          }
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        console.log(`[Kage:Messaging] Relay disconnected`);
        this.relayWs = null;
      };
    });
  }

  /** Disconnect from the relay server */
  disconnectRelay(): void {
    this.relayWs?.close();
    this.relayWs = null;
  }

  /** Set a custom message transport (alternative to WebSocket relay) */
  setTransport(transport: MessageTransport): void {
    this.transport = transport;
    transport.onMessage((msg) => this.deliverToInbox(msg));
  }

  /**
   * Send an encrypted message to another agent.
   *
   * @param recipientSolanaPub  Recipient's Solana public key
   * @param recipientX25519Pub  Recipient's X25519 public key (base64)
   * @param content             Plaintext message content
   */
  async sendMessage(
    recipientSolanaPub: PublicKey,
    recipientX25519Pub: string,
    content: MessageContent
  ): Promise<AgentMessage> {
    const messageId = `msg-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const plaintext = JSON.stringify(content);

    const recipientX25519Bytes = Buffer.from(recipientX25519Pub, "base64");
    const sharedSecret = this.deriveSharedSecret(recipientX25519Bytes);
    const encryptedContent = this.encrypt(plaintext, sharedSecret);
    const contentHash = createHash("sha256").update(plaintext).digest("hex");

    // Anchor message hash on-chain via Memo
    let txSignature: string | undefined;
    let explorerUrl: string | undefined;
    try {
      const memo = `kage:msg:${messageId}:${contentHash.slice(0, 16)}`;
      txSignature = await this.writeMemoProgramTx(memo);
      explorerUrl = `https://solscan.io/tx/${txSignature}?cluster=devnet`;
      console.log(`[Kage:Messaging] Message anchored on-chain: ${txSignature}`);
    } catch (err) {
      console.warn(`[Kage:Messaging] On-chain anchor skipped: ${(err as Error).message.slice(0, 60)}`);
    }

    const msg: AgentMessage = {
      messageId,
      from: this.agentKeypair.publicKey.toBase58(),
      to: recipientSolanaPub.toBase58(),
      senderX25519Pub: this.x25519PublicKey,
      encryptedContent,
      contentHash,
      txSignature,
      explorerUrl,
      sentAt: Date.now(),
      read: false,
    };

    this.outbox.push(msg);

    if (this.relayWs && this.relayWs.readyState === WebSocket.OPEN) {
      this.relayWs.send(JSON.stringify({
        type: "send_message",
        recipientPubkey: recipientSolanaPub.toBase58(),
        recipientX25519Pub,
        text: content.text,
      }));
    } else if (this.transport) {
      this.transport.send(msg);
    }

    console.log(`[Kage:Messaging] Sent: ${messageId} → ${recipientSolanaPub.toBase58().slice(0, 8)}…`);
    return msg;
  }

  /**
   * Receive and decrypt a message sent to this agent.
   * Uses `msg.senderX25519Pub` for DH key derivation.
   */
  receiveMessage(msg: AgentMessage): MessageContent {
    const senderX25519Bytes = Buffer.from(msg.senderX25519Pub, "base64");
    const sharedSecret = this.deriveSharedSecret(senderX25519Bytes);
    const plaintext = this.decrypt(msg.encryptedContent, sharedSecret);

    // Store in inbox (avoid duplicates)
    const exists = this.inbox.some((m) => m.messageId === msg.messageId);
    if (!exists) {
      msg.read = true;
      this.inbox.push(msg);
    } else {
      const existing = this.inbox.find((m) => m.messageId === msg.messageId)!;
      existing.read = true;
    }

    console.log(`[Kage:Messaging] Received: ${msg.messageId} from ${msg.from.slice(0, 8)}…`);
    return JSON.parse(plaintext) as MessageContent;
  }

  /** Deliver a message object to this engine's inbox (simulates network transport) */
  deliverToInbox(msg: AgentMessage): void {
    const exists = this.inbox.some((m) => m.messageId === msg.messageId);
    if (!exists) this.inbox.push({ ...msg, read: false });
  }

  /** Get unread inbox messages */
  getUnreadMessages(): AgentMessage[] {
    return this.inbox.filter((m) => !m.read);
  }

  /** Get all inbox messages */
  getInbox(): AgentMessage[] {
    return [...this.inbox];
  }

  /** Get all sent messages */
  getOutbox(): AgentMessage[] {
    return [...this.outbox];
  }

  /** Mark a message as read and return its decrypted content */
  readMessage(messageId: string): MessageContent | null {
    const msg = this.inbox.find((m) => m.messageId === messageId);
    if (!msg) return null;
    return this.receiveMessage(msg);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private deriveSharedSecret(otherX25519Pub: Uint8Array): Buffer {
    const mySeed = this.agentKeypair.secretKey.slice(0, 32);
    const dhOutput: Uint8Array = x25519.getSharedSecret(mySeed, otherX25519Pub);
    return createHash("sha256").update(dhOutput).digest();
  }

  private encrypt(plaintext: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString("base64"),
      data: encrypted.toString("base64"),
      tag: tag.toString("base64"),
    });
  }

  private decrypt(ciphertext: string, key: Buffer): string {
    const { iv, data, tag } = JSON.parse(ciphertext);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  private async writeMemoProgramTx(memo: string): Promise<string> {
    const ix = new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: this.agentKeypair.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(memo, "utf8"),
    });
    const tx = new Transaction().add(ix);
    tx.feePayer = this.agentKeypair.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.sign(this.agentKeypair);
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMessagingEngine(
  connection: Connection,
  agentKeypair: Keypair
): MessagingEngine {
  return new MessagingEngine(connection, agentKeypair);
}
