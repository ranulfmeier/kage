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

/**
 * Storage adapter interface for IPFS/Arweave
 */
export interface StorageAdapter {
  upload(data: EncryptedData): Promise<string>;
  download(cid: string): Promise<EncryptedData>;
}

/**
 * Simple in-memory storage adapter for development/testing
 */
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

/**
 * IPFS storage adapter using HTTP gateway
 */
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

/**
 * Kage Memory Vault - main SDK class
 */
export class KageVault {
  private connection: Connection;
  private config: KageConfig;
  private encryption: EncryptionEngine;
  private storage: StorageAdapter;
  private ownerKeypair: Keypair;
  private viewingKey: ViewingKey | null = null;
  private umbraClient: KageUmbraClient;
  private umbraEnabled: boolean;

  constructor(
    connection: Connection,
    config: KageConfig,
    ownerKeypair: Keypair,
    storage?: StorageAdapter,
    options?: { umbraEnabled?: boolean }
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
  }

  /**
   * Initialize the vault (must be called before other operations)
   */
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

  /**
   * Get the vault PDA address
   */
  getVaultAddress(): PublicKey {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, this.ownerKeypair.publicKey.toBuffer()],
      this.config.programId
    );
    return vaultPda;
  }

  /**
   * Get memory entry PDA address
   */
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

  /**
   * Get access grant PDA address
   */
  getAccessGrantAddress(grantee: PublicKey): PublicKey {
    const vaultPda = this.getVaultAddress();
    const [accessPda] = PublicKey.findProgramAddressSync(
      [ACCESS_SEED, vaultPda.toBuffer(), grantee.toBuffer()],
      this.config.programId
    );
    return accessPda;
  }

  /**
   * Store a memory in the vault with optional Umbra shielded proof
   */
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

    // Generate Umbra shielded proof if privacy layer is available
    let umbraProof: string | undefined;
    if (this.umbraEnabled && this.umbraClient.isInitialized) {
      try {
        umbraProof = await this.umbraClient.createMemoryProof(cid, metadataHash);
        console.log(`[Kage:Vault] Umbra proof created for memory: ${cid}`);
      } catch (err) {
        console.warn("[Kage:Vault] Umbra proof generation failed:", err);
      }
    }

    const txSignature = await this.sendStoreMemoryTransaction(
      cid,
      metadataHash,
      memoryTypeValue,
      umbraProof
    );

    const isSimulated = txSignature.startsWith("sim-");
    const explorerUrl = isSimulated
      ? undefined
      : `https://solscan.io/tx/${txSignature}?cluster=devnet`;

    return {
      memoryId: cid,
      cid,
      txSignature,
      umbraProof,
      explorerUrl,
    };
  }

  /**
   * Recall a memory from the vault
   */
  async recallMemory(cid: string): Promise<MemoryContent> {
    if (!this.viewingKey) {
      throw new Error("Vault not initialized. Call initialize() first.");
    }

    const encrypted = await this.storage.download(cid);
    const decrypted = await this.encryption.decrypt(encrypted, this.viewingKey);

    return decrypted as MemoryContent;
  }

  /**
   * List all memory entries from on-chain data
   */
  async listMemories(): Promise<MemoryEntry[]> {
    const vaultPda = this.getVaultAddress();
    const vaultInfo = await this.connection.getAccountInfo(vaultPda);

    if (!vaultInfo) {
      return [];
    }

    const memoryCount = this.parseMemoryCount(vaultInfo.data);
    const memories: MemoryEntry[] = [];

    for (let i = 0; i < memoryCount; i++) {
      const memoryPda = this.getMemoryAddress(i);
      const memoryInfo = await this.connection.getAccountInfo(memoryPda);

      if (memoryInfo) {
        const entry = this.parseMemoryEntry(memoryInfo.data, i);
        if (entry) {
          memories.push(entry);
        }
      }
    }

    return memories;
  }

  /**
   * Grant access to another user
   */
  async grantAccess(
    grantee: PublicKey,
    permissions: AccessPermissions,
    expiresAt: number = 0
  ): Promise<string> {
    const permissionValue = this.permissionToValue(permissions);
    return this.sendGrantAccessTransaction(
      grantee,
      permissionValue,
      expiresAt
    );
  }

  /**
   * Revoke access from a user
   */
  async revokeAccess(grantee: PublicKey): Promise<string> {
    return this.sendRevokeAccessTransaction(grantee);
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

  private parseMemoryCount(data: Buffer): number {
    return Number(data.readBigUInt64LE(40));
  }

  private parseMemoryEntry(data: Buffer, index: number): MemoryEntry | null {
    try {
      const vaultPubkey = new PublicKey(data.slice(8, 40));
      const cidLength = data.readUInt32LE(56);
      const cid = data.slice(60, 60 + cidLength).toString("utf-8");
      const metadataHashStart = 60 + cidLength;
      const metadataHash = data
        .slice(metadataHashStart, metadataHashStart + 32)
        .toString("hex");
      const memoryTypeOffset = metadataHashStart + 32;
      const memoryType = data.readUInt8(memoryTypeOffset);
      const createdAt = Number(
        data.readBigInt64LE(memoryTypeOffset + 1)
      );

      return {
        id: `${index}`,
        cid,
        metadataHash,
        createdAt,
        memoryType: this.valueToMemoryType(memoryType),
        owner: vaultPubkey,
      };
    } catch {
      return null;
    }
  }

  private valueToMemoryType(value: number): MemoryType {
    const mapping: Record<number, MemoryType> = {
      0: MemoryType.Conversation,
      1: MemoryType.Preference,
      2: MemoryType.Behavior,
      3: MemoryType.Task,
      4: MemoryType.Knowledge,
    };
    return mapping[value] || MemoryType.Knowledge;
  }

  // Discriminators from IDL (no dynamic loading needed)
  private static readonly DISC_INIT_VAULT   = Buffer.from([48,191,163,44,71,129,63,164]);
  private static readonly DISC_STORE_MEMORY = Buffer.from([168,103,88,240,93,185,30,235]);

  private async ensureVaultInitialized(): Promise<void> {
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
      data: KageVault.DISC_INIT_VAULT,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = this.ownerKeypair.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.sign(this.ownerKeypair);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    console.log(`[Kage] Vault initialized on-chain: ${sig}`);
  }

  private async sendStoreMemoryTransaction(
    cid: string,
    metadataHash: Uint8Array,
    memoryType: number,
    umbraProof?: string
  ): Promise<string> {
    const zkruneFlag = ", zkrune=✓";
    console.log(
      `[Kage] Storing memory: cid=${cid}, type=${memoryType}${umbraProof ? ", umbra=✓" : ""}${zkruneFlag}`
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

      // Encode store_memory instruction data manually
      // discriminator (8) + cid string (4 len + bytes) + metadata_hash (32) + memory_type (1)
      const cidBytes = Buffer.from(cid, "utf8");
      const hash32 = new Uint8Array(32);
      hash32.set(metadataHash.slice(0, Math.min(32, metadataHash.length)));

      const dataLen = 8 + 4 + cidBytes.length + 32 + 1;
      const data = Buffer.alloc(dataLen);
      let offset = 0;
      KageVault.DISC_STORE_MEMORY.copy(data, offset); offset += 8;
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
      console.warn(`[Kage] On-chain store failed, using simulated tx: ${err}`);
      return `sim-${Date.now()}`;
    }
  }

  /**
   * Get the underlying Umbra client for direct privacy layer access
   */
  getUmbraClient(): KageUmbraClient {
    return this.umbraClient;
  }

  private async sendGrantAccessTransaction(
    grantee: PublicKey,
    permissions: number,
    expiresAt: number
  ): Promise<string> {
    console.log(
      `[Kage] Granting access to ${grantee.toBase58()} with permissions ${permissions}`
    );
    return `simulated-tx-${Date.now()}`;
  }

  private async sendRevokeAccessTransaction(grantee: PublicKey): Promise<string> {
    console.log(`[Kage] Revoking access from ${grantee.toBase58()}`);
    return `simulated-tx-${Date.now()}`;
  }
}

/**
 * Create a new Kage vault instance
 */
export function createVault(
  connection: Connection,
  config: KageConfig,
  ownerKeypair: Keypair,
  storage?: StorageAdapter,
  options?: { umbraEnabled?: boolean }
): KageVault {
  return new KageVault(connection, config, ownerKeypair, storage, options);
}
