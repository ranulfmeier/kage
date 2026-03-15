import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
// @ts-ignore
import { x25519 } from "@noble/curves/ed25519.js";
import {
  GroupVaultEngine,
  GroupMember,
  GroupVaultGroup,
  GroupVaultEntry,
} from "./group-vault.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TeamRole = "owner" | "admin" | "member";

export interface TeamMember {
  /** Solana public key (base58) */
  publicKey: string;
  /** X25519 public key (base64) — for share encryption */
  x25519PublicKey: string;
  role: TeamRole;
  displayName?: string;
  addedAt: number;
  addedBy: string;
}

export interface TeamSecret {
  id: string;
  label: string;
  description?: string;
  /** AES-256-GCM encrypted via group vault */
  encryptedEntry: GroupVaultEntry;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
  onChainTx?: string;
  explorerUrl?: string;
}

export interface TeamEvent {
  type:
    | "team_created"
    | "member_added"
    | "member_removed"
    | "role_changed"
    | "secret_stored"
    | "secret_deleted"
    | "ownership_transferred";
  actor: string;
  payload: Record<string, unknown>;
  timestamp: number;
  onChainTx?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  /** m-of-n for GroupVault key reconstruction */
  threshold: number;
  members: TeamMember[];
  secrets: TeamSecret[];
  eventLog: TeamEvent[];
  /** Underlying group vault for crypto */
  groupVault?: GroupVaultGroup;
  createdBy: string;
  createdAt: number;
  onChainTx?: string;
  explorerUrl?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// ─── TeamVaultEngine ──────────────────────────────────────────────────────────

/**
 * TeamVaultEngine — role-based team secret management built on GroupVaultEngine.
 *
 * Adds organizational features (named teams, roles, invites, event log)
 * on top of the cryptographic primitive in GroupVaultEngine (SSS + AES-GCM).
 *
 * Roles:
 *   owner  — full control, can transfer ownership, remove admins
 *   admin  — can add/remove members (not owner), store/delete secrets
 *   member — can read secrets (if key available)
 */
export class TeamVaultEngine {
  private connection: Connection;
  private agentKeypair: Keypair;
  private groupEngine: GroupVaultEngine;

  /** X25519 public key for this agent (base64) */
  readonly x25519PublicKey: string;

  /** teamId → Team */
  private teams = new Map<string, Team>();

  constructor(connection: Connection, agentKeypair: Keypair) {
    this.connection = connection;
    this.agentKeypair = agentKeypair;
    this.groupEngine = new GroupVaultEngine(connection, agentKeypair);
    this.x25519PublicKey = this.groupEngine.x25519PublicKey;
  }

  // ─── Team management ───────────────────────────────────────────────────────

  /**
   * Create a new team vault.
   *
   * The calling agent automatically becomes the owner.
   * A GroupVault is created under the hood to handle SSS key distribution.
   */
  async createTeam(params: {
    name: string;
    description?: string;
    members?: Omit<TeamMember, "addedAt" | "addedBy">[];
    threshold?: number;
  }): Promise<Team> {
    const { name, description } = params;
    const teamId = `team-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const myPubkey = this.agentKeypair.publicKey.toBase58();

    // Build full member list (owner first, then additional members)
    const selfMember: TeamMember = {
      publicKey: myPubkey,
      x25519PublicKey: this.x25519PublicKey,
      role: "owner",
      displayName: "Agent",
      addedAt: Date.now(),
      addedBy: myPubkey,
    };

    const additionalMembers: TeamMember[] = (params.members ?? []).map((m) => ({
      ...m,
      addedAt: Date.now(),
      addedBy: myPubkey,
    }));

    const allMembers: TeamMember[] = [selfMember, ...additionalMembers];
    const n = allMembers.length;
    const threshold = params.threshold ?? Math.ceil(n / 2); // default majority

    // Create GroupVault for cryptographic key distribution
    const groupMembers: GroupMember[] = allMembers.map((m) => ({
      solanaPubkey: m.publicKey,
      x25519Pubkey: m.x25519PublicKey,
    }));

    const group = await this.groupEngine.createGroup(groupMembers, threshold);

    // Commit team creation on-chain
    let onChainTx: string | undefined;
    let explorerUrl: string | undefined;
    try {
      const nameHash = createHash("sha256").update(name).digest("hex").slice(0, 8);
      const memo = `kage:team:${teamId}:${nameHash}:${n}members`;
      onChainTx = await this.writeMemoProgramTx(memo);
      explorerUrl = `https://solscan.io/tx/${onChainTx}?cluster=devnet`;
      console.log(`[Kage:TeamVault] Team committed on-chain: ${onChainTx}`);
    } catch (err) {
      console.warn(`[Kage:TeamVault] On-chain commit skipped: ${(err as Error).message.slice(0, 60)}`);
    }

    const event: TeamEvent = {
      type: "team_created",
      actor: myPubkey,
      payload: { teamId, name, memberCount: n, threshold },
      timestamp: Date.now(),
      onChainTx,
    };

    const team: Team = {
      id: teamId,
      name,
      description,
      threshold,
      members: allMembers,
      secrets: [],
      eventLog: [event],
      groupVault: group,
      createdBy: myPubkey,
      createdAt: Date.now(),
      onChainTx,
      explorerUrl,
    };

    this.teams.set(teamId, team);
    console.log(`[Kage:TeamVault] Created team "${name}" (${teamId}), ${n} members, ${threshold}-of-${n}`);
    return team;
  }

  /**
   * Invite a new member to the team.
   * Requires owner or admin role. Rebuilds the group vault with new membership.
   */
  async inviteMember(
    teamId: string,
    newMember: Omit<TeamMember, "addedAt" | "addedBy">
  ): Promise<Team> {
    const team = this.requireTeam(teamId);
    const myPubkey = this.agentKeypair.publicKey.toBase58();
    this.requireRole(team, myPubkey, ["owner", "admin"]);

    if (team.members.find((m) => m.publicKey === newMember.publicKey)) {
      throw new Error(`Member ${newMember.publicKey} already in team`);
    }

    const member: TeamMember = {
      ...newMember,
      addedAt: Date.now(),
      addedBy: myPubkey,
    };

    team.members.push(member);

    // Re-create group vault with updated membership
    const groupMembers: GroupMember[] = team.members.map((m) => ({
      solanaPubkey: m.publicKey,
      x25519Pubkey: m.x25519PublicKey,
    }));
    const newGroup = await this.groupEngine.createGroup(groupMembers, team.threshold);
    team.groupVault = newGroup;

    const event: TeamEvent = {
      type: "member_added",
      actor: myPubkey,
      payload: { newMember: newMember.publicKey, role: newMember.role },
      timestamp: Date.now(),
    };

    try {
      const memo = `kage:team:${teamId}:member_added:${newMember.publicKey.slice(0, 8)}`;
      event.onChainTx = await this.writeMemoProgramTx(memo);
      console.log(`[Kage:TeamVault] Member invite committed: ${event.onChainTx}`);
    } catch {
      // non-fatal
    }

    team.eventLog.push(event);
    console.log(`[Kage:TeamVault] Added member ${newMember.publicKey} to team ${teamId}`);
    return team;
  }

  /**
   * Remove a member from the team.
   * Owner can remove anyone. Admins can remove members (not other admins/owner).
   */
  async removeMember(teamId: string, memberPubkey: string): Promise<Team> {
    const team = this.requireTeam(teamId);
    const myPubkey = this.agentKeypair.publicKey.toBase58();
    this.requireRole(team, myPubkey, ["owner", "admin"]);

    const target = team.members.find((m) => m.publicKey === memberPubkey);
    if (!target) throw new Error(`Member not found: ${memberPubkey}`);
    if (target.publicKey === myPubkey) throw new Error("Cannot remove yourself");

    const myRole = team.members.find((m) => m.publicKey === myPubkey)!.role;
    if (myRole === "admin" && (target.role === "owner" || target.role === "admin")) {
      throw new Error("Admins can only remove members");
    }

    team.members = team.members.filter((m) => m.publicKey !== memberPubkey);

    // Re-create group vault without removed member
    const groupMembers: GroupMember[] = team.members.map((m) => ({
      solanaPubkey: m.publicKey,
      x25519Pubkey: m.x25519PublicKey,
    }));
    const newGroup = await this.groupEngine.createGroup(groupMembers, Math.min(team.threshold, team.members.length));
    team.threshold = Math.min(team.threshold, team.members.length);
    team.groupVault = newGroup;

    const event: TeamEvent = {
      type: "member_removed",
      actor: myPubkey,
      payload: { removedMember: memberPubkey },
      timestamp: Date.now(),
    };

    try {
      const memo = `kage:team:${teamId}:member_removed:${memberPubkey.slice(0, 8)}`;
      event.onChainTx = await this.writeMemoProgramTx(memo);
    } catch {
      // non-fatal
    }

    team.eventLog.push(event);
    console.log(`[Kage:TeamVault] Removed member ${memberPubkey} from team ${teamId}`);
    return team;
  }

  /**
   * Change a member's role.
   * Only the owner can promote/demote admins. Admins can only manage members.
   */
  async changeRole(teamId: string, memberPubkey: string, newRole: TeamRole): Promise<Team> {
    const team = this.requireTeam(teamId);
    const myPubkey = this.agentKeypair.publicKey.toBase58();
    this.requireRole(team, myPubkey, ["owner"]);

    if (newRole === "owner") throw new Error("Use transferOwnership() to transfer ownership");

    const target = team.members.find((m) => m.publicKey === memberPubkey);
    if (!target) throw new Error(`Member not found: ${memberPubkey}`);

    const oldRole = target.role;
    target.role = newRole;

    const event: TeamEvent = {
      type: "role_changed",
      actor: myPubkey,
      payload: { member: memberPubkey, oldRole, newRole },
      timestamp: Date.now(),
    };

    try {
      const memo = `kage:team:${teamId}:role:${memberPubkey.slice(0, 8)}:${newRole}`;
      event.onChainTx = await this.writeMemoProgramTx(memo);
    } catch {
      // non-fatal
    }

    team.eventLog.push(event);
    return team;
  }

  /**
   * Transfer team ownership to another member.
   * Only the current owner can call this.
   */
  async transferOwnership(teamId: string, newOwnerPubkey: string): Promise<Team> {
    const team = this.requireTeam(teamId);
    const myPubkey = this.agentKeypair.publicKey.toBase58();
    this.requireRole(team, myPubkey, ["owner"]);

    const newOwner = team.members.find((m) => m.publicKey === newOwnerPubkey);
    if (!newOwner) throw new Error(`Member not found: ${newOwnerPubkey}`);

    const currentOwner = team.members.find((m) => m.publicKey === myPubkey)!;
    currentOwner.role = "admin"; // demote to admin
    newOwner.role = "owner";

    const event: TeamEvent = {
      type: "ownership_transferred",
      actor: myPubkey,
      payload: { from: myPubkey, to: newOwnerPubkey },
      timestamp: Date.now(),
    };

    try {
      const memo = `kage:team:${teamId}:ownership:${newOwnerPubkey.slice(0, 8)}`;
      event.onChainTx = await this.writeMemoProgramTx(memo);
    } catch {
      // non-fatal
    }

    team.eventLog.push(event);
    return team;
  }

  // ─── Secret management ─────────────────────────────────────────────────────

  /**
   * Store an encrypted secret in the team vault.
   * Any member can store. Secret is encrypted with the group key.
   */
  async storeSecret(
    teamId: string,
    params: { label: string; description?: string; data: unknown }
  ): Promise<TeamSecret> {
    const team = this.requireTeam(teamId);
    const myPubkey = this.agentKeypair.publicKey.toBase58();
    this.requireMember(team, myPubkey);

    if (!team.groupVault) throw new Error("Team has no group vault — re-create team");

    // Make sure the creator's group vault has the key
    if (!this.groupEngine.hasKey(team.groupVault.groupId)) {
      throw new Error("Group key not available — reconstruct first");
    }

    const secretId = `secret-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const entry = this.groupEngine.storeEntry(team.groupVault.groupId, {
      secretId,
      label: params.label,
      data: params.data,
    });

    let onChainTx: string | undefined;
    let explorerUrl: string | undefined;
    try {
      const labelHash = createHash("sha256").update(params.label).digest("hex").slice(0, 8);
      const memo = `kage:team:${teamId}:secret:${secretId}:${labelHash}`;
      onChainTx = await this.writeMemoProgramTx(memo);
      explorerUrl = `https://solscan.io/tx/${onChainTx}?cluster=devnet`;
    } catch {
      // non-fatal
    }

    const secret: TeamSecret = {
      id: secretId,
      label: params.label,
      description: params.description,
      encryptedEntry: entry,
      createdBy: myPubkey,
      createdAt: Date.now(),
      onChainTx,
      explorerUrl,
    };

    team.secrets.push(secret);

    const event: TeamEvent = {
      type: "secret_stored",
      actor: myPubkey,
      payload: { secretId, label: params.label },
      timestamp: Date.now(),
      onChainTx,
    };
    team.eventLog.push(event);

    console.log(`[Kage:TeamVault] Secret "${params.label}" stored in team ${teamId}`);
    return secret;
  }

  /**
   * Retrieve and decrypt a secret from the team vault.
   */
  retrieveSecret(teamId: string, secretId: string): { label: string; data: unknown } {
    const team = this.requireTeam(teamId);
    const myPubkey = this.agentKeypair.publicKey.toBase58();
    this.requireMember(team, myPubkey);

    if (!team.groupVault) throw new Error("Team has no group vault");

    const secret = team.secrets.find((s) => s.id === secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    const content = this.groupEngine.readEntry(team.groupVault.groupId, secret.encryptedEntry.entryId) as {
      label: string;
      data: unknown;
    };

    return { label: content.label, data: content.data };
  }

  /**
   * Delete a secret from the team vault.
   * Owner/admin only.
   */
  async deleteSecret(teamId: string, secretId: string): Promise<void> {
    const team = this.requireTeam(teamId);
    const myPubkey = this.agentKeypair.publicKey.toBase58();
    this.requireRole(team, myPubkey, ["owner", "admin"]);

    const idx = team.secrets.findIndex((s) => s.id === secretId);
    if (idx === -1) throw new Error(`Secret not found: ${secretId}`);

    team.secrets.splice(idx, 1);

    const event: TeamEvent = {
      type: "secret_deleted",
      actor: myPubkey,
      payload: { secretId },
      timestamp: Date.now(),
    };

    try {
      const memo = `kage:team:${teamId}:secret_deleted:${secretId.slice(-8)}`;
      event.onChainTx = await this.writeMemoProgramTx(memo);
    } catch {
      // non-fatal
    }

    team.eventLog.push(event);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  listTeams(): Team[] {
    return Array.from(this.teams.values());
  }

  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  getMyRole(teamId: string): TeamRole | null {
    const team = this.teams.get(teamId);
    if (!team) return null;
    const myPubkey = this.agentKeypair.publicKey.toBase58();
    return team.members.find((m) => m.publicKey === myPubkey)?.role ?? null;
  }

  /** Import an existing team (received from another agent/API) */
  importTeam(team: Team): void {
    this.teams.set(team.id, team);
    if (team.groupVault) {
      this.groupEngine.loadGroup(team.groupVault);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private requireTeam(teamId: string): Team {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team not found: ${teamId}`);
    return team;
  }

  private requireMember(team: Team, pubkey: string): void {
    if (!team.members.find((m) => m.publicKey === pubkey)) {
      throw new Error(`Not a member of team ${team.id}`);
    }
  }

  private requireRole(team: Team, pubkey: string, roles: TeamRole[]): void {
    const member = team.members.find((m) => m.publicKey === pubkey);
    if (!member) throw new Error(`Not a member of team ${team.id}`);
    if (!roles.includes(member.role)) {
      throw new Error(`Requires role: ${roles.join(" or ")}, you are: ${member.role}`);
    }
  }

  private async writeMemoProgramTx(memo: string): Promise<string> {
    const ix = new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [
        { pubkey: this.agentKeypair.publicKey, isSigner: true, isWritable: false },
      ],
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

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTeamVaultEngine(
  connection: Connection,
  agentKeypair: Keypair
): TeamVaultEngine {
  return new TeamVaultEngine(connection, agentKeypair);
}
