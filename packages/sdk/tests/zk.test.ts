import { describe, it, expect } from "vitest";
import { Connection, Keypair } from "@solana/web3.js";
import { ZKCommitmentEngine } from "../src/zk.js";
import type {
  ReputationCommitmentInput,
  MemoryCommitmentInput,
  TaskCommitmentInput,
} from "../src/zk.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const keypair = Keypair.generate();

function makeEngine(): ZKCommitmentEngine {
  return new ZKCommitmentEngine(connection, keypair);
}

const sampleEvents: ReputationCommitmentInput["events"] = [
  { eventType: "task_success", delta: 10, timestamp: 1700000000 },
  { eventType: "peer_endorsement", delta: 5, timestamp: 1700000100 },
];

const reputationInput: ReputationCommitmentInput = {
  agentDID: "did:kage:agent-alpha",
  events: sampleEvents,
  claimedScore: 85,
};

const memoryInput: MemoryCommitmentInput = {
  agentDID: "did:kage:agent-alpha",
  ciphertextHash: "abc123def456",
  storedAt: 1700000200,
  memoryType: "episodic",
};

const taskInput: TaskCommitmentInput = {
  taskId: "task-001",
  instructionHash: "instr-hash-001",
  resultHash: "result-hash-001",
  outcome: "success",
  executorDID: "did:kage:agent-beta",
  completedAt: 1700000300,
};

// ── fnv1a consistency ──────────────────────────────────────────────────────────

describe("fnv1a consistency", () => {
  it("same events produce the same outputHash across two commitments", async () => {
    const engine = makeEngine();

    const c1 = await engine.commitReputation({ ...reputationInput });
    const c2 = await engine.commitReputation({ ...reputationInput });

    expect(c1.outputHash).toBe(c2.outputHash);
    expect(c1.id).not.toBe(c2.id);
  });
});

// ── commitReputation ───────────────────────────────────────────────────────────

describe("commitReputation", () => {
  it("creates a valid commitment with correct fields", async () => {
    const engine = makeEngine();
    const c = await engine.commitReputation(reputationInput);

    expect(c.proofType).toBe("reputation");
    expect(c.agentDID).toBe("did:kage:agent-alpha");
    expect(c.id).toBeTruthy();
    expect(c.inputHash).toBeTruthy();
    expect(c.outputHash).toBeTruthy();
    expect(c.createdAt).toBeGreaterThan(0);

    const po = c.publicOutputs as Record<string, unknown>;
    expect(po.agent_did).toBe("did:kage:agent-alpha");
    expect(po.final_score).toBe(85);
    expect(po.event_count).toBe(2);
    expect(typeof po.events_hash).toBe("string");
    expect((po.events_hash as string).startsWith("0x")).toBe(true);
  });
});

// ── commitMemory ───────────────────────────────────────────────────────────────

describe("commitMemory", () => {
  it("creates a valid commitment with correct fields", async () => {
    const engine = makeEngine();
    const c = await engine.commitMemory(memoryInput);

    expect(c.proofType).toBe("memory");
    expect(c.agentDID).toBe("did:kage:agent-alpha");
    expect(c.id).toBeTruthy();

    const po = c.publicOutputs as Record<string, unknown>;
    expect(po.agent_did).toBe("did:kage:agent-alpha");
    expect(po.ciphertext_hash).toBe("abc123def456");
    expect(po.stored_at).toBe(1700000200);
    expect(po.commitment_valid).toBe(true);
  });
});

// ── commitTask ─────────────────────────────────────────────────────────────────

describe("commitTask", () => {
  it("creates a valid commitment with correct fields", async () => {
    const engine = makeEngine();
    const c = await engine.commitTask(taskInput);

    expect(c.proofType).toBe("task");
    expect(c.agentDID).toBe("did:kage:agent-beta");
    expect(c.id).toBeTruthy();

    const po = c.publicOutputs as Record<string, unknown>;
    expect(po.task_id).toBe("task-001");
    expect(po.executor_did).toBe("did:kage:agent-beta");
    expect(po.outcome).toBe("success");
    expect(po.instruction_hash).toBe("instr-hash-001");
    expect(po.result_hash).toBe("result-hash-001");
    expect(po.outcome_valid).toBe(true);
  });
});

// ── verifyCommitment ───────────────────────────────────────────────────────────

describe("verifyCommitment", () => {
  it("returns valid for an existing commitment", async () => {
    const engine = makeEngine();
    const c = await engine.commitReputation(reputationInput);

    const result = engine.verifyCommitment(c.id);
    expect(result.valid).toBe(true);
    expect(result.commitment).toBeTruthy();
    expect(result.commitment!.id).toBe(c.id);
  });

  it("returns invalid for a non-existent id", () => {
    const engine = makeEngine();
    const result = engine.verifyCommitment("nonexistent-id-12345");

    expect(result.valid).toBe(false);
    expect(result.commitment).toBeUndefined();
    expect(result.reason).toBeTruthy();
  });
});

// ── listCommitments ────────────────────────────────────────────────────────────

describe("listCommitments", () => {
  it("filters by proofType", async () => {
    const engine = makeEngine();
    await engine.commitReputation(reputationInput);
    await engine.commitMemory(memoryInput);
    await engine.commitTask(taskInput);

    const repOnly = engine.listCommitments({ proofType: "reputation" });
    expect(repOnly.length).toBe(1);
    expect(repOnly[0].proofType).toBe("reputation");

    const memOnly = engine.listCommitments({ proofType: "memory" });
    expect(memOnly.length).toBe(1);
    expect(memOnly[0].proofType).toBe("memory");

    const taskOnly = engine.listCommitments({ proofType: "task" });
    expect(taskOnly.length).toBe(1);
    expect(taskOnly[0].proofType).toBe("task");
  });

  it("filters by agentDID", async () => {
    const engine = makeEngine();
    await engine.commitReputation(reputationInput);
    await engine.commitTask(taskInput);

    const alpha = engine.listCommitments({ agentDID: "did:kage:agent-alpha" });
    expect(alpha.length).toBe(1);
    expect(alpha[0].agentDID).toBe("did:kage:agent-alpha");

    const beta = engine.listCommitments({ agentDID: "did:kage:agent-beta" });
    expect(beta.length).toBe(1);
    expect(beta[0].agentDID).toBe("did:kage:agent-beta");

    const none = engine.listCommitments({ agentDID: "did:kage:nobody" });
    expect(none.length).toBe(0);
  });
});

// ── markProved ─────────────────────────────────────────────────────────────────

describe("markProved", () => {
  it("updates commitment status and vkey", async () => {
    const engine = makeEngine();
    const c = await engine.commitReputation(reputationInput);

    const vkey = "0xdeadbeef1234567890";
    const success = engine.markProved(c.id, vkey);
    expect(success).toBe(true);

    const updated = engine.getCommitment(c.id);
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe("proved");
    expect(updated!.vkey).toBe(vkey);
    expect(updated!.provedAt).toBeGreaterThan(0);
  });

  it("returns false for non-existent commitment", () => {
    const engine = makeEngine();
    const success = engine.markProved("nonexistent-id", "0xvkey");
    expect(success).toBe(false);
  });
});
