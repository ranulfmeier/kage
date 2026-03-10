import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";
// @ts-ignore — noble/curves exports use .js extension
import { x25519 } from "@noble/curves/ed25519.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "accepted" | "completed" | "failed";

/**
 * A shielded delegation task between two agents.
 *
 * Key exchange uses X25519 Diffie-Hellman:
 *   - `senderX25519Pub` is the sender's X25519 public key (derived from Ed25519 seed)
 *   - `recipientX25519Pub` is the recipient's X25519 public key (must be known at creation time)
 *
 * Shared secret: DH(senderSeed, recipientX25519Pub) == DH(recipientSeed, senderX25519Pub)
 * This is the standard X25519 DH property — both parties derive the same key.
 */
export interface DelegationTask {
  taskId: string;
  /** Solana (Ed25519) public key of the sender */
  from: string;
  /** Solana (Ed25519) public key of the recipient */
  to: string;
  /** X25519 public key of sender (base64) — for recipient DH */
  senderX25519Pub: string;
  /** X25519 public key of recipient (base64) — for sender DH */
  recipientX25519Pub: string;
  /** AES-256-GCM encrypted payload — only decryptable by recipient */
  encryptedPayload: string;
  /** SHA-256 of the plaintext payload — committed on-chain */
  payloadHash: string;
  /** Solana Memo transaction that anchors this task on-chain */
  txSignature?: string;
  /** Solscan link for verification */
  explorerUrl?: string;
  status: TaskStatus;
  createdAt: number;
  /** AES-256-GCM encrypted result — only decryptable by sender */
  encryptedResult?: string;
}

export interface TaskPayload {
  instruction: string;
  context?: Record<string, unknown>;
  deadline?: number;
}

export interface TaskResult {
  success: boolean;
  output: unknown;
  completedAt: number;
}

export interface DelegationConfig {
  rpcUrl: string;
  programId: PublicKey;
}

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ─── DelegationEngine ─────────────────────────────────────────────────────────

export class DelegationEngine {
  private connection: Connection;
  private config: DelegationConfig;
  private agentKeypair: Keypair;
  private tasks: Map<string, DelegationTask> = new Map();

  /** This agent's X25519 public key (base64) — share this with counterparties */
  readonly x25519PublicKey: string;

  constructor(connection: Connection, config: DelegationConfig, agentKeypair: Keypair) {
    this.connection = connection;
    this.config = config;
    this.agentKeypair = agentKeypair;

    // Derive X25519 public key from Ed25519 seed (first 32 bytes of Solana secretKey)
    const seed = agentKeypair.secretKey.slice(0, 32);
    const x25519Pub: Uint8Array = x25519.getPublicKey(seed);
    this.x25519PublicKey = Buffer.from(x25519Pub).toString("base64");
  }

  /**
   * Create and delegate a shielded task to another agent.
   *
   * @param recipientSolanaPub   Recipient's Solana public key (for on-chain identity)
   * @param recipientX25519Pub   Recipient's X25519 public key (for DH key exchange)
   * @param payload              Plaintext task payload to encrypt
   */
  async createTask(
    recipientSolanaPub: PublicKey,
    recipientX25519Pub: Uint8Array,
    payload: TaskPayload
  ): Promise<DelegationTask> {
    const taskId = `task-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const payloadJson = JSON.stringify(payload);

    // X25519 DH: sender's seed + recipient's X25519 pubkey → shared secret
    const sharedSecret = this.deriveSharedSecret(recipientX25519Pub);
    const encryptedPayload = this.encrypt(payloadJson, sharedSecret);
    const payloadHash = createHash("sha256").update(payloadJson).digest("hex");

    // Commit task hash on-chain via Memo program
    let txSignature: string | undefined;
    let explorerUrl: string | undefined;
    try {
      const memo = `kage:task:${taskId}:${payloadHash.slice(0, 16)}`;
      txSignature = await this.writeTaskMemo(memo);
      explorerUrl = `https://solscan.io/tx/${txSignature}?cluster=devnet`;
      console.log(`[Kage:Delegation] Task committed on-chain: ${txSignature}`);
    } catch (err) {
      console.warn(`[Kage:Delegation] On-chain commit skipped (${(err as Error).message.slice(0, 60)})`);
    }

    const task: DelegationTask = {
      taskId,
      from: this.agentKeypair.publicKey.toBase58(),
      to: recipientSolanaPub.toBase58(),
      senderX25519Pub: this.x25519PublicKey,
      recipientX25519Pub: Buffer.from(recipientX25519Pub).toString("base64"),
      encryptedPayload,
      payloadHash,
      txSignature,
      explorerUrl,
      status: "pending",
      createdAt: Date.now(),
    };

    this.tasks.set(taskId, task);
    console.log(`[Kage:Delegation] Task created: ${taskId} → ${recipientSolanaPub.toBase58().slice(0, 8)}…`);
    return task;
  }

  /**
   * Accept a task as the recipient — decrypts payload using X25519 DH.
   * Uses `task.senderX25519Pub` to compute the same shared secret.
   */
  acceptTask(task: DelegationTask): TaskPayload {
    const senderX25519Pub = Buffer.from(task.senderX25519Pub, "base64");
    const sharedSecret = this.deriveSharedSecret(senderX25519Pub);
    const payloadJson = this.decrypt(task.encryptedPayload, sharedSecret);

    task.status = "accepted";
    this.tasks.set(task.taskId, task);
    console.log(`[Kage:Delegation] Task accepted: ${task.taskId}`);

    return JSON.parse(payloadJson) as TaskPayload;
  }

  /**
   * Complete a task and encrypt the result back to the sender.
   * Uses `task.senderX25519Pub` so only sender can decrypt.
   */
  async completeTask(taskId: string, output: unknown): Promise<DelegationTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const senderX25519Pub = Buffer.from(task.senderX25519Pub, "base64");
    const sharedSecret = this.deriveSharedSecret(senderX25519Pub);

    const result: TaskResult = { success: true, output, completedAt: Date.now() };
    const encryptedResult = this.encrypt(JSON.stringify(result), sharedSecret);

    task.status = "completed";
    task.encryptedResult = encryptedResult;
    this.tasks.set(taskId, task);

    console.log(`[Kage:Delegation] Task completed: ${taskId}`);
    return task;
  }

  /**
   * Read the encrypted result as the original sender.
   * Uses `task.recipientX25519Pub` to recompute the same shared secret.
   */
  readResult(task: DelegationTask): TaskResult {
    if (!task.encryptedResult) throw new Error("Task has no result yet");
    const recipientX25519Pub = Buffer.from(task.recipientX25519Pub, "base64");
    const sharedSecret = this.deriveSharedSecret(recipientX25519Pub);
    return JSON.parse(this.decrypt(task.encryptedResult, sharedSecret)) as TaskResult;
  }

  listTasks(): DelegationTask[] {
    return Array.from(this.tasks.values());
  }

  getTask(taskId: string): DelegationTask | undefined {
    return this.tasks.get(taskId);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * X25519 DH: my Ed25519 seed (= X25519 private key) × their X25519 public key.
   * DH(seedA, pubB) === DH(seedB, pubA) — symmetric by construction.
   */
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

  private async writeTaskMemo(memo: string): Promise<string> {
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

export function createDelegationEngine(
  connection: Connection,
  config: DelegationConfig,
  agentKeypair: Keypair
): DelegationEngine {
  return new DelegationEngine(connection, config, agentKeypair);
}
