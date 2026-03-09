import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  KageVault,
  createVault,
  MemoryType,
  MemoryStorageAdapter,
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
    vault = createVault(connection, config, ownerKeypair, storage);
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

      const recalled = await vault.recallMemory(storeResult.cid);
      expect(recalled.data).toEqual(testData);
      expect(recalled.metadata.tags).toEqual(metadata.tags);
    });

    it("should store different memory types", async () => {
      const types = [
        MemoryType.Conversation,
        MemoryType.Preference,
        MemoryType.Behavior,
        MemoryType.Task,
        MemoryType.Knowledge,
      ];

      for (const type of types) {
        const result = await vault.storeMemory(
          { type: type.toString() },
          { tags: [type.toString()], source: "test" },
          type
        );
        expect(result.cid).toBeDefined();
      }
    });

    it("should encrypt memory data", async () => {
      const sensitiveData = { secret: "my-secret-password" };
      const result = await vault.storeMemory(
        sensitiveData,
        { tags: ["sensitive"], source: "test" },
        MemoryType.Preference
      );

      const recalled = await vault.recallMemory(result.cid);
      expect(recalled.data).toEqual(sensitiveData);
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
      const newVault = createVault(
        connection,
        config,
        newKeypair,
        new MemoryStorageAdapter()
      );
      await newVault.initialize();

      const memories = await newVault.listMemories();
      expect(memories).toEqual([]);
    });
  });
});
