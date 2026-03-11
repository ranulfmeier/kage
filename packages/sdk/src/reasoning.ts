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

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReasoningTrace {
  traceId: string;
  sessionId: string;
  /** AES-256-GCM encrypted reasoning text */
  encryptedTrace: string;
  /** Byte count of plaintext — reveals effort without revealing content */
  charCount: number;
  /** SHA-256 of plaintext — verifiable without decrypting */
  contentHash: string;
  /** Session key wrapped with agent's X25519 public key — only agent can unwrap */
  wrappedSessionKey: string;
  /** On-chain commitment */
  txSignature?: string;
  explorerUrl?: string;
  createdAt: number;
}

export interface ReasoningSession {
  sessionId: string;
  /** Ephemeral AES-256 key for this conversation */
  sessionKey: Buffer;
  traces: ReasoningTrace[];
  startedAt: number;
}

export interface RevealResult {
  traceId: string;
  reasoning: string;
  charCount: number;
  contentHash: string;
  verified: boolean;
}

// ─── ReasoningEngine ──────────────────────────────────────────────────────────

/**
 * Hidden Reasoning Traces engine.
 *
 * Protocol:
 *  1. Each conversation gets a fresh ephemeral sessionKey (AES-256).
 *  2. Agent's reasoning (Claude Extended Thinking output) is encrypted
 *     with this sessionKey using AES-256-GCM.
 *  3. The sessionKey itself is wrapped (ECDH encrypted) with the agent's
 *     X25519 viewing key — so only the agent (or audit key holder) can reveal.
 *  4. SHA-256(plaintext) is committed on-chain via Solana Memo.
 *  5. Users see: char count + hash + Solscan link, never the reasoning itself.
 *  6. Audit: agent provides wrappedSessionKey → decrypt → read reasoning.
 */
export class ReasoningEngine {
  private connection: Connection;
  private agentKeypair: Keypair;
  private sessions = new Map<string, ReasoningSession>();
  private allTraces = new Map<string, ReasoningTrace>();

  /** Agent's X25519 viewing public key (base64) */
  readonly viewingPublicKey: string;

  constructor(connection: Connection, agentKeypair: Keypair) {
    this.connection = connection;
    this.agentKeypair = agentKeypair;

    const seed = agentKeypair.secretKey.slice(0, 32);
    const pub: Uint8Array = x25519.getPublicKey(seed);
    this.viewingPublicKey = Buffer.from(pub).toString("base64");
  }

  // ─── Session Management ───────────────────────────────────────────────────

  /** Start a new reasoning session (one per conversation). */
  startSession(): string {
    const sessionId = `sess-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const sessionKey = randomBytes(32);
    this.sessions.set(sessionId, {
      sessionId,
      sessionKey,
      traces: [],
      startedAt: Date.now(),
    });
    return sessionId;
  }

  /** End a session and clear the in-memory session key. */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Zero out the key before deleting
      session.sessionKey.fill(0);
      this.sessions.delete(sessionId);
    }
  }

  // ─── Core: Encrypt & Commit ───────────────────────────────────────────────

  /**
   * Encrypt a reasoning trace and commit its hash on-chain.
   *
   * @param sessionId  Active session (provides the AES key)
   * @param reasoning  Raw reasoning text from Claude Extended Thinking
   * @returns          ReasoningTrace (encrypted, hashed, committed)
   */
  async commitTrace(sessionId: string, reasoning: string): Promise<ReasoningTrace> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const traceId = `trace-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const plainBytes = Buffer.from(reasoning, "utf8");
    const contentHash = createHash("sha256").update(plainBytes).digest("hex");

    // Encrypt reasoning with session key (AES-256-GCM + AAD = traceId)
    const encryptedTrace = this.encryptBytes(plainBytes, session.sessionKey, traceId);

    // Wrap the session key with agent's X25519 so only agent can reveal
    const wrappedSessionKey = this.wrapSessionKey(session.sessionKey);

    // Commit hash on-chain
    let txSignature: string | undefined;
    let explorerUrl: string | undefined;
    try {
      const memo = `kage:reasoning:${traceId}:${contentHash.slice(0, 16)}`;
      txSignature = await this.writeMemoProgramTx(memo);
      explorerUrl = `https://solscan.io/tx/${txSignature}?cluster=devnet`;
      console.log(`[Kage:Reasoning] Trace committed on-chain: ${txSignature}`);
    } catch (err) {
      console.warn(`[Kage:Reasoning] On-chain commit skipped: ${(err as Error).message.slice(0, 60)}`);
    }

    const trace: ReasoningTrace = {
      traceId,
      sessionId,
      encryptedTrace,
      charCount: reasoning.length,
      contentHash,
      wrappedSessionKey,
      txSignature,
      explorerUrl,
      createdAt: Date.now(),
    };

    session.traces.push(trace);
    this.allTraces.set(traceId, trace);
    return trace;
  }

  // ─── Audit: Reveal ────────────────────────────────────────────────────────

  /**
   * Reveal a reasoning trace using the agent's viewing private key.
   * Only the agent (or someone with the audit key) can call this.
   */
  reveal(traceId: string): RevealResult {
    const trace = this.allTraces.get(traceId);
    if (!trace) throw new Error(`Trace not found: ${traceId}`);

    // Unwrap session key using agent's X25519 private key
    const sessionKey = this.unwrapSessionKey(trace.wrappedSessionKey);

    // Decrypt reasoning
    const plainBytes = this.decryptBytes(trace.encryptedTrace, sessionKey, traceId);
    const reasoning = plainBytes.toString("utf8");

    // Verify hash
    const computedHash = createHash("sha256").update(plainBytes).digest("hex");
    const verified = computedHash === trace.contentHash;

    return { traceId, reasoning, charCount: reasoning.length, contentHash: trace.contentHash, verified };
  }

  /**
   * Reveal using an exported audit key (base64 wrapped session key).
   * Allows third-party auditors without exposing the agent's private key.
   */
  revealWithAuditKey(traceId: string, auditKeyBase64: string): RevealResult {
    const trace = this.allTraces.get(traceId);
    if (!trace) throw new Error(`Trace not found: ${traceId}`);

    const sessionKey = Buffer.from(auditKeyBase64, "base64");
    if (sessionKey.length !== 32) throw new Error("Invalid audit key length");

    const plainBytes = this.decryptBytes(trace.encryptedTrace, sessionKey, traceId);
    const reasoning = plainBytes.toString("utf8");
    const computedHash = createHash("sha256").update(plainBytes).digest("hex");
    const verified = computedHash === trace.contentHash;

    return { traceId, reasoning, charCount: reasoning.length, contentHash: trace.contentHash, verified };
  }

  /**
   * Export the audit key for a session (raw session key, base64).
   * Share this with auditors who need to inspect the reasoning.
   */
  exportAuditKey(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found or already ended: ${sessionId}`);
    return session.sessionKey.toString("base64");
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  getTrace(traceId: string): ReasoningTrace | undefined {
    return this.allTraces.get(traceId);
  }

  getAllTraces(): ReasoningTrace[] {
    return Array.from(this.allTraces.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getSessionTraces(sessionId: string): ReasoningTrace[] {
    return this.sessions.get(sessionId)?.traces ?? [];
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Wrap (encrypt) the session key with the agent's X25519 public key.
   * Uses ephemeral ECDH so only the agent's private key can unwrap.
   */
  private wrapSessionKey(sessionKey: Buffer): string {
    const agentPub = Buffer.from(x25519.getPublicKey(this.agentKeypair.secretKey.slice(0, 32)));
    const ephemeralPriv = randomBytes(32);
    const ephemeralPub = Buffer.from(x25519.getPublicKey(ephemeralPriv));

    const dhOutput: Uint8Array = x25519.getSharedSecret(ephemeralPriv, agentPub);
    const wrapKey = createHash("sha256").update(dhOutput).digest();

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", wrapKey, iv);
    const enc = Buffer.concat([cipher.update(sessionKey), cipher.final()]);
    const tag = cipher.getAuthTag();

    return JSON.stringify({
      ephemeralPub: ephemeralPub.toString("base64"),
      iv: iv.toString("base64"),
      data: enc.toString("base64"),
      tag: tag.toString("base64"),
    });
  }

  private unwrapSessionKey(wrappedKey: string): Buffer {
    const { ephemeralPub, iv, data, tag } = JSON.parse(wrappedKey);
    const agentPrivSeed = this.agentKeypair.secretKey.slice(0, 32);

    const dhOutput: Uint8Array = x25519.getSharedSecret(agentPrivSeed, Buffer.from(ephemeralPub, "base64"));
    const wrapKey = createHash("sha256").update(dhOutput).digest();

    const decipher = createDecipheriv("aes-256-gcm", wrapKey, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  }

  private encryptBytes(data: Buffer, key: Buffer, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString("base64"),
      data: enc.toString("base64"),
      tag: tag.toString("base64"),
      aad,
    });
  }

  private decryptBytes(ciphertext: string, key: Buffer, expectedAad: string): Buffer {
    const { iv, data, tag, aad } = JSON.parse(ciphertext);
    if (aad !== expectedAad) throw new Error("AAD mismatch — trace context tampered");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
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

export function createReasoningEngine(
  connection: Connection,
  agentKeypair: Keypair
): ReasoningEngine {
  return new ReasoningEngine(connection, agentKeypair);
}
