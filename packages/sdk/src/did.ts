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
  credentialId: string;
  issuer: string;
  subject: string;
  type: string;
  claim: Record<string, unknown>;
  /** SHA-256 of the claim JSON */
  claimHash: string;
  /** Issuer's Ed25519 signature over claimHash (hex) */
  signature: string;
  /** On-chain commitment tx */
  txSignature?: string;
  explorerUrl?: string;
  issuedAt: number;
  expiresAt?: number;
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
   */
  async issueCredential(params: {
    subjectDID: string;
    type: string;
    claim: Record<string, unknown>;
    expiresInMs?: number;
  }): Promise<KageCredential> {
    const credentialId = `cred-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const issuerDID = this.getSelfDID();
    const claimWithMeta = { ...params.claim, credentialId, type: params.type, issuer: issuerDID };
    const claimJson = JSON.stringify(claimWithMeta);
    const claimHash = createHash("sha256").update(claimJson).digest("hex");

    const claimHashBytes = Buffer.from(claimHash, "hex");
    const seed = this.keypair.secretKey.slice(0, 32);
    const signatureBytes = ed25519.sign(claimHashBytes, seed);
    const signature = Buffer.from(signatureBytes).toString("hex");

    const now = Date.now();
    const credential: KageCredential = {
      credentialId,
      issuer: issuerDID,
      subject: params.subjectDID,
      type: params.type,
      claim: params.claim,
      claimHash,
      signature,
      issuedAt: now,
      expiresAt: params.expiresInMs ? now + params.expiresInMs : undefined,
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
   * Verify a credential: check signature and expiry.
   */
  verifyCredential(credential: KageCredential): {
    valid: boolean;
    reason?: string;
  } {
    // Check expiry
    if (credential.expiresAt && Date.now() > credential.expiresAt) {
      return { valid: false, reason: "Credential expired" };
    }

    // Re-derive expected signature
    const claimWithMeta = {
      ...credential.claim,
      credentialId: credential.credentialId,
      type: credential.type,
      issuer: credential.issuer,
    };
    const claimJson = JSON.stringify(claimWithMeta);
    const expectedHash = createHash("sha256").update(claimJson).digest("hex");
    if (expectedHash !== credential.claimHash) {
      return { valid: false, reason: "Claim hash mismatch — tampered" };
    }

    try {
      const issuerPubkeyBase58 = credential.issuer.replace("did:sol:", "");
      const issuerPubkey = new PublicKey(issuerPubkeyBase58);
      const sigBytes = Buffer.from(credential.signature, "hex");
      const hashBytes = Buffer.from(credential.claimHash, "hex");
      const valid = ed25519.verify(sigBytes, hashBytes, issuerPubkey.toBytes());
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
