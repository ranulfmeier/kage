import { describe, it, expect, beforeAll } from "vitest";
import { Keypair } from "@solana/web3.js";
import { EncryptionEngine, createEncryptionEngine } from "@kage/sdk";

describe("EncryptionEngine", () => {
  let engine: EncryptionEngine;
  let ownerKeypair: Keypair;

  beforeAll(() => {
    engine = createEncryptionEngine({ network: "devnet" });
    ownerKeypair = Keypair.generate();
  });

  describe("viewing key generation", () => {
    it("should generate viewing key from keypair", async () => {
      const viewingKey = await engine.generateViewingKey(ownerKeypair);

      expect(viewingKey.key).toBeInstanceOf(Uint8Array);
      expect(viewingKey.key.length).toBe(32);
      expect(viewingKey.publicKey.equals(ownerKeypair.publicKey)).toBe(true);
    });

    it("should generate deterministic viewing key", async () => {
      const vk1 = await engine.generateViewingKey(ownerKeypair);
      const vk2 = await engine.generateViewingKey(ownerKeypair);

      expect(Buffer.from(vk1.key).toString("hex")).toBe(
        Buffer.from(vk2.key).toString("hex")
      );
    });

    it("should generate different keys for different keypairs", async () => {
      const keypair2 = Keypair.generate();

      const vk1 = await engine.generateViewingKey(ownerKeypair);
      const vk2 = await engine.generateViewingKey(keypair2);

      expect(Buffer.from(vk1.key).toString("hex")).not.toBe(
        Buffer.from(vk2.key).toString("hex")
      );
    });
  });

  describe("encryption and decryption", () => {
    it("should encrypt and decrypt simple data", async () => {
      const viewingKey = await engine.generateViewingKey(ownerKeypair);
      const data = { message: "Hello, World!" };

      const encrypted = await engine.encrypt(data, viewingKey);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.nonce).toBeDefined();
      expect(encrypted.tag).toBeDefined();

      const decrypted = await engine.decrypt(encrypted, viewingKey);
      expect(decrypted).toEqual(data);
    });

    it("should encrypt complex nested objects", async () => {
      const viewingKey = await engine.generateViewingKey(ownerKeypair);
      const data = {
        user: {
          name: "Alice",
          preferences: {
            theme: "dark",
            notifications: true,
          },
        },
        history: [1, 2, 3],
      };

      const encrypted = await engine.encrypt(data, viewingKey);
      const decrypted = await engine.decrypt(encrypted, viewingKey);

      expect(decrypted).toEqual(data);
    });

    it("should produce different ciphertext for same data", async () => {
      const viewingKey = await engine.generateViewingKey(ownerKeypair);
      const data = { message: "Same message" };

      const encrypted1 = await engine.encrypt(data, viewingKey);
      const encrypted2 = await engine.encrypt(data, viewingKey);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);
    });

    it("should fail to decrypt with wrong viewing key", async () => {
      const viewingKey1 = await engine.generateViewingKey(ownerKeypair);
      const viewingKey2 = await engine.generateViewingKey(Keypair.generate());

      const data = { secret: "confidential" };
      const encrypted = await engine.encrypt(data, viewingKey1);

      await expect(engine.decrypt(encrypted, viewingKey2)).rejects.toThrow();
    });
  });

  describe("hashing", () => {
    it("should compute consistent hash for same data", async () => {
      const data = { key: "value" };

      const hash1 = await engine.computeHash(data);
      const hash2 = await engine.computeHash(data);

      expect(Buffer.from(hash1).toString("hex")).toBe(
        Buffer.from(hash2).toString("hex")
      );
    });

    it("should compute different hash for different data", async () => {
      const hash1 = await engine.computeHash({ a: 1 });
      const hash2 = await engine.computeHash({ a: 2 });

      expect(Buffer.from(hash1).toString("hex")).not.toBe(
        Buffer.from(hash2).toString("hex")
      );
    });

    it("should return 32-byte hash", async () => {
      const hash = await engine.computeHash("test");
      expect(hash.length).toBe(32);
    });
  });
});
