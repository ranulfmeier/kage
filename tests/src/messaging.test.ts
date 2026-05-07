import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair } from "@solana/web3.js";
import { MessagingEngine, createMessagingEngine } from "@kage/sdk";

describe("MessagingEngine", () => {
  let aliceEngine: MessagingEngine;
  let bobEngine: MessagingEngine;
  let aliceKeypair: Keypair;
  let bobKeypair: Keypair;

  beforeAll(() => {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    aliceKeypair = Keypair.generate();
    bobKeypair = Keypair.generate();
    aliceEngine = createMessagingEngine(connection, aliceKeypair);
    bobEngine = createMessagingEngine(connection, bobKeypair);
  });

  describe("X25519 key derivation", () => {
    it("should derive X25519 public key", () => {
      expect(aliceEngine.x25519PublicKey).toBeDefined();
      expect(aliceEngine.x25519PublicKey.length).toBeGreaterThan(0);
    });

    it("should produce different keys for different keypairs", () => {
      expect(aliceEngine.x25519PublicKey).not.toBe(bobEngine.x25519PublicKey);
    });
  });

  describe("end-to-end encrypted messaging", () => {
    it("should encrypt and deliver a message between agents", async () => {
      const msg = await aliceEngine.sendMessage(
        bobKeypair.publicKey,
        bobEngine.x25519PublicKey,
        { text: "Hello Bob, this is a secret!" }
      );

      expect(msg.messageId).toBeDefined();
      expect(msg.from).toBe(aliceKeypair.publicKey.toBase58());
      expect(msg.to).toBe(bobKeypair.publicKey.toBase58());
      expect(msg.encryptedContent).toBeDefined();
      expect(msg.contentHash).toBeDefined();
      expect(msg.sentAt).toBeGreaterThan(0);

      bobEngine.deliverToInbox(msg);
      const decrypted = bobEngine.receiveMessage(msg);

      expect(decrypted.text).toBe("Hello Bob, this is a secret!");
    });

    it("should handle complex message content", async () => {
      const msg = await aliceEngine.sendMessage(
        bobKeypair.publicKey,
        bobEngine.x25519PublicKey,
        {
          text: "Task delegation request",
          metadata: { taskId: "task-001", priority: "high", payload: [1, 2, 3] },
        }
      );

      bobEngine.deliverToInbox(msg);
      const decrypted = bobEngine.receiveMessage(msg);

      expect(decrypted.text).toBe("Task delegation request");
      expect(decrypted.metadata?.taskId).toBe("task-001");
      expect(decrypted.metadata?.priority).toBe("high");
    });

    it("should not decrypt with wrong key", async () => {
      const msg = await aliceEngine.sendMessage(
        bobKeypair.publicKey,
        bobEngine.x25519PublicKey,
        { text: "For Bob's eyes only" }
      );

      const eveKeypair = Keypair.generate();
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const eveEngine = createMessagingEngine(connection, eveKeypair);
      eveEngine.deliverToInbox(msg);

      expect(() => eveEngine.receiveMessage(msg)).toThrow();
    });
  });

  describe("inbox management", () => {
    it("should track unread messages", async () => {
      const freshBob = createMessagingEngine(
        new Connection("https://api.devnet.solana.com", "confirmed"),
        Keypair.generate()
      );

      const msg = await aliceEngine.sendMessage(
        bobKeypair.publicKey,
        bobEngine.x25519PublicKey,
        { text: "Unread test" }
      );

      freshBob.deliverToInbox(msg);
      const unread = freshBob.getUnreadMessages();
      expect(unread.length).toBe(1);
      expect(unread[0].read).toBe(false);
    });

    it("should not duplicate messages", async () => {
      const engine = createMessagingEngine(
        new Connection("https://api.devnet.solana.com", "confirmed"),
        Keypair.generate()
      );

      const msg = await aliceEngine.sendMessage(
        bobKeypair.publicKey,
        bobEngine.x25519PublicKey,
        { text: "Duplicate test" }
      );

      engine.deliverToInbox(msg);
      engine.deliverToInbox(msg);
      engine.deliverToInbox(msg);

      expect(engine.getInbox().length).toBe(1);
    });
  });

  describe("outbox", () => {
    it("should track sent messages", async () => {
      const sender = createMessagingEngine(
        new Connection("https://api.devnet.solana.com", "confirmed"),
        Keypair.generate()
      );

      expect(sender.getOutbox().length).toBe(0);

      await sender.sendMessage(
        bobKeypair.publicKey,
        bobEngine.x25519PublicKey,
        { text: "Outbox test" }
      );

      expect(sender.getOutbox().length).toBe(1);
    });
  });
});
