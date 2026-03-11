import { Keypair } from "@solana/web3.js";
import {
  ReputationEngine,
  AgentReputation,
  ReputationEvent,
  ReputationSnapshot,
  TaskOutcome,
} from "@kage/sdk";

export interface KageReputationPluginConfig {
  rpcUrl: string;
  network?: string;
}

export class KageReputationPlugin {
  private engine: ReputationEngine;

  constructor(config: KageReputationPluginConfig) {
    this.engine = new ReputationEngine({ rpcUrl: config.rpcUrl, network: config.network });
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
