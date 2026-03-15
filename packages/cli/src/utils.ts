import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Keypair } from "@solana/web3.js";
import { createKageAgent, createClaudeProvider } from "@kage/agent";
import chalk from "chalk";

export const CONFIG_DIR = join(homedir(), ".kage");
export const KEYPAIR_PATH = join(CONFIG_DIR, "keypair.json");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export interface KageConfig {
  rpcUrl: string;
  programId: string;
  network: "devnet" | "mainnet";
  model: string;
  storageBackend: "memory" | "arweave";
}

const DEFAULT_CONFIG: KageConfig = {
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  programId: process.env.KAGE_PROGRAM_ID || "PRDZsFBacoRGLW5bBumh4Wi42hv8N72akYcWhDgvt9s",
  network: "devnet",
  model: "claude-haiku-4-5-20251001",
  storageBackend: (process.env.STORAGE_BACKEND as "memory" | "arweave") ?? "memory",
};

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): KageConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<KageConfig>): void {
  ensureConfigDir();
  const current = loadConfig();
  writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...config }, null, 2));
}

export function loadOrCreateKeypair(): Keypair {
  ensureConfigDir();
  if (existsSync(KEYPAIR_PATH)) {
    const raw = JSON.parse(readFileSync(KEYPAIR_PATH, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(kp.secretKey)));
  console.log(chalk.yellow(`  New keypair generated: ${kp.publicKey.toBase58()}`));
  console.log(chalk.gray(`  Saved to: ${KEYPAIR_PATH}`));
  return kp;
}

export async function loadAgent(ora?: { text: string; start(): void; fail(msg: string): void }) {
  const config = loadConfig();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(chalk.red("  ANTHROPIC_API_KEY environment variable is required."));
    console.error(chalk.gray("  Export it: export ANTHROPIC_API_KEY=sk-ant-..."));
    process.exit(1);
  }

  const keypair = loadOrCreateKeypair();
  const llmProvider = createClaudeProvider(apiKey, { fastModel: config.model });
  const agent = createKageAgent(
    {
      rpcUrl: config.rpcUrl,
      programId: config.programId,
      ipfsGateway: "https://ipfs.io",
      umbraNetwork: config.network,
      llmProvider,
      storageBackend: config.storageBackend,
    },
    keypair
  );

  await agent.initialize();
  return { agent, keypair, config };
}

export function printHeader() {
  console.log(chalk.bold("\n影  KAGE — Privacy-first AI Agent\n"));
}

export function printSolscan(txSig?: string, network = "devnet") {
  if (txSig) {
    console.log(
      chalk.gray("  ↳ Solscan: ") +
        chalk.cyan(`https://solscan.io/tx/${txSig}?cluster=${network}`)
    );
  }
}

export function shortKey(key: string, len = 12): string {
  return key.length > len * 2 + 3 ? `${key.slice(0, len)}…${key.slice(-len)}` : key;
}
