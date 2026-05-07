import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair } from "@solana/web3.js";
import {
  LocalReputationTracker,
  ZKCommitmentEngine,
  ZkReputationSnapshot,
  type ZKCommitment,
  type OnChainVerificationResult,
  type ReputationCommitmentInput,
} from "@kage/sdk";

// ─── Fake ZKCommitmentEngine ──────────────────────────────────────────────────
//
// The real ZKCommitmentEngine talks to an SP1 prover service and the Kage
// Solana program. For unit tests we only need to assert that
// `commitZkSnapshot` builds the correct canonical input and routes through
// the engine's public methods. This fake records every call so we can
// introspect the arguments.

class FakeZKEngine {
  commitReputationCalls: ReputationCommitmentInput[] = [];
  requestProofAndWaitCalls: string[] = [];
  verifyOnChainCalls: string[] = [];

  fakeCommitment: ZKCommitment = {
    id: "fake-commitment-id",
    proofType: "reputation",
    agentDID: "",
    inputHash: "fakeinputhash",
    outputHash: "fakeoutputhash",
    publicOutputs: {},
    status: "pending",
    createdAt: Date.now(),
  };

  async commitReputation(
    input: ReputationCommitmentInput
  ): Promise<ZKCommitment> {
    this.commitReputationCalls.push(input);
    this.fakeCommitment = {
      ...this.fakeCommitment,
      agentDID: input.agentDID,
      publicOutputs: {
        agent_did: input.agentDID,
        final_score: input.claimedScore,
        event_count: input.events.length,
        events_hash: "0xdeadbeef",
      },
    };
    return this.fakeCommitment;
  }

  async requestProofAndWait(commitmentId: string): Promise<unknown> {
    this.requestProofAndWaitCalls.push(commitmentId);
    return { proof_id: "fake-proof-id", status: "completed" };
  }

  async verifyOnChain(commitmentId: string): Promise<OnChainVerificationResult> {
    this.verifyOnChainCalls.push(commitmentId);
    return {
      txSignature: "fake-sig",
      verificationPda: "FakePda111111111111111111111111111111111111",
      proofType: "reputation",
      vkeyHash: "0xfake",
    };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LocalReputationTracker.commitZkSnapshot", () => {
  let tracker: LocalReputationTracker;
  let keypair: Keypair;
  let did: string;

  beforeAll(() => {
    keypair = Keypair.generate();
    did = `did:sol:${keypair.publicKey.toBase58()}`;
    tracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
      network: "devnet",
    });
    tracker.initialize(keypair);
  });

  it("starts with circuit-canonical base score 100", () => {
    const rep = tracker.getSelfReputation();
    expect(rep?.score).toBe(100);
    expect(rep?.tier).toBe("newcomer");
  });

  it("recordTask('success') emits event with circuit-canonical type + delta", async () => {
    const ev = await tracker.recordTask({ outcome: "success" });
    expect(ev.type).toBe("task_complete");
    expect(ev.delta).toBe(25);
    expect(tracker.getSelfReputation()?.score).toBe(125);
  });

  it("recordTask('partial') uses circuit delta +5 (not +8)", async () => {
    const scoreBefore = tracker.getSelfReputation()!.score;
    const ev = await tracker.recordTask({ outcome: "partial" });
    expect(ev.type).toBe("task_partial");
    expect(ev.delta).toBe(5);
    expect(tracker.getSelfReputation()?.score).toBe(scoreBefore + 5);
  });

  it("recordTask('failure') uses circuit delta -15", async () => {
    const scoreBefore = tracker.getSelfReputation()!.score;
    const ev = await tracker.recordTask({ outcome: "failure" });
    expect(ev.type).toBe("task_fail");
    expect(ev.delta).toBe(-15);
    expect(tracker.getSelfReputation()?.score).toBe(scoreBefore - 15);
  });

  it("slash() uses circuit delta -100 (not -80)", async () => {
    const scoreBefore = tracker.getSelfReputation()!.score;
    const ev = await tracker.slash({ reason: "missed deadline" });
    expect(ev.type).toBe("slash");
    expect(ev.delta).toBe(-100);
    expect(tracker.getSelfReputation()?.score).toBe(Math.max(0, scoreBefore - 100));
  });

  it("commitZkSnapshot filters out non-canonical events before ZK commit", async () => {
    const freshKp = Keypair.generate();
    const freshTracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
    });
    freshTracker.initialize(freshKp);

    await freshTracker.recordTask({ outcome: "success" });
    await freshTracker.recordTask({ outcome: "success" });
    await freshTracker.recordCredentialIssued(); // non-canonical — must be filtered
    await freshTracker.recordTask({ outcome: "failure" });

    const fake = new FakeZKEngine();
    const snap = await freshTracker.commitZkSnapshot(fake as unknown as ZKCommitmentEngine, {
      waitForProof: false,
    });

    expect(fake.commitReputationCalls.length).toBe(1);
    const zkInput = fake.commitReputationCalls[0];
    expect(zkInput.events.length).toBe(3); // 2 success + 1 fail, credential filtered
    expect(zkInput.events.every((e) =>
      ["task_complete", "task_partial", "task_fail", "slash"].includes(e.eventType)
    )).toBe(true);
    expect(snap.zkEventCount).toBe(3);
  });

  it("commitZkSnapshot computes zkScore matching the SP1 circuit's formula", async () => {
    const freshKp = Keypair.generate();
    const freshTracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
    });
    freshTracker.initialize(freshKp);

    // BASE=100, success=+25, partial=+5, fail=-15, slash=-100
    await freshTracker.recordTask({ outcome: "success" }); // 125
    await freshTracker.recordTask({ outcome: "success" }); // 150
    await freshTracker.recordTask({ outcome: "partial" }); // 155
    await freshTracker.recordTask({ outcome: "failure" }); // 140

    const fake = new FakeZKEngine();
    const snap = await freshTracker.commitZkSnapshot(fake as unknown as ZKCommitmentEngine, {
      waitForProof: false,
    });

    expect(snap.zkScore).toBe(140);
    // The ZK input's claimedScore must match
    expect(fake.commitReputationCalls[0].claimedScore).toBe(140);
  });

  it("credential_issued events affect local score but NOT zkScore", async () => {
    const freshKp = Keypair.generate();
    const freshTracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
    });
    freshTracker.initialize(freshKp);

    await freshTracker.recordTask({ outcome: "success" }); // local 125, zk 125
    await freshTracker.recordCredentialIssued();            // local 135, zk still 125

    const localRep = freshTracker.getSelfReputation();
    expect(localRep?.score).toBe(135);

    const fake = new FakeZKEngine();
    const snap = await freshTracker.commitZkSnapshot(fake as unknown as ZKCommitmentEngine, {
      waitForProof: false,
    });
    expect(snap.zkScore).toBe(125);
    expect(snap.zkScore).not.toBe(localRep?.score);
  });

  it("commitZkSnapshot clamps zkScore to [0, 1000] like the circuit", async () => {
    const freshKp = Keypair.generate();
    const freshTracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
    });
    freshTracker.initialize(freshKp);

    // Slash 3 times: 100 - 100 = 0, floor at 0, -100 again floors, -100 again.
    await freshTracker.slash({ reason: "test" });
    await freshTracker.slash({ reason: "test" });
    await freshTracker.slash({ reason: "test" });

    const fake = new FakeZKEngine();
    const snap = await freshTracker.commitZkSnapshot(fake as unknown as ZKCommitmentEngine, {
      waitForProof: false,
    });
    expect(snap.zkScore).toBeGreaterThanOrEqual(0);
    expect(snap.zkScore).toBe(0);
  });

  it("waitForProof=true calls requestProofAndWait with the commitment id", async () => {
    const freshKp = Keypair.generate();
    const freshTracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
    });
    freshTracker.initialize(freshKp);
    await freshTracker.recordTask({ outcome: "success" });

    const fake = new FakeZKEngine();
    await freshTracker.commitZkSnapshot(fake as unknown as ZKCommitmentEngine, {
      waitForProof: true,
    });

    expect(fake.requestProofAndWaitCalls.length).toBe(1);
    expect(fake.requestProofAndWaitCalls[0]).toBe(fake.fakeCommitment.id);
  });

  it("verifyOnChain=true calls verifyOnChain and records the result", async () => {
    const freshKp = Keypair.generate();
    const freshTracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
    });
    freshTracker.initialize(freshKp);
    await freshTracker.recordTask({ outcome: "success" });

    const fake = new FakeZKEngine();
    const snap = await freshTracker.commitZkSnapshot(fake as unknown as ZKCommitmentEngine, {
      waitForProof: true,
      verifyOnChain: true,
    });

    expect(fake.verifyOnChainCalls.length).toBe(1);
    expect(snap.verification).toBeDefined();
    expect(snap.verification?.txSignature).toBe("fake-sig");
  });

  it("verifyOnChain=true without waitForProof throws a clear error", async () => {
    const freshKp = Keypair.generate();
    const freshTracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
    });
    freshTracker.initialize(freshKp);

    const fake = new FakeZKEngine();
    await expect(
      freshTracker.commitZkSnapshot(fake as unknown as ZKCommitmentEngine, {
        waitForProof: false,
        verifyOnChain: true,
      })
    ).rejects.toThrow(/waitForProof/);
  });

  it("commitZkSnapshot on an empty tracker commits BASE_SCORE with zero events", async () => {
    const freshKp = Keypair.generate();
    const freshTracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
    });
    freshTracker.initialize(freshKp);

    const fake = new FakeZKEngine();
    const snap = await freshTracker.commitZkSnapshot(fake as unknown as ZKCommitmentEngine, {
      waitForProof: false,
    });

    expect(snap.zkScore).toBe(100);
    expect(snap.zkEventCount).toBe(0);
    expect(fake.commitReputationCalls[0].events.length).toBe(0);
    expect(fake.commitReputationCalls[0].claimedScore).toBe(100);
  });

  it("ZkReputationSnapshot carries the commitment record for downstream tracking", async () => {
    const freshKp = Keypair.generate();
    const freshTracker = new LocalReputationTracker({
      rpcUrl: "https://api.devnet.solana.com",
    });
    freshTracker.initialize(freshKp);
    await freshTracker.recordTask({ outcome: "success" });

    const fake = new FakeZKEngine();
    const snap = await freshTracker.commitZkSnapshot(fake as unknown as ZKCommitmentEngine, {
      waitForProof: false,
    });
    expect(snap.zkCommitment).toBeDefined();
    expect(snap.zkCommitment.id).toBe(fake.fakeCommitment.id);
    expect(snap.zkCommitment.proofType).toBe("reputation");
  });
});
