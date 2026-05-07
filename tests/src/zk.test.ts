import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair } from "@solana/web3.js";
import { ZKCommitmentEngine } from "@kage/sdk";

describe("ZKCommitmentEngine", () => {
  let engine: ZKCommitmentEngine;
  let keypair: Keypair;

  beforeAll(() => {
    keypair = Keypair.generate();
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    engine = new ZKCommitmentEngine(connection, keypair);
  });

  describe("reputation commitment", () => {
    it("should create a commitment with correct public outputs", async () => {
      const commitment = await engine.commitReputation({
        agentDID: "did:sol:TestAgent123",
        events: [
          { eventType: "task_success", delta: 25, timestamp: 1000 },
          { eventType: "task_partial", delta: 8, timestamp: 2000 },
        ],
        claimedScore: 533,
      });

      expect(commitment.id).toBeDefined();
      expect(commitment.proofType).toBe("reputation");
      expect(commitment.agentDID).toBe("did:sol:TestAgent123");
      expect(commitment.publicOutputs.agent_did).toBe("did:sol:TestAgent123");
      expect(commitment.publicOutputs.final_score).toBe(533);
      expect(commitment.publicOutputs.event_count).toBe(2);
      expect(commitment.publicOutputs.events_hash).toBeDefined();
      expect(commitment.inputHash).toBeDefined();
      expect(commitment.outputHash).toBeDefined();
    });

    it("should set status to pending or anchored", async () => {
      const commitment = await engine.commitReputation({
        agentDID: "did:sol:Test2",
        events: [],
        claimedScore: 500,
      });

      expect(["pending", "anchored"]).toContain(commitment.status);
    });

    it("should produce consistent FNV-1a hash for same events", async () => {
      const events = [
        { eventType: "task_success", delta: 25, timestamp: 1000 },
      ];

      const c1 = await engine.commitReputation({
        agentDID: "did:sol:A",
        events,
        claimedScore: 525,
      });

      const c2 = await engine.commitReputation({
        agentDID: "did:sol:A",
        events,
        claimedScore: 525,
      });

      expect(c1.publicOutputs.events_hash).toBe(c2.publicOutputs.events_hash);
    });
  });

  describe("memory commitment", () => {
    it("should create a memory commitment", async () => {
      const commitment = await engine.commitMemory({
        agentDID: "did:sol:MemAgent",
        ciphertextHash: "abc123def456",
        storedAt: Date.now(),
        memoryType: "episodic",
      });

      expect(commitment.proofType).toBe("memory");
      expect(commitment.publicOutputs.ciphertext_hash).toBe("abc123def456");
      expect(commitment.publicOutputs.commitment_valid).toBe(true);
    });
  });

  describe("task commitment", () => {
    it("should create a task commitment", async () => {
      const commitment = await engine.commitTask({
        taskId: "task-001",
        instructionHash: "instr-hash-abc",
        resultHash: "result-hash-xyz",
        outcome: "success",
        executorDID: "did:sol:Executor1",
        completedAt: Date.now(),
      });

      expect(commitment.proofType).toBe("task");
      expect(commitment.publicOutputs.task_id).toBe("task-001");
      expect(commitment.publicOutputs.outcome).toBe("success");
      expect(commitment.publicOutputs.outcome_valid).toBe(true);
    });
  });

  describe("verification (hash-based)", () => {
    it("should verify a valid commitment", async () => {
      const commitment = await engine.commitReputation({
        agentDID: "did:sol:VerifyTest",
        events: [{ eventType: "task_success", delta: 25, timestamp: 1000 }],
        claimedScore: 525,
      });

      const result = engine.verifyCommitment(commitment.id);
      expect(result.valid).toBe(true);
      expect(result.commitment).toBeDefined();
    });

    it("should fail for non-existent commitment", () => {
      const result = engine.verifyCommitment("non-existent-id");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Commitment not found");
    });
  });

  describe("query and listing", () => {
    it("should list commitments with filters", async () => {
      const all = engine.listCommitments();
      expect(all.length).toBeGreaterThan(0);

      const reputationOnly = engine.listCommitments({ proofType: "reputation" });
      expect(reputationOnly.every((c) => c.proofType === "reputation")).toBe(true);
    });

    it("should get a specific commitment by id", async () => {
      const commitment = await engine.commitMemory({
        agentDID: "did:sol:GetTest",
        ciphertextHash: "hash123",
        storedAt: Date.now(),
        memoryType: "semantic",
      });

      const retrieved = engine.getCommitment(commitment.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(commitment.id);
    });
  });

  describe("markProved", () => {
    it("should update commitment status and vkey", async () => {
      const commitment = await engine.commitReputation({
        agentDID: "did:sol:ProveTest",
        events: [],
        claimedScore: 500,
      });

      const success = engine.markProved(commitment.id, "0xfakevkey123");
      expect(success).toBe(true);

      const updated = engine.getCommitment(commitment.id);
      expect(updated?.status).toBe("proved");
      expect(updated?.vkey).toBe("0xfakevkey123");
      expect(updated?.provedAt).toBeDefined();
    });

    it("should return false for non-existent commitment", () => {
      expect(engine.markProved("nonexistent", "0x")).toBe(false);
    });
  });

  describe("status naming", () => {
    it("should not use 'verified' status after memo anchoring", async () => {
      const commitment = await engine.commitReputation({
        agentDID: "did:sol:StatusTest",
        events: [],
        claimedScore: 500,
      });

      expect(commitment.status).not.toBe("verified");
      expect(["pending", "anchored"]).toContain(commitment.status);
    });
  });
});
