import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";

// Enable test mode BEFORE importing the API module — skips LLM provider
// bootstrapping, HTTP listen, and agent auto-init.
process.env.KAGE_API_TEST_MODE = "1";

let app: Express;

beforeAll(async () => {
  const mod = await import("../src/index.js");
  app = mod.app as unknown as Express;
});

describe("GET /health", () => {
  it("returns ok status with zk + tokenGate fields", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.agent).toBe("kage");
    expect(res.body.llm).toBeDefined();
    expect(res.body.llm.provider).toBeDefined();
    expect(res.body.zk).toBeDefined();
    expect(res.body.zk.engine).toMatch(/sp1/);
    expect(typeof res.body.zk.commitments).toBe("number");
    expect(res.body.tokenGate).toBeDefined();
    expect(typeof res.body.tokenGate.active).toBe("boolean");
  });
});

describe("GET /tier", () => {
  it("returns free-for-all info when wallet is omitted", async () => {
    const res = await request(app).get("/tier");
    expect(res.status).toBe(200);
    expect(res.body.tier).toBeDefined();
    expect(res.body.features).toBeDefined();
    expect(typeof res.body.tokenGateActive).toBe("boolean");
    expect(typeof res.body.daysUntilActivation).toBe("number");
  });

  it("rejects malformed wallet address with 400", async () => {
    const res = await request(app).get("/tier?wallet=not-a-real-pubkey");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });
});

describe("POST /zk/commit/reputation", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/zk/commit/reputation")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("POST /zk/commit/memory", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/zk/commit/memory")
      .send({ agentDID: "did:sol:test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("GET /marketplace/stats", () => {
  it("returns aggregate marketplace stats", async () => {
    const res = await request(app).get("/marketplace/stats");
    expect(res.status).toBe(200);
    expect(typeof res.body.totalAgents).toBe("number");
    expect(typeof res.body.totalHires).toBe("number");
    expect(Array.isArray(res.body.topTags)).toBe(true);
    expect(Array.isArray(res.body.topCapabilities)).toBe(true);
  });
});

describe("CORS policy", () => {
  // In test mode the default is wildcard (devnet fallback), so any Origin
  // header should be accepted and the standard CORS response header should
  // be reflected in the response.
  it("allows same-origin (no Origin header) requests", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("accepts Origin header under the default dev wildcard", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://example.com");
    expect(res.status).toBe(200);
    // cors() middleware reflects Origin (or *) back via Access-Control-Allow-Origin
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });
});
