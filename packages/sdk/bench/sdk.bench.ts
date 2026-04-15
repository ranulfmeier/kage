import { bench, describe } from "vitest";
import { Keypair } from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import {
  createEncryptionEngine,
  hashClaim,
  buildCredentialSignaturePayload,
  hashCredentialPayload,
} from "../src/index.js";
import type { ViewingKey } from "../src/index.js";

// ── Shared setup ─────────────────────────────────────────────────────────────
// bench() disallows top-level awaits, so we preseed synchronously and reuse.

const engine = createEncryptionEngine({ network: "devnet" });
const ownerKeypair = Keypair.generate();

// A viewing key is just 32 random bytes for bench purposes; we don't want
// the cost of async generateViewingKey() in the sample loop.
const viewingKey: ViewingKey = {
  key: new Uint8Array(createHash("sha256").update(ownerKeypair.secretKey).digest()),
  publicKey: ownerKeypair.publicKey,
};

const smallPayload = { name: "agent-alpha", role: "trader", score: 87 };
const mediumPayload = {
  memories: Array.from({ length: 50 }, (_, i) => ({
    id: `mem-${i}`,
    text: "a".repeat(200),
    timestamp: 1700000000 + i,
  })),
};
const largePayload = {
  traces: Array.from({ length: 500 }, (_, i) => ({
    id: `trace-${i}`,
    input: "x".repeat(500),
    output: "y".repeat(500),
    metadata: { ts: i, tags: ["a", "b", "c"] },
  })),
};

// Precomputed encrypted blobs for decrypt benches. We await the promise
// inside an IIFE that stores the result via module eval — vitest will have
// them ready by the time bench() runs because bench discovery is async.
let smallBlob: Awaited<ReturnType<typeof engine.encrypt>>;
let mediumBlob: Awaited<ReturnType<typeof engine.encrypt>>;
let largeBlob: Awaited<ReturnType<typeof engine.encrypt>>;

await (async () => {
  smallBlob = await engine.encrypt(smallPayload, viewingKey);
  mediumBlob = await engine.encrypt(mediumPayload, viewingKey);
  largeBlob = await engine.encrypt(largePayload, viewingKey);
})();

// Canonical credential fixture.
const claim = {
  capability: "trade:execute",
  scope: ["SOL/USDC", "SOL/USDT"],
  maxNotional: 10_000,
  expiresAt: 1800000000,
};
const claimHashHex = Buffer.from(hashClaim(claim)).toString("hex");
const credIdHex = randomBytes(32).toString("hex");

const issuerDid = "did:sol:" + Keypair.generate().publicKey.toBase58();
const subjectDid = "did:sol:" + Keypair.generate().publicKey.toBase58();

const credentialPayload = buildCredentialSignaturePayload({
  credentialId: credIdHex,
  issuer: issuerDid,
  subject: subjectDid,
  claimHash: claimHashHex,
  issuedAt: 1700000000,
  expiresAt: 1800000000,
});

// ── Benches ──────────────────────────────────────────────────────────────────

describe("encryption", () => {
  bench("encrypt small (~50 B)", async () => {
    await engine.encrypt(smallPayload, viewingKey);
  });

  bench("encrypt medium (~13 KB)", async () => {
    await engine.encrypt(mediumPayload, viewingKey);
  });

  bench("encrypt large (~500 KB)", async () => {
    await engine.encrypt(largePayload, viewingKey);
  });

  bench("decrypt small", async () => {
    await engine.decrypt(smallBlob, viewingKey);
  });

  bench("decrypt medium", async () => {
    await engine.decrypt(mediumBlob, viewingKey);
  });

  bench("decrypt large", async () => {
    await engine.decrypt(largeBlob, viewingKey);
  });
});

describe("hashing", () => {
  bench("computeHash small", async () => {
    await engine.computeHash(smallPayload);
  });

  bench("computeHash large", async () => {
    await engine.computeHash(largePayload);
  });
});

describe("credentials", () => {
  bench("hashClaim (canonical JSON + sha256)", () => {
    hashClaim(claim);
  });

  bench("buildCredentialSignaturePayload (144-byte envelope)", () => {
    buildCredentialSignaturePayload({
      credentialId: credIdHex,
      issuer: issuerDid,
      subject: subjectDid,
      claimHash: claimHashHex,
      issuedAt: 1700000000,
      expiresAt: 1800000000,
    });
  });

  bench("hashCredentialPayload (envelope sha256)", () => {
    hashCredentialPayload(credentialPayload);
  });
});
