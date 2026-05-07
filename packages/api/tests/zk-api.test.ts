import { describe, it, before } from "node:test";
import assert from "node:assert";

const API_URL = process.env.API_URL || "http://localhost:3002";

let apiReachable = false;

async function isApiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function skipIfOffline(ctx: { skip: (reason: string) => void }) {
  if (!apiReachable) ctx.skip("API server is not reachable");
}

let createdCommitmentId: string | null = null;

// ── Health ─────────────────────────────────────────────────────────────────────

describe("ZK API Integration Tests", () => {
  before(async () => {
    apiReachable = await isApiReachable();
  });

  describe("GET /health", () => {
    it("returns zk info", async (ctx) => {
      skipIfOffline(ctx);

      const res = await fetch(`${API_URL}/health`);
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.strictEqual(body.status, "ok");
      assert.ok(body.zk, "response must include zk field");
      assert.ok(body.zk.engine, "zk.engine must be defined");
      assert.ok(typeof body.zk.commitments === "number");
    });
  });

  // ── Commit endpoints ──────────────────────────────────────────────────────

  describe("POST /zk/commit/reputation", () => {
    it("creates a reputation commitment", async (ctx) => {
      skipIfOffline(ctx);

      const res = await fetch(`${API_URL}/zk/commit/reputation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDID: "did:kage:test-agent",
          events: [
            { eventType: "task_success", delta: 10, timestamp: 1700000000 },
          ],
          claimedScore: 90,
        }),
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.commitment);
      assert.ok(body.commitment.id);
      assert.strictEqual(body.commitment.proofType, "reputation");
      assert.strictEqual(body.commitment.agentDID, "did:kage:test-agent");

      createdCommitmentId = body.commitment.id;
    });
  });

  describe("POST /zk/commit/memory", () => {
    it("creates a memory commitment", async (ctx) => {
      skipIfOffline(ctx);

      const res = await fetch(`${API_URL}/zk/commit/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDID: "did:kage:test-agent",
          ciphertextHash: "hash-abc-123",
          storedAt: 1700000100,
          memoryType: "semantic",
        }),
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.commitment);
      assert.strictEqual(body.commitment.proofType, "memory");
    });
  });

  describe("POST /zk/commit/task", () => {
    it("creates a task commitment", async (ctx) => {
      skipIfOffline(ctx);

      const res = await fetch(`${API_URL}/zk/commit/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: "task-test-001",
          instructionHash: "instr-hash-test",
          resultHash: "result-hash-test",
          outcome: "success",
          executorDID: "did:kage:executor",
          completedAt: 1700000200,
        }),
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.commitment);
      assert.strictEqual(body.commitment.proofType, "task");
    });
  });

  // ── Query endpoints ───────────────────────────────────────────────────────

  describe("GET /zk/commitments", () => {
    it("lists all commitments", async (ctx) => {
      skipIfOffline(ctx);

      const res = await fetch(`${API_URL}/zk/commitments`);
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(typeof body.count === "number");
      assert.ok(Array.isArray(body.commitments));
    });
  });

  describe("GET /zk/commitment/:id", () => {
    it("returns a specific commitment", async (ctx) => {
      skipIfOffline(ctx);
      if (!createdCommitmentId) ctx.skip("No commitment was created earlier");

      const res = await fetch(
        `${API_URL}/zk/commitment/${createdCommitmentId}`
      );
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(body.commitment);
      assert.strictEqual(body.commitment.id, createdCommitmentId);
    });
  });

  // ── Verify endpoint ──────────────────────────────────────────────────────

  describe("POST /zk/verify/:id", () => {
    it("verifies an existing commitment", async (ctx) => {
      skipIfOffline(ctx);
      if (!createdCommitmentId) ctx.skip("No commitment was created earlier");

      const res = await fetch(
        `${API_URL}/zk/verify/${createdCommitmentId}`,
        { method: "POST" }
      );
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.strictEqual(body.valid, true);
      assert.ok(body.commitment);
    });
  });

  // ── Error cases ──────────────────────────────────────────────────────────

  describe("POST /zk/commit/reputation with missing fields", () => {
    it("returns 400", async (ctx) => {
      skipIfOffline(ctx);

      const res = await fetch(`${API_URL}/zk/commit/reputation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentDID: "did:kage:incomplete" }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error);
    });
  });

  describe("GET /zk/commitment/nonexistent", () => {
    it("returns 404", async (ctx) => {
      skipIfOffline(ctx);

      const res = await fetch(`${API_URL}/zk/commitment/nonexistent-id-xyz`);
      assert.strictEqual(res.status, 404);

      const body = await res.json();
      assert.ok(body.error);
    });
  });
});
