import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair } from "@solana/web3.js";
import { DIDEngine } from "@kage/sdk";

describe("DIDEngine", () => {
  let engine: DIDEngine;
  let keypair: Keypair;
  let subjectKeypair: Keypair;
  let subjectDID: string;

  beforeAll(() => {
    keypair = Keypair.generate();
    subjectKeypair = Keypair.generate();
    subjectDID = `did:sol:${subjectKeypair.publicKey.toBase58()}`;
    engine = new DIDEngine({ rpcUrl: "https://api.devnet.solana.com", network: "devnet" });
    engine.initialize(keypair);
  });

  describe("DID creation", () => {
    it("should return correct self DID", () => {
      const did = engine.getSelfDID();
      expect(did).toBe(`did:sol:${keypair.publicKey.toBase58()}`);
    });

    it("should create a DID document with correct structure", async () => {
      const { document } = await engine.createDIDDocument({
        agentType: "test",
        capabilities: ["memory", "reasoning"],
      });

      expect(document["@context"]).toContain("https://www.w3.org/ns/did/v1");
      expect(document.id).toBe(engine.getSelfDID());
      expect(document.controller).toBe(document.id);
      expect(document.verificationMethod.length).toBe(2);
      expect(document.verificationMethod[0].type).toBe("Ed25519VerificationKey2020");
      expect(document.verificationMethod[1].type).toBe("X25519KeyAgreementKey2020");
      expect(document.authentication).toContain(`${document.id}#key-1`);
      expect(document.keyAgreement).toContain(`${document.id}#x25519-1`);
      expect(document.kage.agentType).toBe("test");
      expect(document.kage.network).toBe("devnet");
    });
  });

  describe("DID resolution", () => {
    it("should resolve self DID", async () => {
      const resolution = await engine.resolveDID(engine.getSelfDID());
      expect(resolution).not.toBeNull();
      expect(resolution!.did).toBe(engine.getSelfDID());
      expect(resolution!.document).toBeDefined();
    });

    it("should return null for unknown DID", async () => {
      const resolution = await engine.resolveDID("did:sol:UnknownAgent");
      expect(resolution).toBeNull();
    });

    it("should resolve registered peer DID", async () => {
      const peerKeypair = Keypair.generate();
      const peerEngine = new DIDEngine({ rpcUrl: "https://api.devnet.solana.com" });
      peerEngine.initialize(peerKeypair);
      const { document: peerDoc } = await peerEngine.createDIDDocument();

      engine.registerPeerDID(peerDoc);
      const resolution = await engine.resolveDID(peerDoc.id);
      expect(resolution).not.toBeNull();
      expect(resolution!.document.id).toBe(peerDoc.id);
    });
  });

  describe("credential signing with Ed25519", () => {
    it("should issue a credential with real Ed25519 signature over canonical payload", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "AgentCapability",
        claim: { capability: "data-analysis", level: "advanced" },
      });

      expect(credential.credentialId).toBeDefined();
      expect(credential.credentialId.length).toBe(64); // 32 bytes hex
      expect(credential.issuer).toBe(engine.getSelfDID());
      expect(credential.subject).toBe(subjectDID);
      expect(credential.signature).toBeDefined();
      expect(credential.signature.length).toBe(128); // 64 bytes hex
      expect(credential.claimHash).toBeDefined();
      expect(credential.claimHash.length).toBe(64); // 32 bytes hex
      expect(credential.issuedAt).toBeLessThan(Date.now() / 1000 + 5);
      expect(credential.issuedAt).toBeGreaterThan(Date.now() / 1000 - 60);
    });

    it("should verify a valid credential", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "TradingPermission",
        claim: { market: "SOL/USDC", maxAmount: 1000 },
      });

      const result = engine.verifyCredential(credential);
      expect(result.valid).toBe(true);
    });

    it("should reject a claim-tampered credential", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "AuditClearance",
        claim: { clearanceLevel: 3 },
      });

      const tampered = { ...credential, claim: { clearanceLevel: 999 } };
      const result = engine.verifyCredential(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("tampered");
    });

    it("should reject a credential with forged signature", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "TestCredential",
        claim: { test: true },
      });

      const forged = { ...credential, signature: "00".repeat(64) };
      const result = engine.verifyCredential(forged);
      expect(result.valid).toBe(false);
    });

    it("should reject an expired credential", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "TempAccess",
        claim: { access: true },
        expiresInSec: -10,
      });

      const result = engine.verifyCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Credential expired");
    });

    it("should verify credential from a different engine with same keypair", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "CrossVerify",
        claim: { data: "test" },
      });

      const engine2 = new DIDEngine({ rpcUrl: "https://api.devnet.solana.com" });
      engine2.initialize(keypair);
      const result = engine2.verifyCredential(credential);
      expect(result.valid).toBe(true);
    });

    // ─── Regression tests for pre-binary-format vulnerabilities ───────────────

    it("should reject subject-tampered credential (regression: subject was not signed)", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "PrivilegedAccess",
        claim: { scope: "admin" },
      });

      const attackerKeypair = Keypair.generate();
      const attackerDID = `did:sol:${attackerKeypair.publicKey.toBase58()}`;
      const tampered = { ...credential, subject: attackerDID };

      const result = engine.verifyCredential(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("signature");
    });

    it("should reject expiry-extended credential (regression: expiresAt was not signed)", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "TempToken",
        claim: { scope: "read" },
        expiresInSec: -10, // already expired
      });

      // Attacker rewrites expiry to far future to bypass expiration check.
      const tampered = {
        ...credential,
        expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
      };

      const result = engine.verifyCredential(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("signature");
    });

    it("should reject credentialId-tampered credential", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "Swap",
        claim: { scope: "noop" },
      });

      const fakeId = "00".repeat(32);
      const tampered = { ...credential, credentialId: fakeId };
      const result = engine.verifyCredential(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("signature");
    });

    it("should reject issuedAt-tampered credential", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "BackdatedClaim",
        claim: { scope: "history" },
      });

      const tampered = { ...credential, issuedAt: credential.issuedAt - 86400 };
      const result = engine.verifyCredential(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("signature");
    });
  });

  describe("canonical payload determinism", () => {
    it("produces identical signatures for claims with reordered keys", async () => {
      const c1 = await engine.issueCredential({
        subjectDID,
        type: "OrderTest",
        claim: { a: 1, b: 2, c: 3 },
      });
      const reorderedClaim = { c: 3, a: 1, b: 2 };
      const tampered = { ...c1, claim: reorderedClaim };
      // claim_hash must be stable under key reordering — signature should still verify.
      const result = engine.verifyCredential(tampered);
      expect(result.valid).toBe(true);
    });
  });

  describe("credential listing", () => {
    it("should list credentials for this agent", () => {
      const credentials = engine.getCredentials();
      expect(credentials.length).toBeGreaterThan(0);
      expect(credentials.every((c) => c.issuer === engine.getSelfDID())).toBe(true);
    });

    it("should get a specific credential by id", async () => {
      const credential = await engine.issueCredential({
        subjectDID,
        type: "LookupTest",
        claim: { key: "value" },
      });

      const retrieved = engine.getCredential(credential.credentialId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.credentialId).toBe(credential.credentialId);
    });
  });
});
