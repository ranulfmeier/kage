import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
// @ts-ignore
import { ed25519, x25519 } from "@noble/curves/ed25519.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * W3C-compatible DID Document for a Kage agent.
 * Method: did:sol:<base58-solana-pubkey>
 */
export interface KageDIDDocument {
  "@context": string[];
  id: string;
  controller: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  keyAgreement: string[];
  service: ServiceEndpoint[];
  created: string;
  updated: string;
  /** Kage-specific metadata */
  kage: {
    agentType: string;
    capabilities: string[];
    x25519ViewingPub: string;
    reasoningEnabled: boolean;
    network: string;
  };
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyBase58?: string;
  publicKeyMultibase?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
  description?: string;
}

export interface KageCredential {
  /** 64-char hex (32 random bytes) */
  credentialId: string;
  issuer: string;
  subject: string;
  type: string;
  claim: Record<string, unknown>;
  /** SHA-256 of the canonical (sorted-keys) claim JSON — 64 hex chars */
  claimHash: string;
  /**
   * Issuer's Ed25519 signature (128 hex chars) over the 32-byte digest of
   * the canonical credential envelope. See buildCredentialSignaturePayload.
   */
  signature: string;
  /** On-chain commitment tx */
  txSignature?: string;
  explorerUrl?: string;
  /** Unix timestamp, seconds */
  issuedAt: number;
  /** Unix timestamp, seconds. Undefined = no expiry. */
  expiresAt?: number;
}

// ─── Canonical signature payload ──────────────────────────────────────────────
//
// All credentials are signed over a fixed-size 144-byte envelope, hashed down
// to 32 bytes. Both the SDK and the on-chain verify_credential instruction
// reconstruct the same bytes from the credential fields and compare digests.
//
// Layout (little-endian integers):
//   [  0 .. 32)  credential_id      (32 random bytes)
//   [ 32 .. 64)  issuer_pubkey      (Solana Ed25519 pubkey, 32 bytes)
//   [ 64 .. 96)  subject_pubkey     (Solana Ed25519 pubkey, 32 bytes)
//   [ 96 ..128)  claim_hash         (sha256 of sorted-keys claim JSON)
//   [128 ..136)  issued_at_sec      (i64 LE, unix seconds)
//   [136 ..144)  expires_at_sec     (i64 LE, unix seconds; 0 = no expiry)

export const CREDENTIAL_PAYLOAD_LEN = 144;

/** Deterministic JSON canonicalization: sorted keys, no whitespace. */
function canonicalJSON(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalJSON: non-finite number not supported");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalJSON(v)).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k]))
        .join(",") +
      "}"
    );
  }
  throw new Error(`canonicalJSON: unsupported type ${typeof value}`);
}

function sha256Bytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

/** SHA-256 of the canonical (sorted-keys) JSON encoding of the claim. */
export function hashClaim(claim: Record<string, unknown>): Uint8Array {
  return sha256Bytes(Buffer.from(canonicalJSON(claim), "utf-8"));
}

function didToPubkeyBytes(did: string): Uint8Array {
  const base58 = did.replace(/^did:sol:/, "");
  return new PublicKey(base58).toBytes();
}

function i64LE(n: number): Uint8Array {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(n));
  return new Uint8Array(buf);
}

/**
 * Build the fixed-size 144-byte signature envelope for a credential.
 * The same bytes are reconstructed on-chain by verify_credential.
 */
export function buildCredentialSignaturePayload(c: {
  credentialId: string;
  issuer: string;
  subject: string;
  claimHash: string;
  issuedAt: number;
  expiresAt?: number;
}): Uint8Array {
  const out = new Uint8Array(CREDENTIAL_PAYLOAD_LEN);
  const credIdBytes = Buffer.from(c.credentialId, "hex");
  if (credIdBytes.length !== 32) {
    throw new Error(
      `credentialId must be 32 bytes (64 hex chars), got ${credIdBytes.length}`
    );
  }
  const claimHashBytes = Buffer.from(c.claimHash, "hex");
  if (claimHashBytes.length !== 32) {
    throw new Error(
      `claimHash must be 32 bytes (64 hex chars), got ${claimHashBytes.length}`
    );
  }
  out.set(credIdBytes, 0);
  out.set(didToPubkeyBytes(c.issuer), 32);
  out.set(didToPubkeyBytes(c.subject), 64);
  out.set(claimHashBytes, 96);
  out.set(i64LE(c.issuedAt), 128);
  out.set(i64LE(c.expiresAt ?? 0), 136);
  return out;
}

/** SHA-256 of the canonical credential payload — the 32-byte message signed by the issuer. */
export function hashCredentialPayload(payload: Uint8Array): Uint8Array {
  return sha256Bytes(payload);
}

export interface DIDResolution {
  did: string;
  document: KageDIDDocument;
  resolvedAt: number;
}

// ─── DIDEngine ────────────────────────────────────────────────────────────────

export class DIDEngine {
  private connection: Connection;
  private keypair!: Keypair;
  private network: string;

  /** Local store: did → document */
  private didStore = new Map<string, KageDIDDocument>();
  /** Local store: credentialId → credential */
  private credentialStore = new Map<string, KageCredential>();

  constructor(config: { rpcUrl: string; network?: string }) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.network = config.network || "devnet";
  }

  initialize(keypair: Keypair): void {
    this.keypair = keypair;
    console.log(`[KageDID] Engine initialized for ${keypair.publicKey.toBase58()}`);
  }

  // ── DID ──────────────────────────────────────────────────────────────────

  /** Returns the canonical DID for this agent: did:sol:<pubkey> */
  getSelfDID(): string {
    return `did:sol:${this.keypair.publicKey.toBase58()}`;
  }

  /**
   * Create and publish the DID Document for this agent.
   * The document is committed to Solana via Memo program.
   */
  async createDIDDocument(options?: {
    agentType?: string;
    capabilities?: string[];
    serviceEndpoint?: string;
    x25519ViewingPub?: string;
    reasoningEnabled?: boolean;
  }): Promise<{ document: KageDIDDocument; txSignature?: string; explorerUrl?: string }> {
    const did = this.getSelfDID();
    const pubBase58 = this.keypair.publicKey.toBase58();
    const now = new Date().toISOString();

    // Derive X25519 viewing pub from keypair seed if not provided
    const seed = this.keypair.secretKey.slice(0, 32);
    const x25519Pub = options?.x25519ViewingPub
      ?? Buffer.from(x25519.getPublicKey(seed)).toString("base64");

    const document: KageDIDDocument = {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1",
        "https://kage.onl/context/v1",
      ],
      id: did,
      controller: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: "Ed25519VerificationKey2020",
          controller: did,
          publicKeyBase58: pubBase58,
        },
        {
          id: `${did}#x25519-1`,
          type: "X25519KeyAgreementKey2020",
          controller: did,
          publicKeyMultibase: `u${x25519Pub}`,
        },
      ],
      authentication: [`${did}#key-1`],
      keyAgreement: [`${did}#x25519-1`],
      service: options?.serviceEndpoint
        ? [
            {
              id: `${did}#kage-api`,
              type: "KageAgentEndpoint",
              serviceEndpoint: options.serviceEndpoint,
              description: "Kage privacy-preserving AI agent endpoint",
            },
          ]
        : [],
      created: now,
      updated: now,
      kage: {
        agentType: options?.agentType ?? "general",
        capabilities: options?.capabilities ?? ["memory", "reasoning", "messaging"],
        x25519ViewingPub: x25519Pub,
        reasoningEnabled: options?.reasoningEnabled ?? true,
        network: this.network,
      },
    };

    // Commit document hash on-chain
    let txSignature: string | undefined;
    let explorerUrl: string | undefined;
    try {
      const docHash = createHash("sha256")
        .update(JSON.stringify(document))
        .digest("hex");
      const memo = `kage:did:create:${did}:${docHash.slice(0, 16)}`;
      txSignature = await this.writeMemoProgramTx(memo);
      explorerUrl = txSignature
        ? `https://solscan.io/tx/${txSignature}?cluster=${this.network}`
        : undefined;
      console.log(`[KageDID] DID Document committed: ${txSignature}`);
    } catch (err) {
      console.warn(`[KageDID] On-chain commit failed: ${(err as Error).message}`);
    }

    this.didStore.set(did, document);
    return { document, txSignature, explorerUrl };
  }

  /**
   * Resolve a DID to its document.
   * For self: returns from local store or auto-creates.
   * For others: returns from local store (simulate peer resolution).
   */
  async resolveDID(did: string): Promise<DIDResolution | null> {
    const selfDid = this.getSelfDID();

    if (did === selfDid && !this.didStore.has(did)) {
      const { document } = await this.createDIDDocument();
      this.didStore.set(did, document);
    }

    const document = this.didStore.get(did);
    if (!document) return null;

    return { did, document, resolvedAt: Date.now() };
  }

  /**
   * Register a peer's DID document locally (simulates DID resolution network).
   */
  registerPeerDID(document: KageDIDDocument): void {
    this.didStore.set(document.id, document);
    console.log(`[KageDID] Peer DID registered: ${document.id}`);
  }

  // ── Credentials ──────────────────────────────────────────────────────────

  /**
   * Issue a Verifiable Credential to a subject agent.
   * The issuer is this agent (self-signed for now).
   *
   * Common types: "AgentCapability", "TradingPermission", "AuditClearance"
   *
   * The credential is signed with Ed25519 over a 32-byte digest of the
   * canonical 144-byte envelope (credential_id ‖ issuer ‖ subject ‖ claim_hash
   * ‖ issued_at ‖ expires_at). The same bytes are reconstructed on-chain by
   * the verify_credential instruction.
   */
  async issueCredential(params: {
    subjectDID: string;
    type: string;
    claim: Record<string, unknown>;
    /** Lifetime in seconds from now. Undefined = no expiry. Negative = already expired (for testing). */
    expiresInSec?: number;
  }): Promise<KageCredential> {
    const credentialIdBytes = randomBytes(32);
    const credentialId = credentialIdBytes.toString("hex");
    const issuerDID = this.getSelfDID();

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt =
      params.expiresInSec !== undefined
        ? issuedAt + params.expiresInSec
        : undefined;

    const claimHashBytes = hashClaim(params.claim);
    const claimHash = Buffer.from(claimHashBytes).toString("hex");

    const payload = buildCredentialSignaturePayload({
      credentialId,
      issuer: issuerDID,
      subject: params.subjectDID,
      claimHash,
      issuedAt,
      expiresAt,
    });
    const digest = hashCredentialPayload(payload);

    const seed = this.keypair.secretKey.slice(0, 32);
    const signatureBytes = ed25519.sign(digest, seed);
    const signature = Buffer.from(signatureBytes).toString("hex");

    const credential: KageCredential = {
      credentialId,
      issuer: issuerDID,
      subject: params.subjectDID,
      type: params.type,
      claim: params.claim,
      claimHash,
      signature,
      issuedAt,
      expiresAt,
    };

    // Commit credential hash on-chain
    try {
      const memo = `kage:did:vc:${credentialId}:${claimHash.slice(0, 16)}`;
      const txSignature = await this.writeMemoProgramTx(memo);
      credential.txSignature = txSignature;
      credential.explorerUrl = txSignature
        ? `https://solscan.io/tx/${txSignature}?cluster=${this.network}`
        : undefined;
      console.log(`[KageDID] Credential issued & committed: ${credentialId}`);
    } catch (err) {
      console.warn(`[KageDID] Credential on-chain commit failed: ${(err as Error).message}`);
    }

    this.credentialStore.set(credentialId, credential);
    return credential;
  }

  /**
   * Verify a credential:
   *   1. Re-hash the claim and check it matches `credential.claimHash`.
   *   2. Check expiration (seconds-based).
   *   3. Reconstruct the 144-byte canonical payload, digest it, and
   *      verify the issuer's Ed25519 signature over the digest.
   *
   * Subject tampering and expiration tampering are both rejected because
   * those fields are now bound into the signed payload.
   */
  verifyCredential(credential: KageCredential): {
    valid: boolean;
    reason?: string;
  } {
    const expectedClaimHash = Buffer.from(hashClaim(credential.claim)).toString(
      "hex"
    );
    if (expectedClaimHash !== credential.claimHash) {
      return { valid: false, reason: "Claim hash mismatch — claim tampered" };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (credential.expiresAt !== undefined && nowSec > credential.expiresAt) {
      return { valid: false, reason: "Credential expired" };
    }

    let digest: Uint8Array;
    try {
      const payload = buildCredentialSignaturePayload({
        credentialId: credential.credentialId,
        issuer: credential.issuer,
        subject: credential.subject,
        claimHash: credential.claimHash,
        issuedAt: credential.issuedAt,
        expiresAt: credential.expiresAt,
      });
      digest = hashCredentialPayload(payload);
    } catch (err) {
      return {
        valid: false,
        reason: `Payload build error: ${(err as Error).message}`,
      };
    }

    try {
      const issuerPubkeyBase58 = credential.issuer.replace(/^did:sol:/, "");
      const issuerPubkey = new PublicKey(issuerPubkeyBase58);
      const sigBytes = Buffer.from(credential.signature, "hex");
      const valid = ed25519.verify(sigBytes, digest, issuerPubkey.toBytes());
      if (!valid) {
        return { valid: false, reason: "Ed25519 signature verification failed" };
      }
    } catch {
      return { valid: false, reason: "Signature verification error" };
    }

    return { valid: true };
  }

  /** Get all credentials issued by or to this agent */
  getCredentials(): KageCredential[] {
    const selfDID = this.getSelfDID();
    return Array.from(this.credentialStore.values()).filter(
      (c) => c.issuer === selfDID || c.subject === selfDID
    );
  }

  getCredential(credentialId: string): KageCredential | undefined {
    return this.credentialStore.get(credentialId);
  }

  /** Get the local DID document for self */
  getSelfDocument(): KageDIDDocument | undefined {
    return this.didStore.get(this.getSelfDID());
  }

  getAllKnownDIDs(): KageDIDDocument[] {
    return Array.from(this.didStore.values());
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async writeMemoProgramTx(memo: string): Promise<string> {
    const tx = new Transaction().add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo, "utf-8"),
      })
    );
    tx.feePayer = this.keypair.publicKey;
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.sign(this.keypair);
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}
