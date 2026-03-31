import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  KageVault,
  createVault,
  MemoryType,
  MemoryStorageAdapter,
  LocalChainAdapter,
  KageConfig,
} from "@kage/sdk";

describe("KageVault", () => {
  let vault: KageVault;
  let ownerKeypair: Keypair;
  let connection: Connection;
  let config: KageConfig;

  beforeAll(async () => {
    ownerKeypair = Keypair.generate();
    connection = new Connection("https://api.devnet.solana.com", "confirmed");

    config = {
      rpcUrl: "https://api.devnet.solana.com",
      programId: Keypair.generate().publicKey,
      ipfsGateway: "https://ipfs.io",
      umbraNetwork: "devnet",
    };

    const storage = new MemoryStorageAdapter();
    const chainAdapter = new LocalChainAdapter(ownerKeypair.publicKey);
    vault = createVault(connection, config, ownerKeypair, storage, { chainAdapter });
    await vault.initialize();
  });

  describe("initialization", () => {
    it("should create vault with correct owner", () => {
      const vaultAddress = vault.getVaultAddress();
      expect(vaultAddress).toBeInstanceOf(PublicKey);
    });

    it("should derive deterministic vault PDA", () => {
      const vault2 = createVault(connection, config, ownerKeypair);
      expect(vault.getVaultAddress().equals(vault2.getVaultAddress())).toBe(true);
    });
  });

  describe("memory storage", () => {
    it("should store and recall memory", async () => {
      const testData = { message: "Hello, Kage!" };
      const metadata = {
        tags: ["test", "greeting"],
        source: "test-suite",
      };

      const storeResult = await vault.storeMemory(
        testData,
        metadata,
        MemoryType.Conversation
      );

      expect(storeResult.cid).toBeDefined();
      expect(storeResult.memoryId).toBeDefined();
      expect(storeResult.txSignature).toBeDefined();

      const recalled = await vault.recallMemory(storeResult.cid);
      expect(recalled.data).toEqual(testData);
      expect(recalled.metadata.tags).toEqual(metadata.tags);
    });
  });

  describe("encryption and off-chain storage", () => {
    it("should encrypt, upload, and recall via storage adapter", async () => {
      const storage = new MemoryStorageAdapter();
      const { createEncryptionEngine } = await import("@kage/sdk");
      const encryption = createEncryptionEngine({ network: "devnet" });
      const vk = await encryption.generateViewingKey(ownerKeypair);

      const data = { secret: "my-secret-password" };
      const encrypted = await encryption.encrypt(data, vk);
      const cid = await storage.upload(encrypted);

      expect(cid).toBeDefined();

      const downloaded = await storage.download(cid);
      const decrypted = await encryption.decrypt(downloaded, vk);
      expect(decrypted).toEqual(data);
    });

    it("should fail to decrypt with wrong viewing key", async () => {
      const storage = new MemoryStorageAdapter();
      const { createEncryptionEngine } = await import("@kage/sdk");
      const encryption = createEncryptionEngine({ network: "devnet" });

      const vk1 = await encryption.generateViewingKey(ownerKeypair);
      const vk2 = await encryption.generateViewingKey(Keypair.generate());

      const encrypted = await encryption.encrypt({ data: "sensitive" }, vk1);
      const cid = await storage.upload(encrypted);
      const downloaded = await storage.download(cid);

      await expect(encryption.decrypt(downloaded, vk2)).rejects.toThrow();
    });
  });

  describe("access control", () => {
    it("should derive access grant PDA for grantee", () => {
      const grantee = Keypair.generate().publicKey;
      const accessPda = vault.getAccessGrantAddress(grantee);
      expect(accessPda).toBeInstanceOf(PublicKey);
    });

    it("should derive different PDAs for different grantees", () => {
      const grantee1 = Keypair.generate().publicKey;
      const grantee2 = Keypair.generate().publicKey;

      const pda1 = vault.getAccessGrantAddress(grantee1);
      const pda2 = vault.getAccessGrantAddress(grantee2);

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe("memory listing", () => {
    it("should return empty list for new vault", async () => {
      const newKeypair = Keypair.generate();
      const newChainAdapter = new LocalChainAdapter(newKeypair.publicKey);
      const newVault = createVault(
        connection,
        config,
        newKeypair,
        new MemoryStorageAdapter(),
        { chainAdapter: newChainAdapter }
      );
      await newVault.initialize();

      const memories = await newVault.listMemories();
      expect(memories).toEqual([]);
    });
  });
});
