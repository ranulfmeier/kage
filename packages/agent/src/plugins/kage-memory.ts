import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  KageVault,
  createVault,
  MemoryType,
  MemoryMetadata,
  KageConfig,
  MemoryContent,
  MemoryEntry,
  ArweaveStorageAdapter,
  MemoryStorageAdapter,
  LocalChainAdapter,
  ChainAdapter,
} from "@kage/sdk";

/**
 * Kage Memory Plugin for Eliza-compatible agents
 * Provides encrypted memory storage and retrieval capabilities
 */

export type StorageBackend = "memory" | "arweave";

export interface KageMemoryPluginConfig {
  rpcUrl: string;
  programId: string;
  ipfsGateway: string;
  umbraNetwork: "devnet" | "mainnet";
  /** Storage backend: "memory" (default dev) | "arweave" (permanent) */
  storageBackend?: StorageBackend;
  /** Chain mode: "solana" (default, real TXs) | "local" (in-memory, for tests) */
  chainMode?: "solana" | "local";
}

export interface MemoryAction {
  name: string;
  description: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Kage Memory Plugin
 * Integrates with Eliza's plugin system for AI agent memory operations
 */
export class KageMemoryPlugin {
  private vault: KageVault | null = null;
  private config: KageMemoryPluginConfig;
  private keypair: Keypair | null = null;
  private initialized = false;
  private memoryCache: MemoryEntry[] = [];

  readonly name = "kage-memory";
  readonly description = "Privacy-first encrypted memory storage for AI agents";
  readonly version = "0.1.0";

  constructor(config: KageMemoryPluginConfig) {
    this.config = config;
  }

  /**
   * Initialize the plugin with an owner keypair
   */
  async initialize(keypair: Keypair): Promise<void> {
    this.keypair = keypair;

    const connection = new Connection(this.config.rpcUrl, "confirmed");
    const kageConfig: KageConfig = {
      rpcUrl: this.config.rpcUrl,
      programId: new PublicKey(this.config.programId),
      ipfsGateway: this.config.ipfsGateway,
      umbraNetwork: this.config.umbraNetwork,
    };

    const backend = this.config.storageBackend ?? "memory";
    const storage = backend === "arweave"
      ? new ArweaveStorageAdapter({ keypair, rpcUrl: this.config.rpcUrl, network: this.config.umbraNetwork })
      : new MemoryStorageAdapter();

    const chainAdapter: ChainAdapter | undefined =
      this.config.chainMode === "local"
        ? new LocalChainAdapter(keypair.publicKey)
        : undefined;

    this.vault = createVault(connection, kageConfig, keypair, storage, { chainAdapter });
    await this.vault.initialize();
    this.initialized = true;

    console.log(`[KageMemory] Plugin initialized for agent: ${keypair.publicKey.toBase58()} (storage: ${backend})`);
  }

  /**
   * Get available actions for the agent
   */
  getActions(): MemoryAction[] {
    return [
      {
        name: "store_memory",
        description: "Store a piece of information in encrypted memory vault",
        handler: this.storeMemory.bind(this),
      },
      {
        name: "recall_memory",
        description: "Retrieve a specific memory by its ID",
        handler: this.recallMemory.bind(this),
      },
      {
        name: "list_memories",
        description: "List all stored memories",
        handler: this.listMemories.bind(this),
      },
      {
        name: "search_memories",
        description: "Search memories by tags or content",
        handler: this.searchMemories.bind(this),
      },
    ];
  }

  /**
   * Store a memory in the vault
   */
  async storeMemory(params: Record<string, unknown>): Promise<{
    success: boolean;
    memoryId?: string;
    txSignature?: string;
    explorerUrl?: string;
    umbraProof?: string;
    error?: string;
  }> {
    if (!this.initialized || !this.vault) {
      return { success: false, error: "Plugin not initialized" };
    }

    try {
      const data = params.data;
      const label = (params.label as string) || undefined;
      const tags = (params.tags as string[]) || [];
      const source = (params.source as string) || "agent";
      const type = this.parseMemoryType(params.type as string);

      const metadata: MemoryMetadata = {
        label,
        tags,
        source,
        context: params.context as Record<string, unknown>,
      };

      const result = await this.vault.storeMemory(data, metadata, type);

      console.log(`[KageMemory] Memory stored: ${result.memoryId}`);

      this.memoryCache.push({
        id: result.memoryId,
        cid: result.cid,
        metadataHash: "",
        createdAt: Date.now(),
        memoryType: type,
        owner: this.keypair!.publicKey,
      });

      return {
        success: true,
        memoryId: result.memoryId,
        txSignature: result.txSignature,
        explorerUrl: result.explorerUrl,
        umbraProof: result.umbraProof,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[KageMemory] Store failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Recall a memory from the vault
   */
  async recallMemory(params: Record<string, unknown>): Promise<{
    success: boolean;
    memory?: MemoryContent;
    error?: string;
  }> {
    if (!this.initialized || !this.vault) {
      return { success: false, error: "Plugin not initialized" };
    }

    try {
      const cid = params.memoryId as string;
      if (!cid) {
        return { success: false, error: "memoryId is required" };
      }

      const memory = await this.vault.recallMemory(cid);

      console.log(`[KageMemory] Memory recalled: ${cid}`);

      return { success: true, memory };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[KageMemory] Recall failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * List all memories
   */
  async listMemories(_params: Record<string, unknown>): Promise<{
    success: boolean;
    memories?: MemoryEntry[];
    error?: string;
  }> {
    if (!this.initialized || !this.vault) {
      return { success: false, error: "Plugin not initialized" };
    }

    try {
      const memories = this.memoryCache;
      console.log(`[KageMemory] Listed ${memories.length} memories`);
      return { success: true, memories };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[KageMemory] List failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Search memories by tags
   */
  async searchMemories(params: Record<string, unknown>): Promise<{
    success: boolean;
    memories?: MemoryContent[];
    error?: string;
  }> {
    if (!this.initialized || !this.vault) {
      return { success: false, error: "Plugin not initialized" };
    }

    try {
      const tags = (params.tags as string[]) || [];
      const entries = await this.vault.listMemories();
      const matchingMemories: MemoryContent[] = [];

      for (const entry of entries) {
        try {
          const content = await this.vault.recallMemory(entry.cid);
          const memoryTags = content.metadata.tags || [];

          if (tags.length === 0 || tags.some((t) => memoryTags.includes(t))) {
            matchingMemories.push(content);
          }
        } catch {
          continue;
        }
      }

      console.log(`[KageMemory] Found ${matchingMemories.length} matching memories`);

      return { success: true, memories: matchingMemories };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[KageMemory] Search failed: ${message}`);
      return { success: false, error: message };
    }
  }

  private parseMemoryType(type?: string): MemoryType {
    if (!type) return MemoryType.Conversation;

    const mapping: Record<string, MemoryType> = {
      conversation: MemoryType.Conversation,
      preference: MemoryType.Preference,
      behavior: MemoryType.Behavior,
      task: MemoryType.Task,
      knowledge: MemoryType.Knowledge,
    };

    return mapping[type.toLowerCase()] || MemoryType.Conversation;
  }
}

/**
 * Create a Kage memory plugin instance
 */
export function createKageMemoryPlugin(
  config: KageMemoryPluginConfig
): KageMemoryPlugin {
  return new KageMemoryPlugin(config);
}
