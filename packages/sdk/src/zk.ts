import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import {
  ProverClient,
  type ProofRecord,
  type ProofStatus as ProverProofStatus,
} from "./prover-client.js";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

const KAGE_PROGRAM_ID = new PublicKey(
  "PRDZsFBacoRGLW5bBumh4Wi42hv8N72akYcWhDgvt9s"
);

const ZK_VERIFICATION_SEED = Buffer.from("zk_verify");

const PROOF_TYPE_MAP: Record<ZKProofType, number> = {
  reputation: 0,
  memory: 1,
  task: 2,
};

export interface OnChainVerificationResult {
  txSignature: string;
  verificationPda: string;
  proofType: ZKProofType;
  vkeyHash: string;
}

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
  /** Prover service proof request ID */
  proofRequestId?: string;
  /** Succinct Explorer URL (network mode only) */
  explorerUrl?: string;
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
  private proverClient: ProverClient | null = null;

  constructor(
    connection: Connection,
    keypair: Keypair,
    proverServiceUrl?: string,
    proverApiKey?: string
  ) {
    this.connection = connection;
    this.keypair = keypair;
    if (proverServiceUrl) {
      this.proverClient = new ProverClient(proverServiceUrl, proverApiKey);
    }
  }

  get proverAvailable(): boolean {
    return this.proverClient !== null;
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

  // ── Prover Service Integration ───────────────────────────────────────────

  /**
   * Submit a commitment to the prover service for real SP1 proof generation.
   * Requires proverServiceUrl to be configured.
   */
  async requestProof(
    commitmentId: string,
    onStatusUpdate?: (record: ProofRecord) => void
  ): Promise<ProofRecord> {
    if (!this.proverClient) {
      throw new Error("Prover service not configured — pass proverServiceUrl to constructor");
    }

    const commitment = this.commitments.get(commitmentId);
    if (!commitment) {
      throw new Error(`Commitment ${commitmentId} not found`);
    }

    let proofRecord: ProofRecord;

    switch (commitment.proofType) {
      case "reputation": {
        const outputs = commitment.publicOutputs;
        proofRecord = await this.proverClient.submitReputationProof({
          agent_did: commitment.agentDID,
          events: [],
          claimed_score: (outputs.final_score as number) ?? 0,
        });
        break;
      }
      case "memory": {
        const outputs = commitment.publicOutputs;
        proofRecord = await this.proverClient.submitMemoryProof({
          agent_did: commitment.agentDID,
          ciphertext_hash: (outputs.ciphertext_hash as string) ?? "",
          stored_at: (outputs.stored_at as number) ?? 0,
          memory_type: ((outputs.memory_type as string) ?? "episodic") as
            | "episodic"
            | "semantic"
            | "procedural",
        });
        break;
      }
      case "task": {
        const outputs = commitment.publicOutputs;
        proofRecord = await this.proverClient.submitTaskProof({
          task_id: (outputs.task_id as string) ?? "",
          instruction_hash: (outputs.instruction_hash as string) ?? "",
          result_hash: (outputs.result_hash as string) ?? "",
          outcome: ((outputs.outcome as string) ?? "success") as
            | "success"
            | "partial"
            | "failure",
          executor_did: commitment.agentDID,
        });
        break;
      }
      default:
        throw new Error(`Unknown proof type: ${commitment.proofType}`);
    }

    commitment.proofRequestId = proofRecord.proof_id;
    onStatusUpdate?.(proofRecord);

    return proofRecord;
  }

  /**
   * Check proof generation status from the prover service.
   */
  async checkProofStatus(commitmentId: string): Promise<ProofRecord> {
    if (!this.proverClient) {
      throw new Error("Prover service not configured");
    }

    const commitment = this.commitments.get(commitmentId);
    if (!commitment?.proofRequestId) {
      throw new Error(`No proof request found for commitment ${commitmentId}`);
    }

    const record = await this.proverClient.getProofStatus(
      commitment.proofRequestId
    );

    if (record.status === "completed" && record.vkey) {
      commitment.status = "proved";
      commitment.vkey = record.vkey;
      commitment.provedAt = Date.now();
      if (record.explorer_url) {
        commitment.explorerUrl = record.explorer_url;
      }
    } else if (record.status === "failed") {
      commitment.status = "failed";
    }

    return record;
  }

  /**
   * Submit proof and wait for completion with exponential backoff polling.
   */
  async requestProofAndWait(
    commitmentId: string,
    timeoutMs = 300_000,
    onStatusUpdate?: (record: ProofRecord) => void
  ): Promise<ProofRecord> {
    if (!this.proverClient) {
      throw new Error("Prover service not configured");
    }

    const submitRecord = await this.requestProof(commitmentId, onStatusUpdate);
    return this.proverClient.waitForProof(
      submitRecord.proof_id,
      timeoutMs,
      (record) => {
        onStatusUpdate?.(record);
        const commitment = this.commitments.get(commitmentId);
        if (!commitment) return;
        if (record.status === "completed" && record.vkey) {
          commitment.status = "proved";
          commitment.vkey = record.vkey;
          commitment.provedAt = Date.now();
          if (record.explorer_url) commitment.explorerUrl = record.explorer_url;
        } else if (record.status === "failed") {
          commitment.status = "failed";
        }
      }
    );
  }

  /**
   * Check if the prover service is reachable.
   */
  async isProverAvailable(): Promise<boolean> {
    if (!this.proverClient) return false;
    return this.proverClient.isAvailable();
  }

  // ── On-Chain ZK Verification ─────────────────────────────────────────────

  /**
   * Submit a Groth16 proof for on-chain verification via the Kage Solana program.
   * The proof must have been generated in "network" mode to include Groth16 data.
   *
   * Creates a PDA: ["zk_verify", authority, proof_type, vkey_hash]
   */
  async verifyOnChain(
    commitmentId: string
  ): Promise<OnChainVerificationResult> {
    const commitment = this.commitments.get(commitmentId);
    if (!commitment) {
      throw new Error(`Commitment ${commitmentId} not found`);
    }

    if (!commitment.proofRequestId || !this.proverClient) {
      throw new Error("No proof request found — generate a proof first");
    }

    const proofRecord = await this.proverClient.getProofStatus(
      commitment.proofRequestId
    );

    if (proofRecord.status !== "completed") {
      throw new Error(`Proof is not completed yet (status: ${proofRecord.status})`);
    }

    if (!proofRecord.groth16_proof || !proofRecord.sp1_public_inputs || !proofRecord.vkey) {
      throw new Error(
        "Groth16 proof data not available — proof must be generated in network mode"
      );
    }

    const proofType = PROOF_TYPE_MAP[commitment.proofType];
    const vkeyHash = Buffer.from(proofRecord.vkey.replace(/^0x/, ""), "hex");
    const proofBytes = Buffer.from(proofRecord.groth16_proof, "hex");
    const publicInputs = Buffer.from(proofRecord.sp1_public_inputs, "hex");

    if (vkeyHash.length !== 32) {
      throw new Error(`Invalid vkey hash length: ${vkeyHash.length}, expected 32`);
    }

    const [verificationPda] = PublicKey.findProgramAddressSync(
      [
        ZK_VERIFICATION_SEED,
        this.keypair.publicKey.toBuffer(),
        Buffer.from([proofType]),
        vkeyHash,
      ],
      KAGE_PROGRAM_ID
    );

    const discriminator = this.getInstructionDiscriminator("verify_sp1_proof");

    const data = this.encodeVerifyInstruction(
      discriminator,
      proofType,
      vkeyHash,
      proofBytes,
      publicInputs
    );

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: verificationPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: KAGE_PROGRAM_ID,
      data,
    });

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    tx.add(ix);
    tx.feePayer = this.keypair.publicKey;
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.sign(this.keypair);
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");

    commitment.status = "verified";

    return {
      txSignature: sig,
      verificationPda: verificationPda.toBase58(),
      proofType: commitment.proofType,
      vkeyHash: proofRecord.vkey,
    };
  }

  /**
   * Derive the verification PDA address for a given proof without submitting.
   */
  getVerificationPda(
    authority: PublicKey,
    proofType: ZKProofType,
    vkeyHash: string
  ): PublicKey {
    const vkeyBuf = Buffer.from(vkeyHash.replace(/^0x/, ""), "hex");
    const [pda] = PublicKey.findProgramAddressSync(
      [
        ZK_VERIFICATION_SEED,
        authority.toBuffer(),
        Buffer.from([PROOF_TYPE_MAP[proofType]]),
        vkeyBuf,
      ],
      KAGE_PROGRAM_ID
    );
    return pda;
  }

  private getInstructionDiscriminator(name: string): Buffer {
    const hash = createHash("sha256")
      .update(`global:${name}`)
      .digest();
    return hash.subarray(0, 8);
  }

  private encodeVerifyInstruction(
    discriminator: Buffer,
    proofType: number,
    vkeyHash: Buffer,
    proofBytes: Buffer,
    publicInputs: Buffer
  ): Buffer {
    const proofLen = Buffer.alloc(4);
    proofLen.writeUInt32LE(proofBytes.length);
    const publicInputsLen = Buffer.alloc(4);
    publicInputsLen.writeUInt32LE(publicInputs.length);

    return Buffer.concat([
      discriminator,
      Buffer.from([proofType]),
      vkeyHash,
      proofLen,
      proofBytes,
      publicInputsLen,
      publicInputs,
    ]);
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
