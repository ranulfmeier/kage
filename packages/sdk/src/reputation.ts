import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskOutcome = "success" | "failure" | "partial" | "slashed";
export type ReputationTier = "unknown" | "newcomer" | "trusted" | "verified" | "elite";

export interface ReputationEvent {
  eventId: string;
  agentDID: string;
  type: "task_complete" | "task_fail" | "credential_issued" | "slash" | "stake";
  outcome: TaskOutcome;
  /** Points delta (+/-) */
  delta: number;
  description: string;
  txSignature?: string;
  explorerUrl?: string;
  timestamp: number;
}

export interface AgentReputation {
  agentDID: string;
  /** 0-1000 composite score */
  score: number;
  tier: ReputationTier;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  slashCount: number;
  /** Staked lamports (future: collateral) */
  stakedLamports: number;
  events: ReputationEvent[];
  lastUpdated: number;
  /** On-chain anchor of latest score */
  lastTxSignature?: string;
}

export interface ReputationSnapshot {
  agentDID: string;
  score: number;
  tier: ReputationTier;
  contentHash: string;
  txSignature?: string;
  explorerUrl?: string;
  timestamp: number;
}

// ─── Scoring constants ────────────────────────────────────────────────────────

const SCORE_TASK_SUCCESS  =  25;
const SCORE_TASK_PARTIAL  =   8;
const SCORE_TASK_FAIL     = -15;
const SCORE_SLASH         = -80;
const SCORE_CREDENTIAL    =  10;
const SCORE_MAX           = 1000;
const SCORE_MIN           =   0;

function computeTier(score: number): ReputationTier {
  if (score >= 800) return "elite";
  if (score >= 600) return "verified";
  if (score >= 350) return "trusted";
  if (score >= 100) return "newcomer";
  return "unknown";
}

// ─── ReputationEngine ─────────────────────────────────────────────────────────

export class ReputationEngine {
  private connection: Connection;
  private keypair!: Keypair;
  private network: string;

  /** Local reputation store: did → reputation */
  private reputations = new Map<string, AgentReputation>();

  constructor(config: { rpcUrl: string; network?: string }) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.network = config.network ?? "devnet";
  }

  initialize(keypair: Keypair): void {
    this.keypair = keypair;

    // Bootstrap self reputation
    const selfDID = this.getSelfDID();
    if (!this.reputations.has(selfDID)) {
      this.reputations.set(selfDID, {
        agentDID: selfDID,
        score: 100,
        tier: "newcomer",
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        slashCount: 0,
        stakedLamports: 0,
        events: [],
        lastUpdated: Date.now(),
      });
    }
    console.log(`[KageReputation] Engine initialized. Self score: ${this.getSelfReputation()?.score}`);
  }

  getSelfDID(): string {
    return `did:sol:${this.keypair.publicKey.toBase58()}`;
  }

  // ── Core operations ──────────────────────────────────────────────────────

  /**
   * Record a task outcome for an agent and update their score.
   * Commits the new score hash on-chain via Solana Memo.
   */
  async recordTask(params: {
    agentDID?: string;
    outcome: TaskOutcome;
    description?: string;
  }): Promise<ReputationEvent> {
    const did = params.agentDID ?? this.getSelfDID();
    const rep = this.getOrCreate(did);

    const delta = params.outcome === "success" ? SCORE_TASK_SUCCESS
      : params.outcome === "partial" ? SCORE_TASK_PARTIAL
      : params.outcome === "failure" ? SCORE_TASK_FAIL
      : SCORE_SLASH;

    rep.score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, rep.score + delta));
    rep.tier = computeTier(rep.score);
    rep.totalTasks++;
    if (params.outcome === "success") rep.successfulTasks++;
    else if (params.outcome === "failure" || params.outcome === "slashed") rep.failedTasks++;
    rep.lastUpdated = Date.now();

    const event = await this.addEvent(rep, {
      type: "task_complete",
      outcome: params.outcome,
      delta,
      description: params.description ?? `Task ${params.outcome}`,
    });

    return event;
  }

  /**
   * Slash an agent (e.g. malicious behaviour, missing deadline).
   */
  async slash(params: { agentDID?: string; reason: string }): Promise<ReputationEvent> {
    const did = params.agentDID ?? this.getSelfDID();
    const rep = this.getOrCreate(did);

    rep.score = Math.max(SCORE_MIN, rep.score + SCORE_SLASH);
    rep.tier = computeTier(rep.score);
    rep.slashCount++;
    rep.lastUpdated = Date.now();

    return this.addEvent(rep, {
      type: "slash",
      outcome: "slashed",
      delta: SCORE_SLASH,
      description: `Slashed: ${params.reason}`,
    });
  }

  /**
   * Award reputation for issuing a credential (acts as endorser).
   */
  async recordCredentialIssued(agentDID?: string): Promise<ReputationEvent> {
    const did = agentDID ?? this.getSelfDID();
    const rep = this.getOrCreate(did);
    rep.score = Math.min(SCORE_MAX, rep.score + SCORE_CREDENTIAL);
    rep.tier = computeTier(rep.score);
    rep.lastUpdated = Date.now();

    return this.addEvent(rep, {
      type: "credential_issued",
      outcome: "success",
      delta: SCORE_CREDENTIAL,
      description: "Credential issued to peer agent",
    });
  }

  /** Anchor the current reputation snapshot on-chain */
  async commitSnapshot(agentDID?: string): Promise<ReputationSnapshot> {
    const did = agentDID ?? this.getSelfDID();
    const rep = this.getOrCreate(did);

    const payload = JSON.stringify({ did, score: rep.score, tier: rep.tier, ts: Date.now() });
    const contentHash = createHash("sha256").update(payload).digest("hex");

    let txSignature: string | undefined;
    let explorerUrl: string | undefined;
    try {
      const memo = `kage:rep:${did.slice(-8)}:${rep.score}:${contentHash.slice(0, 12)}`;
      txSignature = await this.writeMemoProgramTx(memo);
      explorerUrl = `https://solscan.io/tx/${txSignature}?cluster=${this.network}`;
      rep.lastTxSignature = txSignature;
      console.log(`[KageReputation] Snapshot committed: score=${rep.score} tier=${rep.tier}`);
    } catch (err) {
      console.warn(`[KageReputation] On-chain commit failed: ${(err as Error).message}`);
    }

    return {
      agentDID: did,
      score: rep.score,
      tier: rep.tier,
      contentHash,
      txSignature,
      explorerUrl,
      timestamp: Date.now(),
    };
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  getSelfReputation(): AgentReputation | undefined {
    return this.reputations.get(this.getSelfDID());
  }

  getReputation(did: string): AgentReputation | undefined {
    return this.reputations.get(did);
  }

  getAllReputations(): AgentReputation[] {
    return Array.from(this.reputations.values());
  }

  getSuccessRate(did?: string): number {
    const rep = did ? this.getReputation(did) : this.getSelfReputation();
    if (!rep || rep.totalTasks === 0) return 0;
    return Math.round((rep.successfulTasks / rep.totalTasks) * 100);
  }

  getLeaderboard(): AgentReputation[] {
    return Array.from(this.reputations.values())
      .sort((a, b) => b.score - a.score);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private getOrCreate(did: string): AgentReputation {
    if (!this.reputations.has(did)) {
      this.reputations.set(did, {
        agentDID: did,
        score: 100,
        tier: "newcomer",
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        slashCount: 0,
        stakedLamports: 0,
        events: [],
        lastUpdated: Date.now(),
      });
    }
    return this.reputations.get(did)!;
  }

  private async addEvent(
    rep: AgentReputation,
    params: {
      type: ReputationEvent["type"];
      outcome: TaskOutcome;
      delta: number;
      description: string;
    }
  ): Promise<ReputationEvent> {
    const eventId = `evt-${Date.now()}-${randomBytes(3).toString("hex")}`;
    let txSignature: string | undefined;
    let explorerUrl: string | undefined;

    try {
      const memo = `kage:rep:evt:${eventId}:${params.outcome}:${params.delta > 0 ? "+" : ""}${params.delta}`;
      txSignature = await this.writeMemoProgramTx(memo);
      explorerUrl = `https://solscan.io/tx/${txSignature}?cluster=${this.network}`;
    } catch {
      // non-fatal — still record locally
    }

    const event: ReputationEvent = {
      eventId,
      agentDID: rep.agentDID,
      type: params.type,
      outcome: params.outcome,
      delta: params.delta,
      description: params.description,
      txSignature,
      explorerUrl,
      timestamp: Date.now(),
    };

    rep.events.push(event);
    return event;
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
