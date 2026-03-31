import { describe, it, expect, beforeAll } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  KageMemoryPlugin,
  createKageMemoryPlugin,
  KageMemoryPluginConfig,
} from "../../packages/agent/src/plugins/kage-memory.js";

describe("KageMemoryPlugin", () => {
  let plugin: KageMemoryPlugin;
  let ownerKeypair: Keypair;

  const config: KageMemoryPluginConfig = {
    rpcUrl: "https://api.devnet.solana.com",
    programId: Keypair.generate().publicKey.toBase58(),
    ipfsGateway: "https://ipfs.io",
    umbraNetwork: "devnet",
    chainMode: "local",
  };

  beforeAll(async () => {
    ownerKeypair = Keypair.generate();
    plugin = createKageMemoryPlugin(config);
    await plugin.initialize(ownerKeypair);
  });

  describe("plugin metadata", () => {
    it("should have correct name", () => {
      expect(plugin.name).toBe("kage-memory");
    });

    it("should have correct version", () => {
      expect(plugin.version).toBe("0.1.0");
    });

    it("should have description", () => {
      expect(plugin.description).toBeDefined();
    });
  });

  describe("actions", () => {
    it("should expose memory actions", () => {
      const actions = plugin.getActions();

      expect(actions.length).toBe(4);

      const actionNames = actions.map((a) => a.name);
      expect(actionNames).toContain("store_memory");
      expect(actionNames).toContain("recall_memory");
      expect(actionNames).toContain("list_memories");
      expect(actionNames).toContain("search_memories");
    });

    it("should have handlers for all actions", () => {
      const actions = plugin.getActions();

      for (const action of actions) {
        expect(typeof action.handler).toBe("function");
      }
    });
  });

  describe("store_memory action", () => {
    it("should store memory successfully", async () => {
      const result = await plugin.storeMemory({
        data: { content: "Test memory" },
        tags: ["test"],
        source: "test-suite",
        type: "conversation",
      });

      expect(result.success).toBe(true);
      expect(result.memoryId).toBeDefined();
    });

    it("should handle missing data gracefully", async () => {
      const result = await plugin.storeMemory({
        tags: ["test"],
        source: "test-suite",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("recall_memory action", () => {
    it("should recall stored memory", async () => {
      const storeResult = await plugin.storeMemory({
        data: { message: "Recall test" },
        tags: ["recall-test"],
        source: "test-suite",
      });

      const recallResult = await plugin.recallMemory({
        memoryId: storeResult.memoryId,
      });

      expect(recallResult.success).toBe(true);
      expect(recallResult.memory).toBeDefined();
      expect(recallResult.memory?.data).toEqual({ message: "Recall test" });
    });

    it("should fail without memoryId", async () => {
      const result = await plugin.recallMemory({});

      expect(result.success).toBe(false);
      expect(result.error).toContain("memoryId");
    });
  });

  describe("list_memories action", () => {
    it("should list memories", async () => {
      const result = await plugin.listMemories({});

      expect(result.success).toBe(true);
      expect(Array.isArray(result.memories)).toBe(true);
    });
  });

  describe("search_memories action", () => {
    it("should search by tags", async () => {
      await plugin.storeMemory({
        data: { searchable: true },
        tags: ["searchable", "unique-tag"],
        source: "test-suite",
      });

      const result = await plugin.searchMemories({
        tags: ["unique-tag"],
      });

      expect(result.success).toBe(true);
    });

    it("should return empty for non-matching tags", async () => {
      const result = await plugin.searchMemories({
        tags: ["nonexistent-tag-12345"],
      });

      expect(result.success).toBe(true);
      expect(result.memories?.length).toBe(0);
    });
  });
});

describe("Plugin initialization", () => {
  it("should fail operations before initialization", async () => {
    const plugin = createKageMemoryPlugin({
      rpcUrl: "https://api.devnet.solana.com",
      programId: "KAGExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      ipfsGateway: "https://ipfs.io",
      umbraNetwork: "devnet",
    });

    const result = await plugin.storeMemory({
      data: "test",
      tags: [],
      source: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not initialized");
  });
});
