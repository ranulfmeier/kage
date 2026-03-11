import { Connection, Keypair } from "@solana/web3.js";
import {
  GroupVaultEngine,
  GroupMember,
  GroupVaultGroup,
  GroupVaultStore,
  createGroupVaultEngine,
} from "@kage/sdk";

export interface KageGroupVaultPluginConfig {
  rpcUrl: string;
}

export class KageGroupVaultPlugin {
  private engine: GroupVaultEngine | null = null;
  private config: KageGroupVaultPluginConfig;
  private initialized = false;

  readonly name = "kage-group-vault";
  readonly description = "m-of-n threshold group vaults with Shamir's Secret Sharing";
  readonly version = "0.1.0";

  constructor(config: KageGroupVaultPluginConfig) {
    this.config = config;
  }

  async initialize(keypair: Keypair): Promise<void> {
    const connection = new Connection(this.config.rpcUrl, "confirmed");
    this.engine = createGroupVaultEngine(connection, keypair);
    this.initialized = true;
    console.log(`[KageGroupVault] Plugin initialized. X25519: ${this.engine.x25519PublicKey.slice(0, 16)}…`);
  }

  getX25519PublicKey(): string {
    return this.engine?.x25519PublicKey ?? "";
  }

  async createGroup(members: GroupMember[], threshold: number): Promise<{
    success: boolean;
    group?: GroupVaultGroup;
    explorerUrl?: string;
    error?: string;
  }> {
    if (!this.initialized || !this.engine) return { success: false, error: "Not initialized" };
    try {
      const group = await this.engine.createGroup(members, threshold);
      return { success: true, group, explorerUrl: group.explorerUrl };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  loadGroup(group: GroupVaultGroup): void {
    this.engine?.loadGroup(group);
  }

  decryptOwnShare(group: GroupVaultGroup): {
    success: boolean;
    share?: Buffer;
    error?: string;
  } {
    if (!this.initialized || !this.engine) return { success: false, error: "Not initialized" };
    try {
      const share = this.engine.decryptOwnShare(group);
      return { success: true, share };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  reconstructKey(groupId: string, rawShares: Buffer[]): {
    success: boolean;
    error?: string;
  } {
    if (!this.initialized || !this.engine) return { success: false, error: "Not initialized" };
    try {
      this.engine.reconstructKey(groupId, rawShares);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  storeEntry(groupId: string, content: unknown): {
    success: boolean;
    entryId?: string;
    error?: string;
  } {
    if (!this.initialized || !this.engine) return { success: false, error: "Not initialized" };
    try {
      const entry = this.engine.storeEntry(groupId, content);
      return { success: true, entryId: entry.entryId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  readAllEntries(groupId: string): {
    success: boolean;
    entries?: unknown[];
    error?: string;
  } {
    if (!this.initialized || !this.engine) return { success: false, error: "Not initialized" };
    try {
      const entries = this.engine.readAllEntries(groupId);
      return { success: true, entries };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  listGroups(): GroupVaultStore[] {
    return this.engine?.listGroups() ?? [];
  }

  hasKey(groupId: string): boolean {
    return this.engine?.hasKey(groupId) ?? false;
  }
}

export function createKageGroupVaultPlugin(
  config: KageGroupVaultPluginConfig
): KageGroupVaultPlugin {
  return new KageGroupVaultPlugin(config);
}
