import { Connection, Keypair } from "@solana/web3.js";
import {
  TeamVaultEngine,
  Team,
  TeamMember,
  TeamSecret,
  TeamRole,
  createTeamVaultEngine,
} from "@kage/sdk";

export interface KageTeamVaultPluginConfig {
  rpcUrl: string;
}

/**
 * Kage Team Vault Plugin — role-based team secret management.
 * Wraps TeamVaultEngine for Eliza-compatible agent integration.
 */
export class KageTeamVaultPlugin {
  private engine: TeamVaultEngine | null = null;
  private config: KageTeamVaultPluginConfig;

  readonly name = "kage-team-vault";
  readonly description = "Role-based team vault for shared encrypted secrets";
  readonly version = "0.1.0";

  constructor(config: KageTeamVaultPluginConfig) {
    this.config = config;
  }

  async initialize(keypair: Keypair): Promise<void> {
    const connection = new Connection(this.config.rpcUrl, "confirmed");
    this.engine = createTeamVaultEngine(connection, keypair);
    console.log(`[KageTeamVault] Plugin initialized. X25519: ${this.engine.x25519PublicKey}`);
  }

  private requireEngine(): TeamVaultEngine {
    if (!this.engine) throw new Error("TeamVaultPlugin not initialized");
    return this.engine;
  }

  get x25519PublicKey(): string {
    return this.requireEngine().x25519PublicKey;
  }

  async createTeam(params: {
    name: string;
    description?: string;
    members?: Omit<TeamMember, "addedAt" | "addedBy">[];
    threshold?: number;
  }): Promise<Team> {
    return this.requireEngine().createTeam(params);
  }

  async inviteMember(
    teamId: string,
    member: Omit<TeamMember, "addedAt" | "addedBy">
  ): Promise<Team> {
    return this.requireEngine().inviteMember(teamId, member);
  }

  async removeMember(teamId: string, memberPubkey: string): Promise<Team> {
    return this.requireEngine().removeMember(teamId, memberPubkey);
  }

  async changeRole(teamId: string, memberPubkey: string, newRole: TeamRole): Promise<Team> {
    return this.requireEngine().changeRole(teamId, memberPubkey, newRole);
  }

  async transferOwnership(teamId: string, newOwnerPubkey: string): Promise<Team> {
    return this.requireEngine().transferOwnership(teamId, newOwnerPubkey);
  }

  async storeSecret(
    teamId: string,
    params: { label: string; description?: string; data: unknown }
  ): Promise<TeamSecret> {
    return this.requireEngine().storeSecret(teamId, params);
  }

  retrieveSecret(teamId: string, secretId: string): { label: string; data: unknown } {
    return this.requireEngine().retrieveSecret(teamId, secretId);
  }

  async deleteSecret(teamId: string, secretId: string): Promise<void> {
    return this.requireEngine().deleteSecret(teamId, secretId);
  }

  listTeams(): Team[] {
    return this.requireEngine().listTeams();
  }

  getTeam(teamId: string): Team | undefined {
    return this.requireEngine().getTeam(teamId);
  }

  getMyRole(teamId: string): TeamRole | null {
    return this.requireEngine().getMyRole(teamId);
  }

  importTeam(team: Team): void {
    return this.requireEngine().importTeam(team);
  }
}
