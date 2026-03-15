import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type ZKProofType = "reputation" | "memory" | "task";
export type ZKCommitmentStatus = "pending" | "proved" | "verified" | "failed";

export interface ZKCommitment {
  id: string;
  proofType: ZKProofType;
  agentDID: string;
  /** SHA-256 of the private inputs */
  inputHash: string;
  /** SHA-256 of the public outputs */
  outputHash: string;
  /** Serialized public outputs (JSON) */
  publicOutputs: Record<string, unknown>;
  status: ZKCommitmentStatus;
  /** Solana tx signature for on-chain anchor */
  txSignature?: string;
  /** SP1 verification key (hex) — filled when proof is generated */
  vkey?: string;
  createdAt: number;
  provedAt?: number;
}

export interface ReputationCommitmentInput {
  agentDID: string;
  events: Array<{
    eventType: string;
    delta: number;
    timestamp: number;
  }>;
  claimedScore: number;
}

export interface MemoryCommitmentInput {
  agentDID: string;
  ciphertextHash: string;
  storedAt: number;
  memoryType: "episodic" | "semantic" | "procedural";
}

export interface TaskCommitmentInput {
  taskId: string;
  instructionHash: string;
  resultHash: string;
  outcome: "success" | "partial" | "failure";
  executorDID: string;
  completedAt: number;
}

// ─── ZK Engine ────────────────────────────────────────────────────────────────

export class ZKCommitmentEngine {
  private connection: Connection;
  private keypair: Keypair;
  private commitments: Map<string, ZKCommitment> = new Map();

  constructor(connection: Connection, keypair: Keypair) {
    this.connection = connection;
    this.keypair = keypair;
  }

  // ── Hash helpers ──────────────────────────────────────────────────────────

  private sha256(data: string): string {
    return createHash("sha256").update(data, "utf-8").digest("hex");
  }

  private generateId(): string {
    return randomBytes(16).toString("hex");
  }

  /**
   * FNV-1a hash matching the Rust zkVM circuit implementation.
   * Used for reputation event commitment consistency.
   */
  private fnv1a(events: ReputationCommitmentInput["events"]): string {
    let hash = BigInt("14695981039346656037");
    const prime = BigInt("1099511628211");

    for (const ev of events) {
      for (const b of Buffer.from(ev.eventType, "utf-8")) {
        hash ^= BigInt(b);
        hash = (hash * prime) & BigInt("0xFFFFFFFFFFFFFFFF");
      }
      const deltaBuf = Buffer.alloc(8);
      deltaBuf.writeBigInt64LE(BigInt(ev.delta));
      for (const b of deltaBuf) {
        hash ^= BigInt(b);
        hash = (hash * prime) & BigInt("0xFFFFFFFFFFFFFFFF");
      }
      const tsBuf = Buffer.alloc(8);
      tsBuf.writeBigUInt64LE(BigInt(ev.timestamp));
      for (const b of tsBuf) {
        hash ^= BigInt(b);
        hash = (hash * prime) & BigInt("0xFFFFFFFFFFFFFFFF");
      }
    }

    return "0x" + hash.toString(16).padStart(16, "0");
  }

  // ── Commitment creators ───────────────────────────────────────────────────

  async commitReputation(
    input: ReputationCommitmentInput
  ): Promise<ZKCommitment> {
    const eventsHash = this.fnv1a(input.events);

    const publicOutputs = {
      agent_did: input.agentDID,
      final_score: input.claimedScore,
      event_count: input.events.length,
      events_hash: eventsHash,
    };

    return this.createCommitment("reputation", input.agentDID, input, publicOutputs);
  }

  async commitMemory(input: MemoryCommitmentInput): Promise<ZKCommitment> {
    const publicOutputs = {
      agent_did: input.agentDID,
      ciphertext_hash: input.ciphertextHash,
      stored_at: input.storedAt,
      commitment_valid: true,
    };

    return this.createCommitment("memory", input.agentDID, input, publicOutputs);
  }

  async commitTask(input: TaskCommitmentInput): Promise<ZKCommitment> {
    const publicOutputs = {
      task_id: input.taskId,
      executor_did: input.executorDID,
      outcome: input.outcome,
      instruction_hash: input.instructionHash,
      result_hash: input.resultHash,
      outcome_valid: true,
    };

    return this.createCommitment("task", input.executorDID, input, publicOutputs);
  }

  // ── Verify (hash-based, pre-ZK) ──────────────────────────────────────────

  verifyCommitment(commitmentId: string): {
    valid: boolean;
    commitment?: ZKCommitment;
    reason?: string;
  } {
    const commitment = this.commitments.get(commitmentId);
    if (!commitment) {
      return { valid: false, reason: "Commitment not found" };
    }

    const recomputedOutputHash = this.sha256(
      JSON.stringify(commitment.publicOutputs)
    );

    if (recomputedOutputHash !== commitment.outputHash) {
      return {
        valid: false,
        commitment,
        reason: "Output hash mismatch — data may have been tampered",
      };
    }

    return { valid: true, commitment };
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  getCommitment(id: string): ZKCommitment | undefined {
    return this.commitments.get(id);
  }

  listCommitments(filters?: {
    agentDID?: string;
    proofType?: ZKProofType;
    status?: ZKCommitmentStatus;
  }): ZKCommitment[] {
    let results = Array.from(this.commitments.values());

    if (filters?.agentDID) {
      results = results.filter((c) => c.agentDID === filters.agentDID);
    }
    if (filters?.proofType) {
      results = results.filter((c) => c.proofType === filters.proofType);
    }
    if (filters?.status) {
      results = results.filter((c) => c.status === filters.status);
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Mark a commitment as "proved" — called by the Rust worker
   * after generating a real SP1 proof.
   */
  markProved(commitmentId: string, vkey: string): boolean {
    const commitment = this.commitments.get(commitmentId);
    if (!commitment) return false;

    commitment.status = "proved";
    commitment.vkey = vkey;
    commitment.provedAt = Date.now();
    return true;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async createCommitment(
    proofType: ZKProofType,
    agentDID: string,
    privateInputs: unknown,
    publicOutputs: Record<string, unknown>
  ): Promise<ZKCommitment> {
    const id = this.generateId();
    const inputHash = this.sha256(JSON.stringify(privateInputs));
    const outputHash = this.sha256(JSON.stringify(publicOutputs));

    const commitment: ZKCommitment = {
      id,
      proofType,
      agentDID,
      inputHash,
      outputHash,
      publicOutputs,
      status: "pending",
      createdAt: Date.now(),
    };

    // Anchor on Solana
    try {
      const memo = JSON.stringify({
        kage: "zk_commitment",
        id,
        type: proofType,
        agent: agentDID,
        outputHash,
        ts: commitment.createdAt,
      });
      commitment.txSignature = await this.writeMemoProgramTx(memo);
      commitment.status = "verified";
    } catch (err) {
      console.warn(`[ZK] Solana anchor failed for ${id}:`, err);
    }

    this.commitments.set(id, commitment);
    return commitment;
  }

  private async writeMemoProgramTx(memo: string): Promise<string> {
    const tx = new Transaction().add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo, "utf-8"),
      })
    );
    tx.feePayer = this.keypair.publicKey;
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.sign(this.keypair);
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}
