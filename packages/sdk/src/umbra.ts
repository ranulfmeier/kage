import { Keypair } from "@solana/web3.js";
import type { Address } from "@solana/addresses";
import {
  getUmbraClientFromSigner,
  createSignerFromPrivateKeyBytes,
  getUserRegistrationFunction,
  getDirectDepositIntoEncryptedBalanceFunction,
  getDirectWithdrawIntoPublicBalanceV3Function,
  getQueryEncryptedBalanceFunction,
} from "@umbra-privacy/sdk";
import type { MasterSeed, U64 } from "@umbra-privacy/sdk/types";

export type UmbraNetwork = "devnet" | "mainnet";

export interface UmbraConfig {
  network: UmbraNetwork;
  rpcUrl: string;
  rpcSubscriptionsUrl: string;
  indexerApiEndpoint?: string;
}

const INDEXER_ENDPOINTS: Record<UmbraNetwork, string> = {
  mainnet: "https://acqzie0a1h.execute-api.eu-central-1.amazonaws.com",
  devnet: "https://acqzie0a1h.execute-api.eu-central-1.amazonaws.com",
};

const DEFAULT_RPC: Record<UmbraNetwork, { http: string; ws: string }> = {
  devnet: {
    http: "https://api.devnet.solana.com",
    ws: "wss://api.devnet.solana.com",
  },
  mainnet: {
    http: "https://api.mainnet-beta.solana.com",
    ws: "wss://api.mainnet-beta.solana.com",
  },
};

/**
 * Kage Umbra Privacy Layer
 *
 * Wraps the Umbra SDK to provide shielded memory commitment storage
 * and encrypted balance management for AI agents.
 */
export class KageUmbraClient {
  private config: UmbraConfig;
  private keypair: Keypair;
  private client: Awaited<ReturnType<typeof getUmbraClientFromSigner>> | null = null;
  private registered = false;

  constructor(keypair: Keypair, config?: Partial<UmbraConfig>) {
    this.keypair = keypair;
    const network = config?.network ?? "devnet";
    this.config = {
      network,
      rpcUrl: config?.rpcUrl ?? DEFAULT_RPC[network].http,
      rpcSubscriptionsUrl: config?.rpcSubscriptionsUrl ?? DEFAULT_RPC[network].ws,
      indexerApiEndpoint: config?.indexerApiEndpoint ?? INDEXER_ENDPOINTS[network],
    };
  }

  /**
   * Initialize the Umbra client from the agent's Solana keypair.
   * Defers master seed signing to the first operation.
   */
  async initialize(): Promise<void> {
    const signer = await createSignerFromPrivateKeyBytes(this.keypair.secretKey);

    this.client = await getUmbraClientFromSigner(
      {
        signer,
        network: this.config.network,
        rpcUrl: this.config.rpcUrl,
        rpcSubscriptionsUrl: this.config.rpcSubscriptionsUrl,
        indexerApiEndpoint: this.config.indexerApiEndpoint,
        deferMasterSeedSignature: true,
      },
      {
        // Deterministic seed from keypair for headless agent usage.
        // The agent signs no interactive prompts — seed is derived from
        // the same keypair used for Solana transactions.
        masterSeedStorage: {
          generate: async () => {
            const crypto = await import("crypto");
            const seed = crypto
              .createHash("sha512")
              .update(Buffer.from("kage-umbra-master-seed"))
              .update(this.keypair.secretKey)
              .digest();
            return new Uint8Array(seed) as unknown as MasterSeed;
          },
        },
      }
    );

    console.log(
      `[Kage:Umbra] Client initialized on ${this.config.network} for ${signer.address}`
    );
  }

  /**
   * Register agent's Umbra identity on-chain.
   * Safe to call multiple times — handles re-registration.
   */
  async register(): Promise<void> {
    if (!this.client) throw new Error("Call initialize() first");
    if (this.registered) return;

    const register = getUserRegistrationFunction({ client: this.client });

    try {
      const signatures = await register({
        confidential: true,
        anonymous: false,
      });
      this.registered = true;
      console.log(
        `[Kage:Umbra] Registered in ${signatures.length} transaction(s):`,
        signatures
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already registered") || msg.includes("AlreadyInUse")) {
        this.registered = true;
        console.log("[Kage:Umbra] Account already registered");
      } else {
        throw err;
      }
    }
  }

  /**
   * Shield tokens into an encrypted Umbra balance.
   * Used to fund shielded memory operations.
   */
  async shieldTokens(mint: string, amount: bigint): Promise<string> {
    if (!this.client) throw new Error("Call initialize() first");

    const deposit = getDirectDepositIntoEncryptedBalanceFunction({
      client: this.client,
    });

    const signature = await deposit(
      this.client.signer.address,
      mint as unknown as Address,
      amount as unknown as U64
    );

    console.log(`[Kage:Umbra] Shielded ${amount} tokens of mint ${mint}: ${signature}`);
    return signature;
  }

  /**
   * Withdraw tokens from encrypted balance back to public wallet.
   */
  async unshieldTokens(mint: string, amount: bigint): Promise<string> {
    if (!this.client) throw new Error("Call initialize() first");

    const withdraw = getDirectWithdrawIntoPublicBalanceV3Function({
      client: this.client,
    });

    const signature = await withdraw(
      this.client.signer.address,
      mint as unknown as Address,
      amount as unknown as U64
    );

    console.log(`[Kage:Umbra] Unshielded ${amount} tokens of mint ${mint}: ${signature}`);
    return signature;
  }

  /**
   * Query the encrypted balance for a given mint.
   */
  async getEncryptedBalance(mint: string): Promise<bigint> {
    if (!this.client) throw new Error("Call initialize() first");

    const query = getQueryEncryptedBalanceFunction({ client: this.client });

    try {
      const balances = await query([mint as unknown as Address]);
      const result = balances.get(mint as unknown as Address);
      if (result && result.state === "shared") {
        return result.balance as unknown as bigint;
      }
      return 0n;
    } catch {
      return 0n;
    }
  }

  /**
   * Derive a memory commitment key from the Umbra master seed.
   * Used to create a shielded binding between agent identity and memory CID.
   */
  async deriveMemoryCommitmentKey(cid: string): Promise<Uint8Array> {
    if (!this.client) throw new Error("Call initialize() first");

    const crypto = await import("crypto");
    const masterSeed = await this.client.masterSeed.getMasterSeed();

    const commitment = crypto
      .createHmac("sha256", Buffer.from(masterSeed))
      .update(Buffer.from(`kage:memory:${cid}`))
      .digest();

    return new Uint8Array(commitment);
  }

  /**
   * Create a shielded proof that a memory CID belongs to this agent.
   * Returns a hex-encoded commitment that can be stored on-chain.
   */
  async createMemoryProof(cid: string, metadataHash: Uint8Array): Promise<string> {
    const commitmentKey = await this.deriveMemoryCommitmentKey(cid);

    const crypto = await import("crypto");
    const proof = crypto
      .createHmac("sha256", Buffer.from(commitmentKey))
      .update(Buffer.from(metadataHash))
      .update(Buffer.from(cid))
      .digest("hex");

    return proof;
  }

  /**
   * Verify a memory proof for a given CID.
   */
  async verifyMemoryProof(
    cid: string,
    metadataHash: Uint8Array,
    proof: string
  ): Promise<boolean> {
    const expected = await this.createMemoryProof(cid, metadataHash);
    return expected === proof;
  }

  get isInitialized(): boolean {
    return this.client !== null;
  }

  get isRegistered(): boolean {
    return this.registered;
  }

  get network(): UmbraNetwork {
    return this.config.network;
  }

  get address(): string {
    return this.client?.signer.address ?? "";
  }
}

/**
 * Create a KageUmbraClient from an agent keypair.
 */
export function createUmbraClient(
  keypair: Keypair,
  config?: Partial<UmbraConfig>
): KageUmbraClient {
  return new KageUmbraClient(keypair, config);
}
