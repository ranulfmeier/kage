import { describe, it, expect, beforeEach, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { ArweaveStorageAdapter } from "@kage/sdk";
import type { EncryptedData } from "@kage/sdk";

// Note on scope: ArweaveStorageAdapter.upload() does a dynamic
// import("@irys/sdk") inside the prebuilt SDK module, which can't be
// reliably intercepted from a workspace consumer. We exercise that path
// in a separate live-network integration test (devnet uploads are free).
// These tests cover the deterministic, network-free surface area:
// gateway URL selection, the StorageAdapter contract on download(), and
// error propagation when the gateway returns non-200.

const sampleEncrypted: EncryptedData = {
  ciphertext: "deadbeef",
  iv: "010203",
  tag: "ffeeddcc",
  algorithm: "AES-256-GCM",
};

describe("ArweaveStorageAdapter", () => {
  let keypair: Keypair;

  beforeEach(() => {
    keypair = Keypair.generate();
  });

  describe("gateway selection", () => {
    it("defaults to the Irys devnet gateway when no network is provided", () => {
      const adapter = new ArweaveStorageAdapter({
        keypair,
        rpcUrl: "https://api.devnet.solana.com",
      });

      expect(adapter.networkName).toBe("devnet");
      expect(adapter.getUrl("abc123")).toBe("https://gateway.irys.xyz/abc123");
    });

    it("uses the arweave.net gateway when network is mainnet", () => {
      const adapter = new ArweaveStorageAdapter({
        keypair,
        rpcUrl: "https://api.mainnet-beta.solana.com",
        network: "mainnet",
      });

      expect(adapter.networkName).toBe("mainnet");
      expect(adapter.getUrl("xyz789")).toBe("https://arweave.net/xyz789");
    });

    it("getUrl is a pure string concatenation — different IDs produce different URLs", () => {
      const adapter = new ArweaveStorageAdapter({
        keypair,
        rpcUrl: "https://api.devnet.solana.com",
      });

      expect(adapter.getUrl("a")).not.toBe(adapter.getUrl("b"));
      expect(adapter.getUrl("a")).toMatch(/\/a$/);
    });
  });

  describe("download()", () => {
    it("fetches from the gateway and parses the JSON envelope", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(sampleEncrypted), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const adapter = new ArweaveStorageAdapter({
        keypair,
        rpcUrl: "https://api.devnet.solana.com",
      });

      const result = await adapter.download("tx-fetched");

      expect(result).toEqual(sampleEncrypted);
      expect(fetchSpy).toHaveBeenCalledWith("https://gateway.irys.xyz/tx-fetched");

      fetchSpy.mockRestore();
    });

    it("hits the mainnet gateway when configured for mainnet", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(sampleEncrypted), { status: 200 }),
      );

      const adapter = new ArweaveStorageAdapter({
        keypair,
        rpcUrl: "https://api.mainnet-beta.solana.com",
        network: "mainnet",
      });

      await adapter.download("tx-mainnet");

      expect(fetchSpy).toHaveBeenCalledWith("https://arweave.net/tx-mainnet");

      fetchSpy.mockRestore();
    });

    it("throws a descriptive error on non-200 responses", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("not found", { status: 404, statusText: "Not Found" }),
      );

      const adapter = new ArweaveStorageAdapter({
        keypair,
        rpcUrl: "https://api.devnet.solana.com",
      });

      await expect(adapter.download("missing-tx")).rejects.toThrow(
        /missing-tx.*404.*Not Found/,
      );

      fetchSpy.mockRestore();
    });

    it("propagates network errors from fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new TypeError("fetch failed: ECONNREFUSED"),
      );

      const adapter = new ArweaveStorageAdapter({
        keypair,
        rpcUrl: "https://api.devnet.solana.com",
      });

      await expect(adapter.download("any-tx")).rejects.toThrow("fetch failed");

      fetchSpy.mockRestore();
    });
  });
});
