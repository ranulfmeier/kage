import { Keypair } from "@solana/web3.js";
import { EncryptedData } from "./encryption.js";
import { StorageAdapter } from "./vault.js";

/**
 * Arweave permanent storage adapter via Irys (formerly Bundlr).
 *
 * - Devnet: free uploads, data available at gateway.irys.xyz
 * - Mainnet: SOL-funded uploads, data permanent on Arweave
 *
 * Each upload receives a unique Arweave transaction ID (43 chars)
 * that serves as the memory CID — permanent and tamper-proof.
 */
export class ArweaveStorageAdapter implements StorageAdapter {
  private irys: unknown = null;
  private readonly network: "devnet" | "mainnet";
  private readonly rpcUrl: string;
  private readonly keypair: Keypair;
  private readonly gatewayUrl: string;

  constructor(config: {
    keypair: Keypair;
    rpcUrl: string;
    network?: "devnet" | "mainnet";
  }) {
    this.keypair = config.keypair;
    this.rpcUrl = config.rpcUrl;
    this.network = config.network ?? "devnet";
    this.gatewayUrl =
      this.network === "devnet"
        ? "https://gateway.irys.xyz"
        : "https://arweave.net";
  }

  private async getIrys(): Promise<{
    upload(data: Buffer, opts: { tags: { name: string; value: string }[] }): Promise<{ id: string }>;
  }> {
    if (this.irys) return this.irys as never;

    // @ts-ignore — dynamic import to avoid top-level ESM issues
    const { NodeIrys } = await import("@irys/sdk");

    const irys = new NodeIrys({
      network: this.network,
      token: "solana",
      key: this.keypair.secretKey,
      config: { providerUrl: this.rpcUrl },
    });

    // Devnet: no funding needed; mainnet: check balance
    if (this.network === "mainnet") {
      try {
        const balance = await irys.getLoadedBalance();
        if (balance.isZero()) {
          console.warn("[KageArweave] Irys balance is 0 — uploads may fail on mainnet.");
        }
      } catch {
        // non-fatal
      }
    }

    this.irys = irys;
    return irys;
  }

  /**
   * Upload encrypted memory blob to Arweave via Irys.
   * Returns the Arweave transaction ID (acts as permanent CID).
   */
  async upload(data: EncryptedData): Promise<string> {
    const irys = await this.getIrys();
    const payload = Buffer.from(JSON.stringify(data), "utf-8");

    const receipt = await irys.upload(payload, {
      tags: [
        { name: "Content-Type", value: "application/json" },
        { name: "App-Name", value: "Kage" },
        { name: "App-Version", value: "0.1.0" },
        { name: "Type", value: "encrypted-memory" },
        { name: "Encryption", value: "AES-256-GCM" },
        { name: "Storage", value: "permanent" },
      ],
    });

    console.log(`[KageArweave] Uploaded ${payload.length} bytes → tx: ${receipt.id}`);
    return receipt.id;
  }

  /**
   * Fetch encrypted memory blob from Arweave/Irys gateway.
   */
  async download(txId: string): Promise<EncryptedData> {
    const url = `${this.gatewayUrl}/${txId}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`[KageArweave] Fetch failed for ${txId}: ${resp.status} ${resp.statusText}`);
    }
    return resp.json() as Promise<EncryptedData>;
  }

  /** Returns the public gateway URL for a given tx ID */
  getUrl(txId: string): string {
    return `${this.gatewayUrl}/${txId}`;
  }

  get networkName(): string {
    return this.network;
  }
}
