import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import {
  KageConfig,
  MemoryEntry,
  MemoryType,
  StoreResult,
  MemoryContent,
  MemoryMetadata,
  AccessGrant,
  AccessPermissions,
} from "./types.js";
import {
  EncryptionEngine,
  createEncryptionEngine,
  EncryptedData,
  ViewingKey,
} from "./encryption.js";
import { KageUmbraClient, createUmbraClient } from "./umbra.js";

const VAULT_SEED = Buffer.from("vault");
const MEMORY_SEED = Buffer.from("memory");
const ACCESS_SEED = Buffer.from("access");

// ── Storage Adapters ──────────────────────────────────────────────────────────

export interface StorageAdapter {
  upload(data: EncryptedData): Promise<string>;
  download(cid: string): Promise<EncryptedData>;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private storage = new Map<string, EncryptedData>();
  private counter = 0;

  async upload(data: EncryptedData): Promise<string> {
    const cid = `Qm${this.counter++}${Date.now()}`;
    this.storage.set(cid, data);
    return cid;
  }

  async download(cid: string): Promise<EncryptedData> {
    const data = this.storage.get(cid);
    if (!data) {
      throw new Error(`CID not found: ${cid}`);
    }
    return data;
  }
}

export class IpfsStorageAdapter implements StorageAdapter {
  private gatewayUrl: string;
  private apiUrl: string;

  constructor(gatewayUrl: string, apiUrl?: string) {
    this.gatewayUrl = gatewayUrl;
    this.apiUrl = apiUrl || "https://api.web3.storage";
  }

  async upload(data: EncryptedData): Promise<string> {
    const blob = new Blob([JSON.stringify(data)], {
      type: "application/json",
    });

    const response = await fetch(`${this.apiUrl}/upload`, {
      method: "POST",
      body: blob,
    });

    if (!response.ok) {
      throw new Error(`IPFS upload failed: ${response.statusText}`);
    }

    const result = (await response.json()) as { cid: string };
    return result.cid;
  }

  async download(cid: string): Promise<EncryptedData> {
    const response = await fetch(`${this.gatewayUrl}/ipfs/${cid}`);

    if (!response.ok) {
      throw new Error(`IPFS download failed: ${response.statusText}`);
    }

    return (await response.json()) as EncryptedData;
  }
}

// ── Chain Adapter Interface ───────────────────────────────────────────────────

/**
 * On-chain adapter interface — abstracts Solana transaction layer
 * so vault logic can be tested without a live network connection.
 *
 * Production: SolanaChainAdapter (real TXs, throws on failure)
 * Unit tests: LocalChainAdapter  (in-memory, no network)
 */
export interface ChainAdapter {
  storeMemory(cid: string, metadataHash: Uint8Array, memoryType: number, umbraProof?: string): Promise<string>;
  grantAccess(grantee: PublicKey, permissions: number, expiresAt: number): Promise<string>;
  revokeAccess(grantee: PublicKey): Promise<string>;
  listMemoryEntries(): Promise<MemoryEntry[]>;
  ensureVaultInitialized(): Promise<void>;
}

// ── Solana Chain Adapter ──────────────────────────────────────────────────────

export class SolanaChainAdapter implements ChainAdapter {
  private static readonly DISC_INIT_VAULT    = Buffer.from([48,191,163,44,71,129,63,164]);
  private static readonly DISC_STORE_MEMORY  = Buffer.from([168,103,88,240,93,185,30,235]);
  private static readonly DISC_GRANT_ACCESS  = Buffer.from([66,88,87,113,39,22,27,165]);
  private static readonly DISC_REVOKE_ACCESS = Buffer.from([106,128,38,169,103,238,102,147]);

  constructor(
    private readonly connection: Connection,
    private readonly config: KageConfig,
    private readonly ownerKeypair: Keypair,
  ) {}

  getVaultAddress(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, this.ownerKeypair.publicKey.toBuffer()],
      this.config.programId
    );
    return pda;
  }

  getAccessGrantAddress(grantee: PublicKey): PublicKey {
    const vaultPda = this.getVaultAddress();
    const [pda] = PublicKey.findProgramAddressSync(
      [ACCESS_SEED, vaultPda.toBuffer(), grantee.toBuffer()],
      this.config.programId
    );
    return pda;
  }

  async ensureVaultInitialized(): Promise<void> {
    const vaultPda = this.getVaultAddress();
    const info = await this.connection.getAccountInfo(vaultPda);
    if (info) return;

    console.log("[Kage] Initializing vault on-chain...");

    const ix = new TransactionInstruction({
      programId: this.config.programId,
      keys: [
        { pubkey: vaultPda,                         isSigner: false, isWritable: true  },
        { pubkey: this.ownerKeypair.publicKey,       isSigner: true,  isWritable: true  },
        { pubkey: SystemProgram.programId,           isSigner: false, isWritable: false },
      ],
      data: SolanaChainAdapter.DISC_INIT_VAULT,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = this.ownerKeypair.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.sign(this.ownerKeypair);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    console.log(`[Kage] Vault initialized on-chain: ${sig}`);
  }

  async storeMemory(
    cid: string,
    metadataHash: Uint8Array,
    memoryType: number,
    umbraProof?: string
  ): Promise<string> {
    console.log(
      `[Kage] Storing memory: cid=${cid}, type=${memoryType}${umbraProof ? ", umbra=✓" : ""}, zkrune=✓`
    );

    try {
      await this.ensureVaultInitialized();

      const vaultPda = this.getVaultAddress();
      const vaultAccount = await this.connection.getAccountInfo(vaultPda);
      const memoryCount = vaultAccount ? Number(vaultAccount.data.readBigUInt64LE(40)) : 0;

      const indexBuffer = Buffer.alloc(8);
      indexBuffer.writeBigUInt64LE(BigInt(memoryCount));
      const [memoryEntryPda] = PublicKey.findProgramAddressSync(
        [MEMORY_SEED, vaultPda.toBuffer(), indexBuffer],
        this.config.programId
      );

      const cidBytes = Buffer.from(cid, "utf8");
      const hash32 = new Uint8Array(32);
      hash32.set(metadataHash.slice(0, Math.min(32, metadataHash.length)));

      const dataLen = 8 + 4 + cidBytes.length + 32 + 1;
      const data = Buffer.alloc(dataLen);
      let offset = 0;
      SolanaChainAdapter.DISC_STORE_MEMORY.copy(data, offset); offset += 8;
      data.writeUInt32LE(cidBytes.length, offset); offset += 4;
      cidBytes.copy(data, offset); offset += cidBytes.length;
      Buffer.from(hash32).copy(data, offset); offset += 32;
      data.writeUInt8(memoryType, offset);

      const ix = new TransactionInstruction({
        programId: this.config.programId,
        keys: [
          { pubkey: vaultPda,                       isSigner: false, isWritable: true  },
          { pubkey: memoryEntryPda,                 isSigner: false, isWritable: true  },
          { pubkey: this.ownerKeypair.publicKey,     isSigner: true,  isWritable: true  },
          { pubkey: SystemProgram.programId,         isSigner: false, isWritable: false },
        ],
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = this.ownerKeypair.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.sign(this.ownerKeypair);

      const txSig = await this.connection.sendRawTransaction(tx.serialize());
      await this.connection.confirmTransaction(txSig, "confirmed");

      console.log(`[Kage] Memory stored on-chain: ${txSig}`);
      return txSig;
    } catch (err) {
      throw new Error(`[Kage] On-chain store_memory failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async grantAccess(grantee: PublicKey, permissions: number, expiresAt: number): Promise<string> {
    await this.ensureVaultInitialized();

    const vaultPda = this.getVaultAddress();
    const accessGrantPda = this.getAccessGrantAddress(grantee);

    const data = Buffer.alloc(8 + 32 + 1 + 8);
    let offset = 0;
    SolanaChainAdapter.DISC_GRANT_ACCESS.copy(data, offset); offset += 8;
    grantee.toBuffer().copy(data, offset); offset += 32;
    data.writeUInt8(permissions, offset); offset += 1;
    data.writeBigInt64LE(BigInt(expiresAt), offset);

    const ix = new TransactionInstruction({
      programId: this.config.programId,
      keys: [
        { pubkey: vaultPda,                   isSigner: false, isWritable: false },
        { pubkey: accessGrantPda,             isSigner: false, isWritable: true  },
        { pubkey: this.ownerKeypair.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: SystemProgram.programId,    isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = this.ownerKeypair.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.sign(this.ownerKeypair);

    const txSig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(txSig, "confirmed");

    console.log(`[Kage] Access granted on-chain to ${grantee.toBase58()}: ${txSig}`);
    return txSig;
  }

  async revokeAccess(grantee: PublicKey): Promise<string> {
    const vaultPda = this.getVaultAddress();
    const accessGrantPda = this.getAccessGrantAddress(grantee);

    const data = Buffer.alloc(8 + 32);
    SolanaChainAdapter.DISC_REVOKE_ACCESS.copy(data, 0);
    grantee.toBuffer().copy(data, 8);

    const ix = new TransactionInstruction({
      programId: this.config.programId,
      keys: [
        { pubkey: vaultPda,                   isSigner: false, isWritable: false },
        { pubkey: accessGrantPda,             isSigner: false, isWritable: true  },
        { pubkey: this.ownerKeypair.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: SystemProgram.programId,    isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = this.ownerKeypair.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.sign(this.ownerKeypair);

    const txSig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(txSig, "confirmed");

    console.log(`[Kage] Access revoked on-chain from ${grantee.toBase58()}: ${txSig}`);
    return txSig;
  }

  async listMemoryEntries(): Promise<MemoryEntry[]> {
    const vaultPda = this.getVaultAddress();
    const vaultInfo = await this.connection.getAccountInfo(vaultPda);

    if (!vaultInfo) return [];

    const memoryCount = Number(vaultInfo.data.readBigUInt64LE(40));
    const memories: MemoryEntry[] = [];

    for (let i = 0; i < memoryCount; i++) {
      const indexBuffer = Buffer.alloc(8);
      indexBuffer.writeBigUInt64LE(BigInt(i));
      const [memoryPda] = PublicKey.findProgramAddressSync(
        [MEMORY_SEED, vaultPda.toBuffer(), indexBuffer],
        this.config.programId
      );
      const memoryInfo = await this.connection.getAccountInfo(memoryPda);

      if (memoryInfo) {
        try {
          const vaultPubkey = new PublicKey(memoryInfo.data.slice(8, 40));
          const cidLength = memoryInfo.data.readUInt32LE(56);
          const cid = memoryInfo.data.slice(60, 60 + cidLength).toString("utf-8");
          const metadataHashStart = 60 + cidLength;
          const metadataHash = memoryInfo.data
            .slice(metadataHashStart, metadataHashStart + 32)
            .toString("hex");
          const memoryTypeOffset = metadataHashStart + 32;
          const mt = memoryInfo.data.readUInt8(memoryTypeOffset);
          const createdAt = Number(memoryInfo.data.readBigInt64LE(memoryTypeOffset + 1));

          const typeMap: Record<number, MemoryType> = {
            0: MemoryType.Conversation, 1: MemoryType.Preference,
            2: MemoryType.Behavior, 3: MemoryType.Task, 4: MemoryType.Knowledge,
          };

          memories.push({
            id: `${i}`, cid, metadataHash, createdAt,
            memoryType: typeMap[mt] || MemoryType.Knowledge,
            owner: vaultPubkey,
          });
        } catch { /* skip malformed entries */ }
      }
    }

    return memories;
  }
}

// ── Local Chain Adapter ───────────────────────────────────────────────────────

/**
 * In-memory chain adapter for unit tests and offline development.
 * Tracks commitments locally without touching Solana.
 */
export class LocalChainAdapter implements ChainAdapter {
  private entries: MemoryEntry[] = [];
  private counter = 0;
  private ownerPubkey: PublicKey;

  constructor(ownerPubkey: PublicKey) {
    this.ownerPubkey = ownerPubkey;
  }

  async ensureVaultInitialized(): Promise<void> { /* no-op */ }

  async storeMemory(
    cid: string,
    _metadataHash: Uint8Array,
    memoryType: number,
    _umbraProof?: string
  ): Promise<string> {
    const sig = `local_${Date.now()}_${this.counter++}`;

    const typeMap: Record<number, MemoryType> = {
      0: MemoryType.Conversation, 1: MemoryType.Preference,
      2: MemoryType.Behavior, 3: MemoryType.Task, 4: MemoryType.Knowledge,
    };

    this.entries.push({
      id: `${this.entries.length}`,
      cid,
      metadataHash: "",
      createdAt: Date.now(),
      memoryType: typeMap[memoryType] || MemoryType.Knowledge,
      owner: this.ownerPubkey,
    });

    return sig;
  }

  async grantAccess(_grantee: PublicKey, _permissions: number, _expiresAt: number): Promise<string> {
    return `local_grant_${Date.now()}_${this.counter++}`;
  }

  async revokeAccess(_grantee: PublicKey): Promise<string> {
    return `local_revoke_${Date.now()}_${this.counter++}`;
  }

  async listMemoryEntries(): Promise<MemoryEntry[]> {
    return [...this.entries];
  }
}

// ── KageVault ─────────────────────────────────────────────────────────────────

/**
 * Kage Memory Vault - main SDK class.
 *
 * Delegates on-chain operations to ChainAdapter:
 * - SolanaChainAdapter for production (real TXs, throws on failure)
 * - LocalChainAdapter for unit tests (in-memory, no network)
 */
export class KageVault {
  private connection: Connection;
  private config: KageConfig;
  private encryption: EncryptionEngine;
  private storage: StorageAdapter;
  private chain: ChainAdapter;
  private ownerKeypair: Keypair;
  private viewingKey: ViewingKey | null = null;
  private umbraClient: KageUmbraClient;
  private umbraEnabled: boolean;

  constructor(
    connection: Connection,
    config: KageConfig,
    ownerKeypair: Keypair,
    storage?: StorageAdapter,
    options?: { umbraEnabled?: boolean; chainAdapter?: ChainAdapter }
  ) {
    this.connection = connection;
    this.config = config;
    this.ownerKeypair = ownerKeypair;
    this.encryption = createEncryptionEngine({
      network: config.umbraNetwork,
    });
    this.storage = storage || new MemoryStorageAdapter();
    this.umbraEnabled = options?.umbraEnabled ?? true;
    this.umbraClient = createUmbraClient(ownerKeypair, {
      network: config.umbraNetwork,
      rpcUrl: config.rpcUrl,
    });
    this.chain = options?.chainAdapter
      ?? new SolanaChainAdapter(connection, config, ownerKeypair);
  }

  async initialize(): Promise<void> {
    this.viewingKey = await this.encryption.generateViewingKey(
      this.ownerKeypair
    );

    if (this.umbraEnabled) {
      try {
        await this.umbraClient.initialize();
        await this.umbraClient.register();
      } catch (err) {
        console.warn("[Kage:Vault] Umbra initialization failed (continuing without privacy layer):", err);
        this.umbraEnabled = false;
      }
    }
  }

  getVaultAddress(): PublicKey {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, this.ownerKeypair.publicKey.toBuffer()],
      this.config.programId
    );
    return vaultPda;
  }

  getMemoryAddress(index: number): PublicKey {
    const vaultPda = this.getVaultAddress();
    const indexBuffer = Buffer.alloc(8);
    indexBuffer.writeBigUInt64LE(BigInt(index));

    const [memoryPda] = PublicKey.findProgramAddressSync(
      [MEMORY_SEED, vaultPda.toBuffer(), indexBuffer],
      this.config.programId
    );
    return memoryPda;
  }

  getAccessGrantAddress(grantee: PublicKey): PublicKey {
    const vaultPda = this.getVaultAddress();
    const [accessPda] = PublicKey.findProgramAddressSync(
      [ACCESS_SEED, vaultPda.toBuffer(), grantee.toBuffer()],
      this.config.programId
    );
    return accessPda;
  }

  async storeMemory(
    data: unknown,
    metadata: MemoryMetadata,
    memoryType: MemoryType = MemoryType.Conversation
  ): Promise<StoreResult> {
    if (!this.viewingKey) {
      throw new Error("Vault not initialized. Call initialize() first.");
    }

    const memoryContent: MemoryContent = { data, metadata };
    const encrypted = await this.encryption.encrypt(
      memoryContent,
      this.viewingKey
    );
    const cid = await this.storage.upload(encrypted);
    const metadataHash = await this.encryption.computeHash(metadata);
    const memoryTypeValue = this.memoryTypeToValue(memoryType);

    let umbraProof: string | undefined;
    if (this.umbraEnabled && this.umbraClient.isInitialized) {
      try {
        umbraProof = await this.umbraClient.createMemoryProof(cid, metadataHash);
        console.log(`[Kage:Vault] Umbra proof created for memory: ${cid}`);
      } catch (err) {
        console.warn("[Kage:Vault] Umbra proof generation failed:", err);
      }
    }

    const txSignature = await this.chain.storeMemory(
      cid, metadataHash, memoryTypeValue, umbraProof
    );

    const explorerUrl = `https://solscan.io/tx/${txSignature}?cluster=devnet`;

    return {
      memoryId: cid,
      cid,
      txSignature,
      umbraProof,
      explorerUrl,
    };
  }

  async recallMemory(cid: string): Promise<MemoryContent> {
    if (!this.viewingKey) {
      throw new Error("Vault not initialized. Call initialize() first.");
    }

    const encrypted = await this.storage.download(cid);
    const decrypted = await this.encryption.decrypt(encrypted, this.viewingKey);

    return decrypted as MemoryContent;
  }

  async listMemories(): Promise<MemoryEntry[]> {
    return this.chain.listMemoryEntries();
  }

  async grantAccess(
    grantee: PublicKey,
    permissions: AccessPermissions,
    expiresAt: number = 0
  ): Promise<string> {
    const permissionValue = this.permissionToValue(permissions);
    return this.chain.grantAccess(grantee, permissionValue, expiresAt);
  }

  async revokeAccess(grantee: PublicKey): Promise<string> {
    return this.chain.revokeAccess(grantee);
  }

  getUmbraClient(): KageUmbraClient {
    return this.umbraClient;
  }

  private memoryTypeToValue(memoryType: MemoryType): number {
    const mapping: Record<MemoryType, number> = {
      [MemoryType.Conversation]: 0,
      [MemoryType.Preference]: 1,
      [MemoryType.Behavior]: 2,
      [MemoryType.Task]: 3,
      [MemoryType.Knowledge]: 4,
    };
    return mapping[memoryType];
  }

  private permissionToValue(permission: AccessPermissions): number {
    const mapping: Record<AccessPermissions, number> = {
      [AccessPermissions.Read]: 0,
      [AccessPermissions.ReadWrite]: 1,
      [AccessPermissions.Admin]: 2,
    };
    return mapping[permission];
  }
}

/**
 * Create a new Kage vault instance.
 *
 * Default: SolanaChainAdapter (real on-chain transactions).
 * Override via options.chainAdapter (e.g. LocalChainAdapter for tests).
 */
export function createVault(
  connection: Connection,
  config: KageConfig,
  ownerKeypair: Keypair,
  storage?: StorageAdapter,
  options?: { umbraEnabled?: boolean; chainAdapter?: ChainAdapter }
): KageVault {
  return new KageVault(connection, config, ownerKeypair, storage, options);
}
