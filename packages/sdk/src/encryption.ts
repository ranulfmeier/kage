import { Keypair, PublicKey } from "@solana/web3.js";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  /** Umbra network (devnet/mainnet) */
  network: "devnet" | "mainnet";
}

/**
 * Encrypted data wrapper
 */
export interface EncryptedData {
  /** Encrypted blob as base64 */
  ciphertext: string;
  /** Encryption nonce/IV */
  nonce: string;
  /** Auth tag for GCM */
  tag: string;
}

/**
 * Viewing key for decryption
 */
export interface ViewingKey {
  /** The viewing key bytes */
  key: Uint8Array;
  /** Associated public key */
  publicKey: PublicKey;
}

/**
 * Encryption engine using Node.js crypto
 * Note: In production, this integrates with @umbra-privacy/sdk
 * For MVP, we implement compatible encryption using native crypto
 */
export class EncryptionEngine {
  private config: EncryptionConfig;

  constructor(config: EncryptionConfig) {
    this.config = config;
  }

  /**
   * Generate a viewing key for the owner
   */
  async generateViewingKey(ownerKeypair: Keypair): Promise<ViewingKey> {
    const seed = ownerKeypair.secretKey.slice(0, 32);
    const viewingKey = this.deriveKey(seed, "kage-viewing-key");

    return {
      key: viewingKey,
      publicKey: ownerKeypair.publicKey,
    };
  }

  /**
   * Encrypt data using the owner's viewing key
   */
  async encrypt(data: unknown, viewingKey: ViewingKey): Promise<EncryptedData> {
    const plaintext = JSON.stringify(data);
    const nonce = randomBytes(12);

    const cipher = createCipheriv("aes-256-gcm", viewingKey.key, nonce);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: tag.toString("base64"),
    };
  }

  /**
   * Decrypt data using the owner's viewing key
   */
  async decrypt(
    encryptedData: EncryptedData,
    viewingKey: ViewingKey
  ): Promise<unknown> {
    const ciphertext = Buffer.from(encryptedData.ciphertext, "base64");
    const nonce = Buffer.from(encryptedData.nonce, "base64");
    const tag = Buffer.from(encryptedData.tag, "base64");

    const decipher = createDecipheriv("aes-256-gcm", viewingKey.key, nonce);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  }

  /**
   * Compute hash of data for on-chain commitment
   */
  async computeHash(data: unknown): Promise<Uint8Array> {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(data));
    return new Uint8Array(hash.digest());
  }

  private deriveKey(seed: Uint8Array, info: string): Uint8Array {
    const hash = createHash("sha256");
    hash.update(Buffer.from(seed));
    hash.update(info);
    return new Uint8Array(hash.digest());
  }
}

/**
 * Create an encryption engine instance
 */
export function createEncryptionEngine(
  config: EncryptionConfig
): EncryptionEngine {
  return new EncryptionEngine(config);
}
