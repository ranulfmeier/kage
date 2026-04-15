/**
 * ⚠️  LOCAL-ONLY REPUTATION TRACKER — NOT A CROSS-AGENT PROVABLE SYSTEM
 *
 * This module implements a convenience in-memory scoreboard for a single
 * agent instance. Scores live in a `Map<did, AgentReputation>` on the local
 * process. Optional score commits are broadcast via the SPL Memo program as
 * a timestamped audit trail — but **no Kage Anchor program reads these
 * memos**, and the SDK itself never fetches them back. An attacker who
 * controls an agent's keypair can trivially set their own reputation to
 * any value they like by instantiating a fresh tracker.
 *
 * For **cross-agent provable reputation**, use the SP1 reputation circuit
 * via `ZKCommitmentEngine.commitReputation()` (from `./zk.js`), which
 * generates a Groth16 proof and anchors it on-chain through the
 * `verify_sp1_proof` instruction. That pipeline produces a verification
 * record (`ZkVerification` PDA) that any third party can query to confirm
 * the proof was verified by the Kage Anchor program.
 *
 * The class `LocalReputationTracker` is the intended public name. The
 * legacy alias `ReputationEngine` is exported for backward compatibility
 * and is marked `@deprecated` — migrate to `LocalReputationTracker` for
 * new code.
 *
 * See [docs/MODULE-REALITY.md](../../../docs/MODULE-REALITY.md) for the full reality audit.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import type {
  ZKCommitmentEngine,
  ZKCommitment,
  OnChainVerificationResult,
} from "./zk.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskOutcome = "success" | "failure" | "partial" | "slashed";
export type ReputationTier = "unknown" | "newcomer" | "trusted" | "verified" | "elite";

/**
 * Canonical event types recognised by the SP1 reputation circuit. Any event
 * whose `type` is one of these can be committed via `commitZkSnapshot`;
 * events with a non-canonical type (e.g. `credential_issued`, `stake`) are
 * filtered out of the ZK input so the circuit's delta validation passes.
 */
export type CanonicalReputationEventType =
  | "task_complete"
  | "task_partial"
  | "task_fail"
  | "slash";

export type ReputationEventType =
  | CanonicalReputationEventType
  | "credential_issued"
  | "stake";

export interface ReputationEvent {
  eventId: string;
  agentDID: string;
  type: ReputationEventType;
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

/**
 * Snapshot returned by `commitZkSnapshot` — extends ReputationSnapshot with
 * ZK commitment and (optionally) on-chain verification metadata.
 *
 * Semantics:
 *   - `score` here is the **circuit-computed score**, which considers only
 *     canonical events (task_complete/partial/fail/slash). Local-only events
 *     like `credential_issued` are excluded. This may differ from the
 *     tracker's local score.
 *   - `zkCommitment` is the commitment record from the ZKCommitmentEngine
 *     and carries status ("pending" → "proved" → "verified").
 *   - `verification` is present only if `verifyOnChain: true` was passed
 *     AND the prover generated Groth16 data (network mode).
 */
export interface ZkReputationSnapshot extends ReputationSnapshot {
  /** Circuit-canonical score (may differ from tracker local score) */
  zkScore: number;
  /** Number of events that were included in the ZK input (after filtering) */
  zkEventCount: number;
  /** ZKCommitmentEngine commitment record */
  zkCommitment: ZKCommitment;
  /** On-chain verification result when `verifyOnChain: true` */
  verification?: OnChainVerificationResult;
}

// ─── Scoring constants ────────────────────────────────────────────────────────
//
// These MUST match the SP1 reputation circuit in
// `packages/zk-circuits/lib/src/lib.rs`. Any drift is a silent bug: the
// circuit validates `ev.delta == expected_delta` per event type and rejects
// the proof if the tracker's local deltas don't match.
//
// `SCORE_CREDENTIAL` has no circuit equivalent — the `credential_issued`
// event is a local-only bookkeeping signal and is filtered out of the ZK
// input by `commitZkSnapshot`.

const SCORE_BASE          =  100;
const SCORE_TASK_SUCCESS  =   25;
const SCORE_TASK_PARTIAL  =    5;
const SCORE_TASK_FAIL     =  -15;
const SCORE_SLASH         = -100;
const SCORE_CREDENTIAL    =   10; // local-only — not in circuit
const SCORE_MAX           = 1000;
const SCORE_MIN           =    0;

function computeTier(score: number): ReputationTier {
  if (score >= 800) return "elite";
  if (score >= 600) return "verified";
  if (score >= 350) return "trusted";
  if (score >= 100) return "newcomer";
  return "unknown";
}

// ─── LocalReputationTracker ───────────────────────────────────────────────────

/**
 * In-memory reputation tracker with optional Memo-program audit trail.
 *
 * **This is not a reputation system that other agents can trust.** It is a
 * convenience bookkeeper for a single agent instance. Use
 * `ZKCommitmentEngine.commitReputation()` from `./zk.js` when you need
 * another party to verify your score on-chain.
 *
 * See the module-level docstring above for details.
 */
export class LocalReputationTracker {
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
        score: SCORE_BASE,
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

    // Pick the circuit-canonical event type and delta for this outcome so
    // `commitZkSnapshot` can forward the event to the ZK circuit without
    // any translation.
    let eventType: CanonicalReputationEventType;
    let delta: number;
    switch (params.outcome) {
      case "success":
        eventType = "task_complete";
        delta = SCORE_TASK_SUCCESS;
        break;
      case "partial":
        eventType = "task_partial";
        delta = SCORE_TASK_PARTIAL;
        break;
      case "failure":
        eventType = "task_fail";
        delta = SCORE_TASK_FAIL;
        break;
      case "slashed":
        eventType = "slash";
        delta = SCORE_SLASH;
        break;
    }

    rep.score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, rep.score + delta));
    rep.tier = computeTier(rep.score);
    rep.totalTasks++;
    if (params.outcome === "success") rep.successfulTasks++;
    else if (params.outcome === "failure" || params.outcome === "slashed") rep.failedTasks++;
    rep.lastUpdated = Date.now();

    const event = await this.addEvent(rep, {
      type: eventType,
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

  /**
   * Commit a reputation snapshot via the SP1 ZK pipeline — the provable
   * path. Unlike `commitSnapshot` (which writes a memo log), this method:
   *
   *   1. Filters the tracker's local event log down to circuit-canonical
   *      events (task_complete/partial/fail/slash). Local-only events
   *      (credential_issued, stake) are excluded because the SP1 reputation
   *      circuit does not know their deltas.
   *   2. Computes the circuit-canonical score from the filtered events
   *      (base score + sum of deltas, clamped to [0, 1000]). This is the
   *      value that gets committed on-chain — it may differ from the
   *      tracker's local `score` field.
   *   3. Submits the commitment to the provided `ZKCommitmentEngine`.
   *   4. (Optional) Waits for the SP1 prover to generate a Groth16 proof.
   *   5. (Optional) Submits the proof to the Kage Anchor program via
   *      `verify_sp1_proof`, producing a `ZkVerification` PDA that any
   *      third party can query to confirm the snapshot was proved.
   *
   * `options.waitForProof` defaults to `true`. `options.verifyOnChain`
   * defaults to `false` because it requires the prover to run in network
   * mode (Succinct Network) so Groth16 bytes are available.
   */
  async commitZkSnapshot(
    zkEngine: ZKCommitmentEngine,
    options: {
      agentDID?: string;
      waitForProof?: boolean;
      verifyOnChain?: boolean;
      timeoutMs?: number;
    } = {}
  ): Promise<ZkReputationSnapshot> {
    const {
      agentDID,
      waitForProof = true,
      verifyOnChain = false,
      timeoutMs = 300_000,
    } = options;

    const did = agentDID ?? this.getSelfDID();
    const rep = this.getOrCreate(did);

    // Filter events to circuit-canonical types only. Each of these carries
    // a delta the circuit already knows how to validate.
    const canonicalEvents = rep.events.filter((ev): ev is ReputationEvent & {
      type: CanonicalReputationEventType;
    } => {
      return (
        ev.type === "task_complete" ||
        ev.type === "task_partial" ||
        ev.type === "task_fail" ||
        ev.type === "slash"
      );
    });

    // Recompute the circuit-canonical score from the filtered events,
    // mirroring `compute_reputation_score` in the SP1 circuit.
    let zkScore = SCORE_BASE;
    for (const ev of canonicalEvents) {
      zkScore = Math.max(SCORE_MIN, Math.min(SCORE_MAX, zkScore + ev.delta));
    }

    const commitment = await zkEngine.commitReputation({
      agentDID: did,
      claimedScore: zkScore,
      events: canonicalEvents.map((ev) => ({
        eventType: ev.type,
        delta: ev.delta,
        timestamp: ev.timestamp,
      })),
    });

    if (waitForProof) {
      await zkEngine.requestProofAndWait(commitment.id, timeoutMs);
    }

    let verification: OnChainVerificationResult | undefined;
    if (verifyOnChain) {
      if (!waitForProof) {
        throw new Error(
          "verifyOnChain requires waitForProof to be true so the proof is available before submission"
        );
      }
      verification = await zkEngine.verifyOnChain(commitment.id);
    }

    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          did,
          zkScore,
          eventCount: canonicalEvents.length,
          commitmentId: commitment.id,
        })
      )
      .digest("hex");

    return {
      agentDID: did,
      score: zkScore,
      zkScore,
      zkEventCount: canonicalEvents.length,
      tier: computeTier(zkScore),
      contentHash,
      txSignature: verification?.txSignature,
      explorerUrl: commitment.explorerUrl,
      timestamp: Date.now(),
      zkCommitment: commitment,
      verification,
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
        score: SCORE_BASE,
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

/**
 * @deprecated Renamed to {@link LocalReputationTracker}. The old name was
 * misleading because it implied a cross-agent-provable reputation system;
 * in reality this class is an in-memory scoreboard with an optional Memo
 * audit trail. Migrate to `LocalReputationTracker` for new code. For
 * provable reputation, use `ZKCommitmentEngine.commitReputation()` from
 * `./zk.js`.
 */
export const ReputationEngine = LocalReputationTracker;
// Type alias so `let x: ReputationEngine` keeps working during migration.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ReputationEngine = LocalReputationTracker;
