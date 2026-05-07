import { describe, it, expect, beforeAll } from "vitest";
import {
  Ed25519Program,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import { createHash } from "crypto";
// @ts-ignore
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  DIDEngine,
  buildVerifyCredentialTx,
  buildRevokeCredentialTx,
  deriveCredentialVerificationPDA,
  deriveCredentialRevocationPDA,
  hashRevocationIntent,
  hashCredentialPayload,
  buildCredentialSignaturePayload,
  KageCredential,
} from "@kage/sdk";

const KAGE_PROGRAM_ID = new PublicKey(
  "ASK5m43oRE67ipfwuBbagVaiMQpFKYRTZNsvZXUfBtRp"
);

describe("credential tx helpers — verify", () => {
  let engine: DIDEngine;
  let issuerKeypair: Keypair;
  let subjectKeypair: Keypair;
  let subjectDID: string;
  let credential: KageCredential;

  beforeAll(async () => {
    issuerKeypair = Keypair.generate();
    subjectKeypair = Keypair.generate();
    subjectDID = `did:sol:${subjectKeypair.publicKey.toBase58()}`;

    engine = new DIDEngine({
      rpcUrl: "https://api.devnet.solana.com",
      network: "devnet",
    });
    engine.initialize(issuerKeypair);

    credential = await engine.issueCredential({
      subjectDID,
      type: "AgentCapability",
      claim: { capability: "data-analysis", level: "advanced" },
    });
  });

  it("produces a transaction with Ed25519 precompile at index 0 and verify_credential at index 1", () => {
    const { transaction } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    expect(transaction.instructions.length).toBe(2);
    expect(transaction.instructions[0].programId.equals(Ed25519Program.programId)).toBe(true);
    expect(transaction.instructions[1].programId.equals(KAGE_PROGRAM_ID)).toBe(true);
  });

  it("derives the canonical CredentialVerification PDA", () => {
    const { verificationPda } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    const credentialIdBytes = Buffer.from(credential.credentialId, "hex");
    const [expectedPda] = deriveCredentialVerificationPDA(
      KAGE_PROGRAM_ID,
      issuerKeypair.publicKey,
      credentialIdBytes
    );
    expect(verificationPda.equals(expectedPda)).toBe(true);
  });

  it("computes a digest that matches the SDK's canonical envelope", () => {
    const { digest } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    expect(digest.length).toBe(32);

    const payload = buildCredentialSignaturePayload({
      credentialId: credential.credentialId,
      issuer: credential.issuer,
      subject: credential.subject,
      claimHash: credential.claimHash,
      issuedAt: credential.issuedAt,
      expiresAt: credential.expiresAt,
    });
    expect(payload.length).toBe(144);

    const expectedDigest = hashCredentialPayload(payload);
    expect(Buffer.from(digest).equals(Buffer.from(expectedDigest))).toBe(true);
  });

  it("embeds the same digest in the Ed25519 precompile message", () => {
    const { transaction, digest } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    // Parse the Ed25519 precompile data per Solana layout and extract the message.
    const data = transaction.instructions[0].data;
    expect(data[0]).toBe(1); // num_signatures
    const msgOffset = data.readUInt16LE(10);
    const msgSize = data.readUInt16LE(12);
    expect(msgSize).toBe(32);

    const extractedMsg = data.slice(msgOffset, msgOffset + msgSize);
    expect(extractedMsg.equals(Buffer.from(digest))).toBe(true);
  });

  it("Ed25519 precompile message digest is actually verifiable against the issuer keypair", () => {
    const { transaction, digest } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    const data = transaction.instructions[0].data;
    const sigOffset = data.readUInt16LE(2);
    const pkOffset = data.readUInt16LE(6);

    const sig = data.slice(sigOffset, sigOffset + 64);
    const pk = data.slice(pkOffset, pkOffset + 32);

    expect(pk.equals(issuerKeypair.publicKey.toBuffer())).toBe(true);

    const verified = ed25519.verify(
      new Uint8Array(sig),
      digest,
      new Uint8Array(pk)
    );
    expect(verified).toBe(true);
  });

  it("verify_credential ix encodes discriminator + fixed-layout args (8+32+32+32+32+8+8 = 152 bytes)", () => {
    const { transaction } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    const ix = transaction.instructions[1];
    expect(ix.data.length).toBe(152);

    const expectedDisc = Buffer.from([139, 189, 60, 127, 32, 241, 162, 134]);
    expect(ix.data.slice(0, 8).equals(expectedDisc)).toBe(true);

    // credential_id bytes (matches the string)
    const credIdInIx = ix.data.slice(8, 40).toString("hex");
    expect(credIdInIx).toBe(credential.credentialId);

    // issuer pubkey
    const issuerInIx = ix.data.slice(40, 72);
    expect(issuerInIx.equals(issuerKeypair.publicKey.toBuffer())).toBe(true);

    // subject pubkey
    const subjectInIx = ix.data.slice(72, 104);
    expect(subjectInIx.equals(subjectKeypair.publicKey.toBuffer())).toBe(true);

    // claim_hash
    const claimHashInIx = ix.data.slice(104, 136).toString("hex");
    expect(claimHashInIx).toBe(credential.claimHash);

    // issued_at + expires_at (expires_at = 0 when not set)
    const issuedAtInIx = ix.data.readBigInt64LE(136);
    expect(issuedAtInIx).toBe(BigInt(credential.issuedAt));
    const expiresAtInIx = ix.data.readBigInt64LE(144);
    expect(expiresAtInIx).toBe(BigInt(credential.expiresAt ?? 0));
  });

  it("verify_credential ix uses the canonical account order (payer, pda, sysvar, system)", () => {
    const { transaction, verificationPda } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    const keys = transaction.instructions[1].keys;
    expect(keys.length).toBe(4);
    expect(keys[0].pubkey.equals(subjectKeypair.publicKey)).toBe(true);
    expect(keys[0].isSigner).toBe(true);
    expect(keys[0].isWritable).toBe(true);
    expect(keys[1].pubkey.equals(verificationPda)).toBe(true);
    expect(keys[1].isWritable).toBe(true);
    expect(keys[2].pubkey.equals(SYSVAR_INSTRUCTIONS_PUBKEY)).toBe(true);
    expect(keys[3].pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  it("rejects credentials with malformed credentialId length", () => {
    const badCred = { ...credential, credentialId: "abc" };
    expect(() =>
      buildVerifyCredentialTx({
        credential: badCred,
        programId: KAGE_PROGRAM_ID,
        payer: subjectKeypair.publicKey,
      })
    ).toThrow(/32 bytes/);
  });

  it("encodes expires_at = 0 when the credential has no expiry", () => {
    const { transaction } = buildVerifyCredentialTx({
      credential, // no expiresAt set
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });
    const expiresAt = transaction.instructions[1].data.readBigInt64LE(144);
    expect(expiresAt).toBe(0n);
  });

  it("encodes a non-zero expires_at for credentials with expiry", async () => {
    const expiringCred = await engine.issueCredential({
      subjectDID,
      type: "TempAccess",
      claim: { scope: "temp" },
      expiresInSec: 3600,
    });
    const { transaction } = buildVerifyCredentialTx({
      credential: expiringCred,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });
    const expiresAt = transaction.instructions[1].data.readBigInt64LE(144);
    expect(expiresAt).toBe(BigInt(expiringCred.expiresAt!));
    expect(expiresAt).toBeGreaterThan(0n);
  });
});

describe("credential tx helpers — revoke", () => {
  const issuerKeypair = Keypair.generate();
  const credentialIdBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) credentialIdBytes[i] = i + 1;
  const payer = Keypair.generate().publicKey;

  it("produces a transaction with Ed25519 precompile at index 0 and revoke_credential at index 1", () => {
    const { transaction } = buildRevokeCredentialTx({
      issuerKeypair,
      credentialId: credentialIdBytes,
      programId: KAGE_PROGRAM_ID,
      payer,
    });
    expect(transaction.instructions.length).toBe(2);
    expect(transaction.instructions[0].programId.equals(Ed25519Program.programId)).toBe(true);
    expect(transaction.instructions[1].programId.equals(KAGE_PROGRAM_ID)).toBe(true);
  });

  it("uses the domain-separated revocation digest", () => {
    const { digest } = buildRevokeCredentialTx({
      issuerKeypair,
      credentialId: credentialIdBytes,
      programId: KAGE_PROGRAM_ID,
      payer,
    });

    const expectedDigest = hashRevocationIntent(
      issuerKeypair.publicKey,
      credentialIdBytes
    );
    expect(Buffer.from(digest).equals(Buffer.from(expectedDigest))).toBe(true);

    // The digest must equal sha256(tag || issuer || credential_id) — sanity check
    // against a hand-computed reference so a refactor can't silently drift.
    const preimage = Buffer.concat([
      Buffer.from("kage:revoke:v1"),
      issuerKeypair.publicKey.toBuffer(),
      Buffer.from(credentialIdBytes),
    ]);
    const reference = createHash("sha256").update(preimage).digest();
    expect(Buffer.from(digest).equals(reference)).toBe(true);
  });

  it("domain-tagged revocation digest differs from any possible credential-verify digest", () => {
    // Build a pseudo-credential payload whose fields happen to include this
    // credential_id in the same byte position, and verify that its digest
    // does NOT collide with the revocation digest.
    const fakeCredVerifyPreimage = Buffer.concat([
      Buffer.from(credentialIdBytes),                  // 32
      issuerKeypair.publicKey.toBuffer(),              // 32
      issuerKeypair.publicKey.toBuffer(),              // subject 32
      Buffer.alloc(32),                                // claim_hash 32
      Buffer.alloc(8),                                 // issued_at
      Buffer.alloc(8),                                 // expires_at
    ]);
    const credVerifyDigest = createHash("sha256").update(fakeCredVerifyPreimage).digest();
    const revDigest = hashRevocationIntent(issuerKeypair.publicKey, credentialIdBytes);
    expect(Buffer.from(credVerifyDigest).equals(Buffer.from(revDigest))).toBe(false);
  });

  it("Ed25519 precompile signature verifies against the issuer pubkey", () => {
    const { transaction, digest } = buildRevokeCredentialTx({
      issuerKeypair,
      credentialId: credentialIdBytes,
      programId: KAGE_PROGRAM_ID,
      payer,
    });

    const data = transaction.instructions[0].data;
    const sigOffset = data.readUInt16LE(2);
    const pkOffset = data.readUInt16LE(6);
    const sig = data.slice(sigOffset, sigOffset + 64);
    const pk = data.slice(pkOffset, pkOffset + 32);

    expect(pk.equals(issuerKeypair.publicKey.toBuffer())).toBe(true);
    expect(
      ed25519.verify(new Uint8Array(sig), digest, new Uint8Array(pk))
    ).toBe(true);
  });

  it("derives the canonical CredentialRevocation PDA", () => {
    const { revocationPda } = buildRevokeCredentialTx({
      issuerKeypair,
      credentialId: credentialIdBytes,
      programId: KAGE_PROGRAM_ID,
      payer,
    });

    const [expected] = deriveCredentialRevocationPDA(
      KAGE_PROGRAM_ID,
      issuerKeypair.publicKey,
      credentialIdBytes
    );
    expect(revocationPda.equals(expected)).toBe(true);
  });

  it("revoke_credential ix has discriminator + credential_id + issuer (8+32+32 = 72 bytes)", () => {
    const { transaction } = buildRevokeCredentialTx({
      issuerKeypair,
      credentialId: credentialIdBytes,
      programId: KAGE_PROGRAM_ID,
      payer,
    });

    const ix = transaction.instructions[1];
    expect(ix.data.length).toBe(72);

    const expectedDisc = Buffer.from([38, 123, 95, 95, 223, 158, 169, 87]);
    expect(ix.data.slice(0, 8).equals(expectedDisc)).toBe(true);

    expect(ix.data.slice(8, 40).equals(Buffer.from(credentialIdBytes))).toBe(true);
    expect(ix.data.slice(40, 72).equals(issuerKeypair.publicKey.toBuffer())).toBe(true);
  });

  it("rejects malformed credentialId length", () => {
    expect(() =>
      buildRevokeCredentialTx({
        issuerKeypair,
        credentialId: new Uint8Array(16),
        programId: KAGE_PROGRAM_ID,
        payer,
      })
    ).toThrow(/32 bytes/);
  });
});
