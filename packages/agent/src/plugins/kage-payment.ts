import { Connection, Keypair } from "@solana/web3.js";
import {
  ShieldedPaymentEngine,
  ShieldedPayment,
  ScanResult,
  createShieldedPaymentEngine,
} from "@kage/sdk";

export interface KagePaymentPluginConfig {
  rpcUrl: string;
}

export class KagePaymentPlugin {
  private engine: ShieldedPaymentEngine | null = null;
  private config: KagePaymentPluginConfig;
  private initialized = false;

  readonly name = "kage-payment";
  readonly description = "Shielded agent-to-agent SOL payments via stealth addresses";
  readonly version = "0.1.0";

  constructor(config: KagePaymentPluginConfig) {
    this.config = config;
  }

  async initialize(keypair: Keypair): Promise<void> {
    const connection = new Connection(this.config.rpcUrl, "confirmed");
    this.engine = createShieldedPaymentEngine(connection, keypair);
    this.initialized = true;
    console.log(`[KagePaymentPlugin] Initialized. Viewing pub: ${this.engine.viewingPublicKey}`);
  }

  private ensureReady(): ShieldedPaymentEngine {
    if (!this.engine || !this.initialized) throw new Error("Payment plugin not initialized");
    return this.engine;
  }

  getViewingPublicKey(): string {
    return this.ensureReady().viewingPublicKey;
  }

  async shieldedTransfer(
    recipientSolanaPubkey: string,
    recipientViewingPub: string,
    amountLamports: number,
    memo?: string
  ): Promise<ShieldedPayment> {
    return this.ensureReady().shieldedTransfer(
      recipientSolanaPubkey,
      recipientViewingPub,
      amountLamports,
      memo
    );
  }

  deriveStealthAddress(recipientViewingPub: string): {
    stealthAddress: string;
    ephemeralPub: string;
  } {
    const result = this.ensureReady().deriveStealthAddress(recipientViewingPub);
    return {
      stealthAddress: result.stealthAddress.toBase58(),
      ephemeralPub: result.ephemeralPub,
    };
  }

  async scanForPayments(limit?: number): Promise<ScanResult[]> {
    return this.ensureReady().scanForPayments(limit);
  }

  async claimPayment(ephemeralPubBase64: string): Promise<string> {
    return this.ensureReady().claimPayment(ephemeralPubBase64);
  }

  getSentPayments(): ShieldedPayment[] {
    return this.ensureReady().getSentPayments();
  }

  getReceivedPayments(): ShieldedPayment[] {
    return this.ensureReady().getReceivedPayments();
  }

  getAllPayments(): ShieldedPayment[] {
    return this.ensureReady().getAllPayments();
  }
}
