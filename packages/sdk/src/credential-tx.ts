import {
  Ed25519Program,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
// @ts-ignore
import { ed25519 } from "@noble/curves/ed25519.js";
import { createHash } from "crypto";

import {
  KageCredential,
  buildCredentialSignaturePayload,
  hashCredentialPayload,
} from "./did.js";

// ─── On-chain constants ───────────────────────────────────────────────────────
//
// These mirror `programs/kage/src/state.rs` and `programs/kage/src/lib.rs`.
// Any change there MUST be reflected here, and the Anchor tests assert the
// resulting byte layout matches.

const CREDENTIAL_SEED = Buffer.from("credential");
const CREDENTIAL_REVOKE_SEED = Buffer.from("cred_revoke");

/** Anchor discriminator for `verify_credential` (sha256("global:verify_credential")[0..8]). */
const DISC_VERIFY_CREDENTIAL = Buffer.from([
  139, 189, 60, 127, 32, 241, 162, 134,
]);

/** Anchor discriminator for `revoke_credential`. */
const DISC_REVOKE_CREDENTIAL = Buffer.from([
  38, 123, 95, 95, 223, 158, 169, 87,
]);

/**
 * Domain-separated prefix for revocation signatures. MUST match
 * `REVOCATION_DOMAIN_TAG` in `programs/kage/src/instructions/revoke_credential.rs`.
 */
const REVOCATION_DOMAIN_TAG = Buffer.from("kage:revoke:v1");

// ─── PDA helpers ──────────────────────────────────────────────────────────────

export function deriveCredentialVerificationPDA(
  programId: PublicKey,
  issuer: PublicKey,
  credentialId: Uint8Array
): [PublicKey, number] {
  assertCredentialIdLen(credentialId);
  return PublicKey.findProgramAddressSync(
    [CREDENTIAL_SEED, issuer.toBuffer(), Buffer.from(credentialId)],
    programId
  );
}

export function deriveCredentialRevocationPDA(
  programId: PublicKey,
  issuer: PublicKey,
  credentialId: Uint8Array
): [PublicKey, number] {
  assertCredentialIdLen(credentialId);
  return PublicKey.findProgramAddressSync(
    [CREDENTIAL_REVOKE_SEED, issuer.toBuffer(), Buffer.from(credentialId)],
    programId
  );
}

function assertCredentialIdLen(credentialId: Uint8Array): void {
  if (credentialId.length !== 32) {
    throw new Error(
      `credentialId must be 32 bytes, got ${credentialId.length}`
    );
  }
}

function didToPubkey(did: string): PublicKey {
  return new PublicKey(did.replace(/^did:sol:/, ""));
}

// ─── Instruction encoders ─────────────────────────────────────────────────────

/**
 * Encode the `verify_credential` instruction data:
 *   discriminator (8) || credential_id (32) || issuer (32) || subject (32)
 *   || claim_hash (32) || issued_at_le (8) || expires_at_le (8)
 */
function encodeVerifyCredentialData(args: {
  credentialId: Uint8Array;
  issuer: PublicKey;
  subject: PublicKey;
  claimHash: Uint8Array;
  issuedAt: bigint;
  expiresAt: bigint;
}): Buffer {
  const data = Buffer.alloc(8 + 32 + 32 + 32 + 32 + 8 + 8);
  let o = 0;
  DISC_VERIFY_CREDENTIAL.copy(data, o); o += 8;
  Buffer.from(args.credentialId).copy(data, o); o += 32;
  args.issuer.toBuffer().copy(data, o); o += 32;
  args.subject.toBuffer().copy(data, o); o += 32;
  Buffer.from(args.claimHash).copy(data, o); o += 32;
  data.writeBigInt64LE(args.issuedAt, o); o += 8;
  data.writeBigInt64LE(args.expiresAt, o); o += 8;
  return data;
}

/**
 * Encode the `revoke_credential` instruction data:
 *   discriminator (8) || credential_id (32) || issuer (32)
 */
function encodeRevokeCredentialData(args: {
  credentialId: Uint8Array;
  issuer: PublicKey;
}): Buffer {
  const data = Buffer.alloc(8 + 32 + 32);
  let o = 0;
  DISC_REVOKE_CREDENTIAL.copy(data, o); o += 8;
  Buffer.from(args.credentialId).copy(data, o); o += 32;
  args.issuer.toBuffer().copy(data, o); o += 32;
  return data;
}

// ─── Revocation digest ────────────────────────────────────────────────────────

/**
 * SHA-256 digest of the canonical revocation preimage:
 *   b"kage:revoke:v1" (14) || issuer (32) || credential_id (32)
 *
 * This is the 32-byte message the issuer signs with Ed25519 off-chain, and
 * the byte layout the on-chain `revoke_credential` instruction reconstructs.
 */
export function hashRevocationIntent(
  issuer: PublicKey,
  credentialId: Uint8Array
): Uint8Array {
  assertCredentialIdLen(credentialId);
  const preimage = Buffer.concat([
    REVOCATION_DOMAIN_TAG,
    issuer.toBuffer(),
    Buffer.from(credentialId),
  ]);
  return new Uint8Array(createHash("sha256").update(preimage).digest());
}

// ─── Transaction builders ─────────────────────────────────────────────────────

export interface BuildVerifyCredentialTxParams {
  credential: KageCredential;
  programId: PublicKey;
  /** Fee payer and PDA rent payer — may be anyone (subject, relayer, etc.). */
  payer: PublicKey;
}

export interface BuildVerifyCredentialTxResult {
  transaction: Transaction;
  verificationPda: PublicKey;
  /** 32-byte credential digest (the message signed by the issuer). */
  digest: Uint8Array;
}

/**
 * Build a Transaction that verifies a credential on-chain. The returned tx
 * contains two instructions in order:
 *
 *   [0] Ed25519 precompile — verifies the issuer's signature over the
 *       32-byte canonical credential digest.
 *   [1] kage::verify_credential — binds the precompile to credential
 *       semantics and initialises the CredentialVerification PDA.
 *
 * The caller is responsible for setting `feePayer`, `recentBlockhash`, and
 * signing with the `payer` keypair. The issuer does NOT need to sign the
 * transaction — its authenticity comes from the pre-existing Ed25519
 * signature stored on `credential.signature`.
 */
export function buildVerifyCredentialTx(
  params: BuildVerifyCredentialTxParams
): BuildVerifyCredentialTxResult {
  const { credential, programId, payer } = params;

  const credentialIdBytes = Buffer.from(credential.credentialId, "hex");
  if (credentialIdBytes.length !== 32) {
    throw new Error(
      `credential.credentialId must be 32 bytes hex (64 chars), got ${credentialIdBytes.length} bytes`
    );
  }
  const claimHashBytes = Buffer.from(credential.claimHash, "hex");
  if (claimHashBytes.length !== 32) {
    throw new Error(
      `credential.claimHash must be 32 bytes hex (64 chars), got ${claimHashBytes.length} bytes`
    );
  }
  const signatureBytes = Buffer.from(credential.signature, "hex");
  if (signatureBytes.length !== 64) {
    throw new Error(
      `credential.signature must be 64 bytes hex (128 chars), got ${signatureBytes.length} bytes`
    );
  }

  const issuer = didToPubkey(credential.issuer);
  const subject = didToPubkey(credential.subject);

  // Reconstruct the canonical payload + digest. This MUST match exactly
  // what the on-chain verify_credential handler rebuilds — otherwise the
  // precompile's signed message won't equal the program's computed digest
  // and the tx will fail at the program level (not the precompile).
  const payload = buildCredentialSignaturePayload({
    credentialId: credential.credentialId,
    issuer: credential.issuer,
    subject: credential.subject,
    claimHash: credential.claimHash,
    issuedAt: credential.issuedAt,
    expiresAt: credential.expiresAt,
  });
  const digest = hashCredentialPayload(payload);

  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: issuer.toBytes(),
    message: digest,
    signature: signatureBytes,
  });

  const [verificationPda] = deriveCredentialVerificationPDA(
    programId,
    issuer,
    credentialIdBytes
  );

  const data = encodeVerifyCredentialData({
    credentialId: credentialIdBytes,
    issuer,
    subject,
    claimHash: claimHashBytes,
    issuedAt: BigInt(credential.issuedAt),
    expiresAt: BigInt(credential.expiresAt ?? 0),
  });

  const verifyIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer,                      isSigner: true,  isWritable: true  },
      { pubkey: verificationPda,            isSigner: false, isWritable: true  },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,    isSigner: false, isWritable: false },
    ],
    data,
  });

  const transaction = new Transaction().add(ed25519Ix, verifyIx);
  return { transaction, verificationPda, digest };
}

export interface BuildRevokeCredentialTxParams {
  /** Must hold the issuer's keypair — signing is done off-chain via Ed25519. */
  issuerKeypair: Keypair;
  credentialId: Uint8Array;
  programId: PublicKey;
  /** Tx fee + PDA rent payer. May be the issuer itself or a relayer. */
  payer: PublicKey;
}

export interface BuildRevokeCredentialTxResult {
  transaction: Transaction;
  revocationPda: PublicKey;
  /** 32-byte revocation digest (the message signed by the issuer). */
  digest: Uint8Array;
}

/**
 * Build a Transaction that revokes a credential on-chain. The returned tx
 * contains two instructions in order:
 *
 *   [0] Ed25519 precompile — verifies the issuer's signature over the
 *       domain-separated revocation digest.
 *   [1] kage::revoke_credential — binds the precompile to revocation
 *       semantics and initialises the CredentialRevocation PDA.
 *
 * The issuer's Ed25519 secret is used here to sign the 32-byte revocation
 * digest off-chain; it is NOT added as a tx signer. Only `payer` needs to
 * sign the tx (typically the issuer, but relayers are supported).
 */
export function buildRevokeCredentialTx(
  params: BuildRevokeCredentialTxParams
): BuildRevokeCredentialTxResult {
  const { issuerKeypair, credentialId, programId, payer } = params;
  assertCredentialIdLen(credentialId);

  const issuer = issuerKeypair.publicKey;
  const digest = hashRevocationIntent(issuer, credentialId);

  // Sign the digest with the issuer's Ed25519 seed (first 32 bytes of
  // Solana secretKey — same convention used by DIDEngine.issueCredential).
  const seed = issuerKeypair.secretKey.slice(0, 32);
  const signatureBytes = ed25519.sign(digest, seed);

  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: issuer.toBytes(),
    message: digest,
    signature: signatureBytes,
  });

  const [revocationPda] = deriveCredentialRevocationPDA(
    programId,
    issuer,
    credentialId
  );

  const data = encodeRevokeCredentialData({
    credentialId,
    issuer,
  });

  const revokeIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer,                      isSigner: true,  isWritable: true  },
      { pubkey: revocationPda,              isSigner: false, isWritable: true  },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,    isSigner: false, isWritable: false },
    ],
    data,
  });

  const transaction = new Transaction().add(ed25519Ix, revokeIx);
  return { transaction, revocationPda, digest };
}
