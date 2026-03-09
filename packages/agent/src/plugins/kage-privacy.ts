import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  KageVault,
  createVault,
  KageConfig,
  AccessPermissions,
  AccessGrant,
} from "@kage/sdk";

/**
 * Kage Privacy Plugin for Eliza-compatible agents
 * Manages access control and privacy settings for the memory vault
 */

export interface KagePrivacyPluginConfig {
  rpcUrl: string;
  programId: string;
  ipfsGateway: string;
  umbraNetwork: "devnet" | "mainnet";
}

export interface PrivacyAction {
  name: string;
  description: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Kage Privacy Plugin
 * Handles access control, viewing keys, and privacy management
 */
export class KagePrivacyPlugin {
  private vault: KageVault | null = null;
  private config: KagePrivacyPluginConfig;
  private keypair: Keypair | null = null;
  private initialized = false;

  readonly name = "kage-privacy";
  readonly description = "Privacy and access control management for AI agent memories";
  readonly version = "0.1.0";

  constructor(config: KagePrivacyPluginConfig) {
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

    this.vault = createVault(connection, kageConfig, keypair);
    await this.vault.initialize();
    this.initialized = true;

    console.log(`[KagePrivacy] Plugin initialized for agent: ${keypair.publicKey.toBase58()}`);
  }

  /**
   * Get available actions for the agent
   */
  getActions(): PrivacyAction[] {
    return [
      {
        name: "grant_access",
        description: "Grant memory access to another public key",
        handler: this.grantAccess.bind(this),
      },
      {
        name: "revoke_access",
        description: "Revoke memory access from a public key",
        handler: this.revokeAccess.bind(this),
      },
      {
        name: "check_access",
        description: "Check if a public key has access to memories",
        handler: this.checkAccess.bind(this),
      },
      {
        name: "get_vault_info",
        description: "Get information about the memory vault",
        handler: this.getVaultInfo.bind(this),
      },
    ];
  }

  /**
   * Grant access to another user
   */
  async grantAccess(params: Record<string, unknown>): Promise<{
    success: boolean;
    txSignature?: string;
    error?: string;
  }> {
    if (!this.initialized || !this.vault) {
      return { success: false, error: "Plugin not initialized" };
    }

    try {
      const granteeStr = params.grantee as string;
      if (!granteeStr) {
        return { success: false, error: "grantee public key is required" };
      }

      const grantee = new PublicKey(granteeStr);
      const permissions = this.parsePermissions(params.permissions as string);
      const expiresAt = (params.expiresAt as number) || 0;

      const txSignature = await this.vault.grantAccess(
        grantee,
        permissions,
        expiresAt
      );

      console.log(`[KagePrivacy] Access granted to ${granteeStr}`);

      return { success: true, txSignature };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[KagePrivacy] Grant access failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Revoke access from a user
   */
  async revokeAccess(params: Record<string, unknown>): Promise<{
    success: boolean;
    txSignature?: string;
    error?: string;
  }> {
    if (!this.initialized || !this.vault) {
      return { success: false, error: "Plugin not initialized" };
    }

    try {
      const granteeStr = params.grantee as string;
      if (!granteeStr) {
        return { success: false, error: "grantee public key is required" };
      }

      const grantee = new PublicKey(granteeStr);
      const txSignature = await this.vault.revokeAccess(grantee);

      console.log(`[KagePrivacy] Access revoked from ${granteeStr}`);

      return { success: true, txSignature };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[KagePrivacy] Revoke access failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Check if a user has access
   */
  async checkAccess(params: Record<string, unknown>): Promise<{
    success: boolean;
    hasAccess?: boolean;
    permissions?: AccessPermissions;
    error?: string;
  }> {
    if (!this.initialized || !this.vault || !this.keypair) {
      return { success: false, error: "Plugin not initialized" };
    }

    try {
      const granteeStr = params.grantee as string;
      if (!granteeStr) {
        return { success: false, error: "grantee public key is required" };
      }

      const grantee = new PublicKey(granteeStr);

      if (grantee.equals(this.keypair.publicKey)) {
        return {
          success: true,
          hasAccess: true,
          permissions: AccessPermissions.Admin,
        };
      }

      const accessGrantPda = this.vault.getAccessGrantAddress(grantee);
      const connection = new Connection(this.config.rpcUrl, "confirmed");
      const accountInfo = await connection.getAccountInfo(accessGrantPda);

      if (!accountInfo) {
        return { success: true, hasAccess: false };
      }

      return {
        success: true,
        hasAccess: true,
        permissions: AccessPermissions.Read,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[KagePrivacy] Check access failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Get vault information
   */
  async getVaultInfo(_params: Record<string, unknown>): Promise<{
    success: boolean;
    vaultAddress?: string;
    owner?: string;
    memoryCount?: number;
    error?: string;
  }> {
    if (!this.initialized || !this.vault || !this.keypair) {
      return { success: false, error: "Plugin not initialized" };
    }

    try {
      const vaultAddress = this.vault.getVaultAddress();
      const connection = new Connection(this.config.rpcUrl, "confirmed");
      const accountInfo = await connection.getAccountInfo(vaultAddress);

      let memoryCount = 0;
      if (accountInfo) {
        memoryCount = Number(accountInfo.data.readBigUInt64LE(40));
      }

      return {
        success: true,
        vaultAddress: vaultAddress.toBase58(),
        owner: this.keypair.publicKey.toBase58(),
        memoryCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[KagePrivacy] Get vault info failed: ${message}`);
      return { success: false, error: message };
    }
  }

  private parsePermissions(permissions?: string): AccessPermissions {
    if (!permissions) return AccessPermissions.Read;

    const mapping: Record<string, AccessPermissions> = {
      read: AccessPermissions.Read,
      readwrite: AccessPermissions.ReadWrite,
      read_write: AccessPermissions.ReadWrite,
      admin: AccessPermissions.Admin,
    };

    return mapping[permissions.toLowerCase()] || AccessPermissions.Read;
  }
}

/**
 * Create a Kage privacy plugin instance
 */
export function createKagePrivacyPlugin(
  config: KagePrivacyPluginConfig
): KagePrivacyPlugin {
  return new KagePrivacyPlugin(config);
}
