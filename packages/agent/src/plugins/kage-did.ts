import { Keypair } from "@solana/web3.js";
import { DIDEngine, KageDIDDocument, KageCredential, DIDResolution } from "@kage/sdk";

export interface KageDIDPluginConfig {
  rpcUrl: string;
  network?: string;
}

export class KageDIDPlugin {
  private engine: DIDEngine;
  private initialized = false;

  constructor(config: KageDIDPluginConfig) {
    this.engine = new DIDEngine({ rpcUrl: config.rpcUrl, network: config.network });
  }

  async initialize(keypair: Keypair): Promise<void> {
    this.engine.initialize(keypair);
    // Auto-create DID document on startup
    try {
      await this.engine.createDIDDocument({
        agentType: "kage-privacy-agent",
        capabilities: ["memory", "reasoning", "messaging", "group-vault", "shielded-payment"],
        reasoningEnabled: true,
      });
    } catch (err) {
      console.warn(`[KageDID] Auto-create DID failed: ${(err as Error).message}`);
    }
    this.initialized = true;
    console.log(`[KageDID] Plugin initialized. DID: ${this.engine.getSelfDID()}`);
  }

  getSelfDID(): string {
    return this.engine.getSelfDID();
  }

  getSelfDocument(): KageDIDDocument | undefined {
    return this.engine.getSelfDocument();
  }

  async resolveDID(did: string): Promise<DIDResolution | null> {
    return this.engine.resolveDID(did);
  }

  registerPeerDID(document: KageDIDDocument): void {
    this.engine.registerPeerDID(document);
  }

  async issueCredential(params: {
    subjectDID: string;
    type: string;
    claim: Record<string, unknown>;
    expiresInSec?: number;
  }): Promise<KageCredential> {
    return this.engine.issueCredential(params);
  }

  verifyCredential(credential: KageCredential): { valid: boolean; reason?: string } {
    return this.engine.verifyCredential(credential);
  }

  getCredentials(): KageCredential[] {
    return this.engine.getCredentials();
  }

  getCredential(credentialId: string): KageCredential | undefined {
    return this.engine.getCredential(credentialId);
  }

  getAllKnownDIDs(): KageDIDDocument[] {
    return this.engine.getAllKnownDIDs();
  }
}

export function createKageDIDPlugin(config: KageDIDPluginConfig): KageDIDPlugin {
  return new KageDIDPlugin(config);
}
