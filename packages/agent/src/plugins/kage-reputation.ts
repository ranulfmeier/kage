import { Keypair } from "@solana/web3.js";
import {
  LocalReputationTracker,
  AgentReputation,
  ReputationEvent,
  ReputationSnapshot,
  TaskOutcome,
} from "@kage/sdk";

export interface KageReputationPluginConfig {
  rpcUrl: string;
  network?: string;
}

/**
 * Plugin wrapper around {@link LocalReputationTracker}.
 *
 * **Important**: this plugin's state is local-only and not cross-agent
 * provable — it is a convenience scoreboard that an agent uses to track
 * its own task history. For cross-agent provable reputation (usable in
 * multi-agent trust decisions, marketplace reviews, etc.), call the ZK
 * pipeline via `ZKCommitmentEngine.commitReputation()` instead, which
 * anchors a Groth16 proof on-chain through `verify_sp1_proof`.
 */
export class KageReputationPlugin {
  private engine: LocalReputationTracker;

  constructor(config: KageReputationPluginConfig) {
    this.engine = new LocalReputationTracker({ rpcUrl: config.rpcUrl, network: config.network });
  }

  async initialize(keypair: Keypair): Promise<void> {
    this.engine.initialize(keypair);
    // Commit initial snapshot on-chain
    try {
      await this.engine.commitSnapshot();
    } catch (err) {
      console.warn(`[KageReputation] Initial snapshot commit failed: ${(err as Error).message}`);
    }
    console.log(`[KageReputation] Plugin initialized.`);
  }

  async recordTask(params: {
    agentDID?: string;
    outcome: TaskOutcome;
    description?: string;
  }): Promise<ReputationEvent> {
    return this.engine.recordTask(params);
  }

  async slash(params: { agentDID?: string; reason: string }): Promise<ReputationEvent> {
    return this.engine.slash(params);
  }

  async recordCredentialIssued(agentDID?: string): Promise<ReputationEvent> {
    return this.engine.recordCredentialIssued(agentDID);
  }

  async commitSnapshot(agentDID?: string): Promise<ReputationSnapshot> {
    return this.engine.commitSnapshot(agentDID);
  }

  getSelfReputation(): AgentReputation | undefined {
    return this.engine.getSelfReputation();
  }

  getReputation(did: string): AgentReputation | undefined {
    return this.engine.getReputation(did);
  }

  getSuccessRate(did?: string): number {
    return this.engine.getSuccessRate(did);
  }

  getLeaderboard(): AgentReputation[] {
    return this.engine.getLeaderboard();
  }

  getAllReputations(): AgentReputation[] {
    return this.engine.getAllReputations();
  }
}

export function createKageReputationPlugin(
  config: KageReputationPluginConfig
): KageReputationPlugin {
  return new KageReputationPlugin(config);
}
