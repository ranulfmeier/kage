import { describe, it, expect, beforeAll } from "vitest";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
// @ts-ignore
import { ed25519 } from "@noble/curves/ed25519.js";
import { createHash } from "crypto";

import {
  DIDEngine,
  KageCredential,
  buildVerifyCredentialTx,
  buildRevokeCredentialTx,
  deriveCredentialVerificationPDA,
  deriveCredentialRevocationPDA,
  buildCredentialSignaturePayload,
  hashCredentialPayload,
} from "@kage/sdk";

// ─── Environment ──────────────────────────────────────────────────────────────

const VALIDATOR_URL = process.env.ANCHOR_TEST_RPC ?? "http://127.0.0.1:8899";
const KAGE_PROGRAM_ID = new PublicKey(
  "ASK5m43oRE67ipfwuBbagVaiMQpFKYRTZNsvZXUfBtRp"
);

async function validatorReachable(): Promise<boolean> {
  try {
    const conn = new Connection(VALIDATOR_URL, "confirmed");
    await conn.getVersion();
    const info = await conn.getAccountInfo(KAGE_PROGRAM_ID);
    return info !== null && info.executable;
  } catch {
    return false;
  }
}

// ─── Anchor error parsing ─────────────────────────────────────────────────────

/** Matches an Anchor error name inside a SendTransactionError's logs. */
function errorMatches(err: unknown, needle: string): boolean {
  const s =
    err instanceof Error
      ? (err as any).logs?.join("\n") + "\n" + err.message
      : String(err);
  return s.includes(needle);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function issueCredentialWith(
  engine: DIDEngine,
  subjectDID: string,
  opts: { expiresInSec?: number; claim?: Record<string, unknown> } = {}
): Promise<KageCredential> {
  return engine.issueCredential({
    subjectDID,
    type: "IntegrationTest",
    claim: opts.claim ?? { scope: "noop" },
    expiresInSec: opts.expiresInSec,
  });
}

async function fundAccount(
  conn: Connection,
  pubkey: PublicKey,
  sol: number
): Promise<void> {
  const sig = await conn.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("credential program integration (localnet)", () => {
  let conn: Connection;
  let reachable = false;

  // Issuer: Kage agent keypair (also used as DIDEngine signer)
  let issuerKeypair: Keypair;
  let subjectKeypair: Keypair;
  let subjectDID: string;

  // Payer: we use the subject as the tx payer/signer for most flows. Issuer
  // does NOT sign the tx — authenticity comes from the Ed25519 precompile.
  let didEngine: DIDEngine;

  beforeAll(async () => {
    conn = new Connection(VALIDATOR_URL, "confirmed");
    reachable = await validatorReachable();
    if (!reachable) {
      console.warn(
        `[integration] All tests will be skipped — validator at ${VALIDATOR_URL} not reachable or kage program not deployed. ` +
          `Run 'solana-test-validator --reset --quiet --bpf-program ASK5m43oRE67ipfwuBbagVaiMQpFKYRTZNsvZXUfBtRp target/deploy/kage.so' to enable.`
      );
      return;
    }

    issuerKeypair = Keypair.generate();
    subjectKeypair = Keypair.generate();
    subjectDID = `did:sol:${subjectKeypair.publicKey.toBase58()}`;

    didEngine = new DIDEngine({ rpcUrl: VALIDATOR_URL });
    didEngine.initialize(issuerKeypair);

    await fundAccount(conn, subjectKeypair.publicKey, 5);
    await fundAccount(conn, issuerKeypair.publicKey, 5);
  }, 60_000);

  // ── Case 1: valid credential → PDA created ──────────────────────────────
  it("verifies a valid credential and creates the CredentialVerification PDA", async (ctx) => {
    if (!reachable) ctx.skip();

    const credential = await issueCredentialWith(didEngine, subjectDID);
    const { transaction, verificationPda } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    const sig = await sendAndConfirmTransaction(conn, transaction, [
      subjectKeypair,
    ]);
    expect(sig).toBeDefined();

    const info = await conn.getAccountInfo(verificationPda);
    expect(info).not.toBeNull();
    expect(info!.owner.equals(KAGE_PROGRAM_ID)).toBe(true);
  }, 30_000);

  // ── Case 2: forged signature → rejected ─────────────────────────────────
  it("rejects a credential whose Ed25519 signature doesn't verify on the precompile", async (ctx) => {
    if (!reachable) ctx.skip();

    const credential = await issueCredentialWith(didEngine, subjectDID);
    // Flip the signature bytes. The Ed25519 precompile will fail FIRST (before
    // our program runs), so the tx aborts with a precompile error.
    const tamperedSig = "aa".repeat(64);
    const forged: KageCredential = { ...credential, signature: tamperedSig };

    const { transaction } = buildVerifyCredentialTx({
      credential: forged,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    let caught: unknown;
    try {
      await sendAndConfirmTransaction(conn, transaction, [subjectKeypair]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    // Either the precompile rejects ("Precompile") or our program rejects
    // ("Ed25519MessageMismatch"). Both are valid failure modes.
    const matched =
      errorMatches(caught, "Precompile") ||
      errorMatches(caught, "custom program error") ||
      errorMatches(caught, "Ed25519") ||
      caught instanceof SendTransactionError;
    expect(matched).toBe(true);
  }, 30_000);

  // ── Case 3: message in Ed25519 ix doesn't match credential digest ───────
  it("rejects a tx where the Ed25519 message is a valid signature over a DIFFERENT digest", async (ctx) => {
    if (!reachable) ctx.skip();

    // Issue a credential but build the Ed25519 ix over a garbage digest
    // signed by the issuer. The precompile accepts it (signature is valid
    // for that message), but our program's digest comparison rejects it.
    const credential = await issueCredentialWith(didEngine, subjectDID);
    const { Ed25519Program } = await import("@solana/web3.js");

    const wrongDigest = createHash("sha256").update("wrong").digest();
    const seed = issuerKeypair.secretKey.slice(0, 32);
    const wrongSig = ed25519.sign(wrongDigest, seed);

    const edIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: issuerKeypair.publicKey.toBytes(),
      message: new Uint8Array(wrongDigest),
      signature: wrongSig,
    });

    // Build the correct verify_credential ix using the real credential args.
    const { transaction } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });
    // Replace the precompile ix with the garbage-message one.
    transaction.instructions[0] = edIx;

    let caught: unknown;
    try {
      await sendAndConfirmTransaction(conn, transaction, [subjectKeypair]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      errorMatches(caught, "Ed25519MessageMismatch") ||
        errorMatches(caught, "custom program error")
    ).toBe(true);
  }, 30_000);

  // ── Case 4: no Ed25519 ix before verify → rejected ──────────────────────
  it("rejects a tx where verify_credential is NOT preceded by the Ed25519 precompile", async (ctx) => {
    if (!reachable) ctx.skip();

    const credential = await issueCredentialWith(didEngine, subjectDID);
    const { transaction } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    // Drop the Ed25519 instruction; leave only verify_credential.
    transaction.instructions = [transaction.instructions[1]];

    let caught: unknown;
    try {
      await sendAndConfirmTransaction(conn, transaction, [subjectKeypair]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      errorMatches(caught, "MissingEd25519Instruction") ||
        errorMatches(caught, "InvalidEd25519Program") ||
        errorMatches(caught, "custom program error")
    ).toBe(true);
  }, 30_000);

  // ── Case 5: expired credential → rejected ───────────────────────────────
  it("rejects an expired credential", async (ctx) => {
    if (!reachable) ctx.skip();

    const credential = await issueCredentialWith(didEngine, subjectDID, {
      expiresInSec: -3600, // already expired by 1h
    });

    const { transaction } = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    let caught: unknown;
    try {
      await sendAndConfirmTransaction(conn, transaction, [subjectKeypair]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      errorMatches(caught, "CredentialExpired") ||
        errorMatches(caught, "custom program error")
    ).toBe(true);
  }, 30_000);

  // ── Case 6: revoke → revocation PDA exists ──────────────────────────────
  it("creates a CredentialRevocation PDA when the issuer signs a revoke intent", async (ctx) => {
    if (!reachable) ctx.skip();

    const credential = await issueCredentialWith(didEngine, subjectDID);

    // Verify first (optional — revocation should work even without prior verify).
    const verifyTx = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });
    await sendAndConfirmTransaction(conn, verifyTx.transaction, [
      subjectKeypair,
    ]);

    // Now revoke.
    const credentialIdBytes = Buffer.from(credential.credentialId, "hex");
    const revokeTx = buildRevokeCredentialTx({
      issuerKeypair,
      credentialId: credentialIdBytes,
      programId: KAGE_PROGRAM_ID,
      payer: issuerKeypair.publicKey,
    });
    await sendAndConfirmTransaction(conn, revokeTx.transaction, [
      issuerKeypair,
    ]);

    const [revocationPda] = deriveCredentialRevocationPDA(
      KAGE_PROGRAM_ID,
      issuerKeypair.publicKey,
      credentialIdBytes
    );
    const info = await conn.getAccountInfo(revocationPda);
    expect(info).not.toBeNull();
    expect(info!.owner.equals(KAGE_PROGRAM_ID)).toBe(true);
  }, 45_000);

  // ── Case 7: non-issuer cannot revoke ────────────────────────────────────
  it("rejects a revocation whose Ed25519 signer is not the credential issuer", async (ctx) => {
    if (!reachable) ctx.skip();

    const credential = await issueCredentialWith(didEngine, subjectDID);
    const credentialIdBytes = Buffer.from(credential.credentialId, "hex");

    // Attacker has their own keypair. They try to revoke a credential owned
    // by `issuerKeypair` by signing the revocation digest WITH THEIR KEY,
    // but constructing an ix that claims the credential belongs to issuer.
    const attacker = Keypair.generate();
    await fundAccount(conn, attacker.publicKey, 2);

    // Build a legitimate revoke tx (attacker signs for their own pubkey).
    // The precompile will succeed, but the seed derivation in the verify
    // ix uses the REAL issuer, so the PDA address won't match, OR if the
    // attacker tries to pass their own pubkey as issuer the digest fits
    // but the PDA seed won't correspond to the credential they want to kill.
    //
    // The cleanest attack to test: attacker signs the digest (issuer=real)
    // with their own secret. The precompile's pubkey field will be the
    // attacker's, but the program reads `issuer` arg from the ix data.
    // The program compares ed_pubkey == issuer_arg → mismatch → reject.
    const { transaction } = buildRevokeCredentialTx({
      issuerKeypair: attacker, // attacker signs with own key
      credentialId: credentialIdBytes,
      programId: KAGE_PROGRAM_ID,
      payer: attacker.publicKey,
    });

    // Rewrite the revoke ix to claim issuer = the REAL issuer. This gives
    // the attacker a well-formed ix that tries to kill a credential they
    // don't own.
    const realIssuer = issuerKeypair.publicKey;
    const realData = Buffer.from(transaction.instructions[1].data);
    // layout: 8 (disc) + 32 (credential_id) + 32 (issuer)
    realIssuer.toBuffer().copy(realData, 8 + 32);
    transaction.instructions[1] = new TransactionInstruction({
      programId: KAGE_PROGRAM_ID,
      keys: [
        ...transaction.instructions[1].keys.slice(0, 1),
        {
          pubkey: deriveCredentialRevocationPDA(
            KAGE_PROGRAM_ID,
            realIssuer,
            credentialIdBytes
          )[0],
          isSigner: false,
          isWritable: true,
        },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: realData,
    });

    let caught: unknown;
    try {
      await sendAndConfirmTransaction(conn, transaction, [attacker]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      errorMatches(caught, "Ed25519PubkeyMismatch") ||
        errorMatches(caught, "custom program error")
    ).toBe(true);
  }, 45_000);

  // ── Case 8: double-verify is idempotent (second fails with already in use) ─
  it("rejects re-verification of the same credential (PDA init collision)", async (ctx) => {
    if (!reachable) ctx.skip();

    const credential = await issueCredentialWith(didEngine, subjectDID);

    // First verify: succeeds.
    const first = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });
    await sendAndConfirmTransaction(conn, first.transaction, [subjectKeypair]);

    // Second verify: must fail with account-already-in-use.
    const second = buildVerifyCredentialTx({
      credential,
      programId: KAGE_PROGRAM_ID,
      payer: subjectKeypair.publicKey,
    });

    let caught: unknown;
    try {
      await sendAndConfirmTransaction(conn, second.transaction, [
        subjectKeypair,
      ]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      errorMatches(caught, "already in use") ||
        errorMatches(caught, "custom program error") ||
        errorMatches(caught, "0x0")
    ).toBe(true);
  }, 45_000);

  // ── Bonus: program-computed digest === SDK-computed digest ──────────────
  it("SDK digest matches what the program expects (implicit in case 1 passing)", (ctx) => {
    if (!reachable) ctx.skip();

    const credentialId = new Uint8Array(32).fill(7);
    const issuer = Keypair.generate().publicKey;
    const subject = Keypair.generate().publicKey;
    const claimHash = new Uint8Array(32).fill(9);

    const payload = buildCredentialSignaturePayload({
      credentialId: Buffer.from(credentialId).toString("hex"),
      issuer: `did:sol:${issuer.toBase58()}`,
      subject: `did:sol:${subject.toBase58()}`,
      claimHash: Buffer.from(claimHash).toString("hex"),
      issuedAt: 1_700_000_000,
      expiresAt: 1_800_000_000,
    });

    expect(payload.length).toBe(144);
    // credential_id (32)
    expect(Buffer.from(payload.slice(0, 32)).equals(Buffer.from(credentialId))).toBe(true);
    // issuer_pubkey (32)
    expect(Buffer.from(payload.slice(32, 64)).equals(issuer.toBuffer())).toBe(true);
    // subject_pubkey (32)
    expect(Buffer.from(payload.slice(64, 96)).equals(subject.toBuffer())).toBe(true);
    // claim_hash (32)
    expect(Buffer.from(payload.slice(96, 128)).equals(Buffer.from(claimHash))).toBe(true);
    // issued_at (LE i64)
    expect(Buffer.from(payload.slice(128, 136)).readBigInt64LE(0)).toBe(
      1_700_000_000n
    );
    expect(Buffer.from(payload.slice(136, 144)).readBigInt64LE(0)).toBe(
      1_800_000_000n
    );

    const digest = hashCredentialPayload(payload);
    expect(digest.length).toBe(32);
  });
});
