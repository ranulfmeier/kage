import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";
// @ts-ignore
import { x25519 } from "@noble/curves/ed25519.js";

// ─── GF(256) Arithmetic for Shamir's Secret Sharing ─────────────────────────
// Polynomial: x^8 + x^4 + x^3 + x^2 + 1  (0x11d) — generator = 2
// 0x11b (AES) has order-51 element at 2; 0x11d is the standard SSS choice.

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x >= 256) x ^= 0x11d;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function gfDiv(a: number, b: number): number {
  if (a === 0) return 0;
  if (b === 0) throw new Error("GF division by zero");
  return GF_EXP[(GF_LOG[a] - GF_LOG[b] + 255) % 255];
}

// In GF(2^8), subtraction = addition = XOR (characteristic 2)
function gfSub(a: number, b: number): number {
  return a ^ b;
}

// ─── Shamir's Secret Sharing ──────────────────────────────────────────────────

/**
 * Split a secret into `n` shares where any `m` shares can reconstruct it.
 * Each share: Buffer[0] = x-coordinate (1-based), Buffer[1..] = evaluations.
 */
function shamirSplit(secret: Buffer, n: number, m: number): Buffer[] {
  if (m > n) throw new Error(`Threshold m (${m}) cannot exceed total shares n (${n})`);
  if (n > 254) throw new Error("Max 254 shares");

  const shares = Array.from({ length: n }, (_, i) => {
    const s = Buffer.alloc(1 + secret.length);
    s[0] = i + 1; // x = 1..n
    return s;
  });

  for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
    // Random polynomial of degree m-1 with f(0) = secret[byteIdx]
    const coeffs = new Uint8Array(m);
    coeffs[0] = secret[byteIdx];
    for (let k = 1; k < m; k++) {
      coeffs[k] = randomBytes(1)[0];
    }

    for (let i = 0; i < n; i++) {
      const xVal = i + 1;
      let y = 0;
      let xPow = 1;
      for (let k = 0; k < m; k++) {
        y ^= gfMul(coeffs[k], xPow);
        xPow = gfMul(xPow, xVal);
      }
      shares[i][1 + byteIdx] = y;
    }
  }

  return shares;
}

/**
 * Reconstruct a secret from `m` (or more) shares via Lagrange interpolation.
 * Shares must have the same x-coordinate format as produced by shamirSplit.
 */
function shamirCombine(shares: Buffer[]): Buffer {
  const m = shares.length;
  const secretLen = shares[0].length - 1;
  const secret = Buffer.alloc(secretLen);
  const xs = shares.map((s) => s[0]);

  for (let byteIdx = 0; byteIdx < secretLen; byteIdx++) {
    const ys = shares.map((s) => s[1 + byteIdx]);

    // Lagrange interpolation at x=0 over GF(256)
    // f(0) = Σ_i [ y_i * Π_{j≠i} x_j / (x_i - x_j) ]
    // In GF(2^8): subtraction = XOR, so x_i - x_j = gfSub(x_i, x_j)
    let result = 0;
    for (let i = 0; i < m; i++) {
      let basis = ys[i];
      for (let j = 0; j < m; j++) {
        if (i !== j) {
          basis = gfMul(basis, xs[j]);
          basis = gfDiv(basis, gfSub(xs[i], xs[j]));
        }
      }
      result ^= basis;
    }
    secret[byteIdx] = result;
  }

  return secret;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupMember {
  /** Solana (Ed25519) public key */
  solanaPubkey: string;
  /** X25519 public key (base64) — used to encrypt their share */
  x25519Pubkey: string;
}

export interface EncryptedShare {
  /** Share index (1-based x-coordinate) */
  index: number;
  /** AES-256-GCM encrypted share blob */
  ciphertext: string;
  /** Recipient's Solana pubkey */
  memberPubkey: string;
}

export interface GroupVaultGroup {
  groupId: string;
  /** Creator's Solana pubkey */
  creator: string;
  /** Creator's X25519 pubkey (base64) — members need this to decrypt their share */
  creatorX25519Pub: string;
  members: GroupMember[];
  /** m-of-n threshold */
  threshold: number;
  /** Each member's encrypted share */
  encryptedShares: EncryptedShare[];
  /** On-chain commitment */
  txSignature?: string;
  explorerUrl?: string;
  createdAt: number;
}

export interface GroupVaultEntry {
  entryId: string;
  /** AES-256-GCM content encrypted with groupKey */
  encryptedContent: string;
  /** SHA-256 of plaintext — verifiable without decrypting */
  contentHash: string;
  addedBy: string;
  addedAt: number;
}

export interface GroupVaultStore {
  group: GroupVaultGroup;
  entries: GroupVaultEntry[];
}

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ─── GroupVaultEngine ─────────────────────────────────────────────────────────

export class GroupVaultEngine {
  private connection: Connection;
  private agentKeypair: Keypair;

  /** This agent's X25519 public key (base64) */
  readonly x25519PublicKey: string;

  /** In-memory store: groupId → { store, reconstructedKey } */
  private vaults = new Map<string, { store: GroupVaultStore; groupKey?: Buffer }>();

  constructor(connection: Connection, agentKeypair: Keypair) {
    this.connection = connection;
    this.agentKeypair = agentKeypair;

    const seed = agentKeypair.secretKey.slice(0, 32);
    const pub: Uint8Array = x25519.getPublicKey(seed);
    this.x25519PublicKey = Buffer.from(pub).toString("base64");
  }

  /**
   * Create a new group vault.
   *
   * - Generates a random groupKey
   * - Splits it into n shares using Shamir m-of-n
   * - Encrypts each share with the corresponding member's X25519 pubkey
   * - Commits group hash on-chain
   */
  async createGroup(
    members: GroupMember[],
    threshold: number
  ): Promise<GroupVaultGroup> {
    const n = members.length;
    if (threshold < 1 || threshold > n) {
      throw new Error(`Threshold must be between 1 and ${n}`);
    }

    const groupId = `grp-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const groupKey = randomBytes(32);

    // Split groupKey into n shares, any threshold can reconstruct
    const shares = shamirSplit(groupKey, n, threshold);

    // Encrypt each share with the member's X25519 pubkey.
    // AAD = "groupId:memberPubkey" — prevents a share intended for member A
    // being passed off as member B's share (ciphertext-swapping attack).
    const encryptedShares: EncryptedShare[] = members.map((member, idx) => {
      const memberX25519Pub = Buffer.from(member.x25519Pubkey, "base64");
      const sharedSecret = this.deriveSharedSecret(memberX25519Pub);
      const aad = `${groupId}:${member.solanaPubkey}`;
      return {
        index: idx + 1,
        ciphertext: this.encryptBytes(shares[idx], sharedSecret, aad),
        memberPubkey: member.solanaPubkey,
      };
    });

    // Commit group on-chain
    let txSignature: string | undefined;
    let explorerUrl: string | undefined;
    try {
      const memberHash = createHash("sha256")
        .update(members.map((m) => m.solanaPubkey).join(","))
        .digest("hex");
      const memo = `kage:group:${groupId}:${threshold}of${n}:${memberHash.slice(0, 8)}`;
      txSignature = await this.writeMemoProgramTx(memo);
      explorerUrl = `https://solscan.io/tx/${txSignature}?cluster=devnet`;
      console.log(`[Kage:GroupVault] Group committed on-chain: ${txSignature}`);
    } catch (err) {
      console.warn(`[Kage:GroupVault] On-chain commit skipped: ${(err as Error).message.slice(0, 60)}`);
    }

    const group: GroupVaultGroup = {
      groupId,
      creator: this.agentKeypair.publicKey.toBase58(),
      creatorX25519Pub: this.x25519PublicKey,
      members,
      threshold,
      encryptedShares,
      txSignature,
      explorerUrl,
      createdAt: Date.now(),
    };

    // Creator has the key directly (they generated it)
    this.vaults.set(groupId, { store: { group, entries: [] }, groupKey });

    console.log(`[Kage:GroupVault] Created group ${groupId} (${threshold}-of-${n})`);
    return group;
  }

  /**
   * Load a group received from another agent.
   * Key not yet available — must call reconstructKey() first.
   */
  loadGroup(group: GroupVaultGroup): void {
    if (!this.vaults.has(group.groupId)) {
      this.vaults.set(group.groupId, { store: { group, entries: [] } });
    }
  }

  /**
   * Decrypt this agent's share from a group, returning the raw share bytes.
   * Used to contribute to key reconstruction.
   */
  decryptOwnShare(group: GroupVaultGroup): Buffer {
    const myPubkey = this.agentKeypair.publicKey.toBase58();
    const encShare = group.encryptedShares.find((s) => s.memberPubkey === myPubkey);
    if (!encShare) throw new Error("This agent is not a member of the group");

    const creatorX25519Pub = Buffer.from(group.creatorX25519Pub, "base64");
    const sharedSecret = this.deriveSharedSecret(creatorX25519Pub);
    return this.decryptBytes(encShare.ciphertext, sharedSecret);
  }

  /**
   * Reconstruct the group key from `threshold` raw shares.
   * Call decryptOwnShare() on each member's engine, collect results, pass here.
   */
  reconstructKey(groupId: string, rawShares: Buffer[]): void {
    const vault = this.vaults.get(groupId);
    if (!vault) throw new Error(`Group not found: ${groupId}`);

    const groupKey = shamirCombine(rawShares);
    vault.groupKey = groupKey;
    console.log(`[Kage:GroupVault] Key reconstructed for ${groupId}`);
  }

  /**
   * Store encrypted content in the group vault.
   * Requires groupKey to be available (creator or post-reconstruction).
   */
  storeEntry(groupId: string, content: unknown): GroupVaultEntry {
    const vault = this.vaults.get(groupId);
    if (!vault) throw new Error(`Group not found: ${groupId}`);
    if (!vault.groupKey) throw new Error("Group key not available — reconstruct first");

    const plaintext = JSON.stringify(content);
    const entryId = `entry-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const contentHash = createHash("sha256").update(plaintext).digest("hex");
    // AAD = "groupId:entryId" — ties ciphertext to this specific entry slot
    const encryptedContent = this.encryptString(plaintext, vault.groupKey, `${groupId}:${entryId}`);

    const entry: GroupVaultEntry = {
      entryId,
      encryptedContent,
      contentHash,
      addedBy: this.agentKeypair.publicKey.toBase58(),
      addedAt: Date.now(),
    };

    vault.store.entries.push(entry);
    console.log(`[Kage:GroupVault] Entry stored: ${entryId} in ${groupId}`);
    return entry;
  }

  /**
   * Read and decrypt a vault entry.
   * Requires groupKey to be available.
   */
  readEntry(groupId: string, entryId: string): unknown {
    const vault = this.vaults.get(groupId);
    if (!vault) throw new Error(`Group not found: ${groupId}`);
    if (!vault.groupKey) throw new Error("Group key not available — reconstruct first");

    const entry = vault.store.entries.find((e) => e.entryId === entryId);
    if (!entry) throw new Error(`Entry not found: ${entryId}`);

    const plaintext = this.decryptString(entry.encryptedContent, vault.groupKey);
    return JSON.parse(plaintext);
  }

  /**
   * Read all entries in a group vault.
   */
  readAllEntries(groupId: string): unknown[] {
    const vault = this.vaults.get(groupId);
    if (!vault) throw new Error(`Group not found: ${groupId}`);
    if (!vault.groupKey) throw new Error("Group key not available — reconstruct first");

    return vault.store.entries.map((entry) => {
      const plaintext = this.decryptString(entry.encryptedContent, vault.groupKey!);
      return { entryId: entry.entryId, addedBy: entry.addedBy, addedAt: entry.addedAt, content: JSON.parse(plaintext) };
    });
  }

  listGroups(): GroupVaultStore[] {
    return Array.from(this.vaults.values()).map((v) => v.store);
  }

  getGroup(groupId: string): GroupVaultStore | undefined {
    return this.vaults.get(groupId)?.store;
  }

  hasKey(groupId: string): boolean {
    return !!(this.vaults.get(groupId)?.groupKey);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private deriveSharedSecret(otherX25519Pub: Uint8Array): Buffer {
    const mySeed = this.agentKeypair.secretKey.slice(0, 32);
    const dhOutput: Uint8Array = x25519.getSharedSecret(mySeed, otherX25519Pub);
    return createHash("sha256").update(dhOutput).digest();
  }

  /**
   * Encrypt bytes with AES-256-GCM.
   * @param aad Additional Authenticated Data — binds ciphertext to its context
   *            (e.g. "groupId:memberId") to prevent ciphertext-swapping attacks.
   */
  private encryptBytes(data: Buffer, key: Buffer, aad?: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString("base64"),
      data: enc.toString("base64"),
      tag: tag.toString("base64"),
      ...(aad ? { aad } : {}),
    });
  }

  private decryptBytes(ciphertext: string, key: Buffer): Buffer {
    const { iv, data, tag, aad } = JSON.parse(ciphertext);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  }

  private encryptString(plaintext: string, key: Buffer, aad?: string): string {
    return this.encryptBytes(Buffer.from(plaintext, "utf8"), key, aad);
  }

  private decryptString(ciphertext: string, key: Buffer): string {
    return this.decryptBytes(ciphertext, key).toString("utf8");
  }

  private async writeMemoProgramTx(memo: string): Promise<string> {
    const ix = new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: this.agentKeypair.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(memo, "utf8"),
    });
    const tx = new Transaction().add(ix);
    tx.feePayer = this.agentKeypair.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.sign(this.agentKeypair);
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export { shamirSplit, shamirCombine };

export function createGroupVaultEngine(
  connection: Connection,
  agentKeypair: Keypair
): GroupVaultEngine {
  return new GroupVaultEngine(connection, agentKeypair);
}
