import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createKageAgent,
  KageAgent,
  createClaudeProvider,
  createOpenAIProvider,
  createOllamaProvider,
  type LLMProvider,
} from "@kage/agent";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

export const PORT = process.env.PORT || 3002;

export const KAGE_PROGRAM_ID =
  process.env.KAGE_PROGRAM_ID || "ASK5m43oRE67ipfwuBbagVaiMQpFKYRTZNsvZXUfBtRp";

/**
 * Test mode: import the API module without bootstrapping (no LLM provider
 * check, no HTTP listen, no agent auto-init). Supertest-based smoke tests
 * set `KAGE_API_TEST_MODE=1` before importing the module.
 */
export const IS_TEST_MODE = process.env.KAGE_API_TEST_MODE === "1";

export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const SOLANA_NETWORK: "mainnet" | "devnet" = SOLANA_RPC_URL.includes(
  "mainnet"
)
  ? "mainnet"
  : "devnet";

// ─── LLM provider ─────────────────────────────────────────────────────────────

function buildLLMProvider(): LLMProvider {
  const providerName = (process.env.LLM_PROVIDER ?? "claude").toLowerCase();

  if (providerName === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY required when LLM_PROVIDER=openai");
      process.exit(1);
    }
    return createOpenAIProvider(apiKey, {
      baseURL: process.env.OPENAI_BASE_URL,
      fastModel: process.env.LLM_FAST_MODEL,
      thinkModel: process.env.LLM_THINK_MODEL,
    });
  }

  if (providerName === "ollama") {
    return createOllamaProvider(process.env.LLM_FAST_MODEL ?? "llama3.1");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY required when LLM_PROVIDER=claude (default)");
    process.exit(1);
  }
  return createClaudeProvider(apiKey, {
    fastModel: process.env.LLM_FAST_MODEL,
    thinkModel: process.env.LLM_THINK_MODEL,
  });
}

export const llmProvider: LLMProvider = IS_TEST_MODE
  ? ({
      name: "test",
      model: "test",
      chat: async () => ({ text: "" }),
    } as LLMProvider)
  : buildLLMProvider();

if (!IS_TEST_MODE) {
  console.log(`[Kage:API] LLM provider: ${llmProvider.name} / ${llmProvider.model}`);
  console.log(
    `[Kage:API] Using RPC: ${SOLANA_RPC_URL.replace(/api-key=[^&]+/, "api-key=***")} (${SOLANA_NETWORK})`
  );
}

// ─── Agent keypair ────────────────────────────────────────────────────────────

function loadOrCreateKeypair(): Keypair {
  const keypairPath = path.join(__dirname, "../agent-keypair.json");
  if (fs.existsSync(keypairPath)) {
    const data = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(data));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(keypairPath, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`[Kage:API] New keypair generated: ${kp.publicKey.toBase58()}`);
  return kp;
}

export const sharedKeypair = loadOrCreateKeypair();

// ─── Balance + agent singleton ────────────────────────────────────────────────

async function ensureDevnetSol(keypair: Keypair): Promise<void> {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const balance = await connection.getBalance(keypair.publicKey);
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log(
      `[Kage:API] Low balance (${balance / LAMPORTS_PER_SOL} SOL)${
        SOLANA_NETWORK === "devnet"
          ? ", requesting airdrop..."
          : " — mainnet, skipping airdrop"
      }`
    );
    if (SOLANA_NETWORK === "devnet") {
      try {
        const sig = await connection.requestAirdrop(
          keypair.publicKey,
          LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(sig);
        console.log(`[Kage:API] Airdrop successful: 1 SOL`);
      } catch {
        console.warn("[Kage:API] Airdrop failed (rate limit?), continuing without Umbra");
      }
    }
  } else {
    console.log(`[Kage:API] Agent balance: ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  }
}

let sharedAgent: KageAgent | null = null;

/**
 * Lazy singleton accessor for the Kage agent. All HTTP routes and the
 * WebSocket handler share one agent instance so memories persist across
 * connections.
 */
export async function getAgent(): Promise<KageAgent> {
  if (sharedAgent) return sharedAgent;
  await ensureDevnetSol(sharedKeypair);
  const storageBackend = (process.env.STORAGE_BACKEND ?? "memory") as
    | "memory"
    | "arweave";
  console.log(`[Kage:API] Storage backend: ${storageBackend}`);

  sharedAgent = createKageAgent(
    {
      rpcUrl: SOLANA_RPC_URL,
      programId: KAGE_PROGRAM_ID,
      ipfsGateway: "https://ipfs.io",
      umbraNetwork: SOLANA_NETWORK,
      llmProvider,
      storageBackend,
    },
    sharedKeypair
  );
  await sharedAgent.initialize();
  console.log(
    `[Kage:API] Shared agent ready: ${sharedKeypair.publicKey.toBase58()}`
  );
  return sharedAgent;
}
