import { PublicKey } from "@solana/web3.js";

/**
 * Memory entry stored in the vault
 */
export interface MemoryEntry {
  /** Unique identifier for this memory */
  id: string;
  /** IPFS CID of the encrypted memory blob */
  cid: string;
  /** Hash of the memory metadata */
  metadataHash: string;
  /** Timestamp when memory was created */
  createdAt: number;
  /** Memory type/category */
  memoryType: MemoryType;
  /** Owner's public key */
  owner: PublicKey;
}

/**
 * Types of memories that can be stored
 */
export enum MemoryType {
  /** Conversation history */
  Conversation = "conversation",
  /** User preferences */
  Preference = "preference",
  /** Learned behavior patterns */
  Behavior = "behavior",
  /** Task execution history */
  Task = "task",
  /** General knowledge */
  Knowledge = "knowledge",
}

/**
 * Decrypted memory content
 */
export interface MemoryContent {
  /** The actual memory data */
  data: unknown;
  /** Memory metadata */
  metadata: MemoryMetadata;
}

/**
 * Memory metadata
 */
export interface MemoryMetadata {
  /** Human-readable label */
  label?: string;
  /** Tags for categorization */
  tags: string[];
  /** Source of the memory (e.g., "conversation", "api") */
  source: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Configuration for the Kage SDK
 */
export interface KageConfig {
  /** Solana RPC endpoint */
  rpcUrl: string;
  /** Kage program ID */
  programId: PublicKey;
  /** IPFS gateway URL */
  ipfsGateway: string;
  /** Umbra network (devnet/mainnet) */
  umbraNetwork: "devnet" | "mainnet";
}

/**
 * Result of a memory store operation
 */
export interface StoreResult {
  /** Memory entry ID */
  memoryId: string;
  /** IPFS CID */
  cid: string;
  /** Solana transaction signature */
  txSignature: string;
}

/**
 * Access grant for viewing memories
 */
export interface AccessGrant {
  /** Grantee's public key */
  grantee: PublicKey;
  /** Granted at timestamp */
  grantedAt: number;
  /** Expiration timestamp (0 = never) */
  expiresAt: number;
  /** Permissions level */
  permissions: AccessPermissions;
}

/**
 * Access permission levels
 */
export enum AccessPermissions {
  /** Can only read memories */
  Read = "read",
  /** Can read and write memories */
  ReadWrite = "read_write",
  /** Full access including access management */
  Admin = "admin",
}
