/**
 * Kage Agent Interactive Chat
 * Run: npx tsx chat.ts
 */
import { Keypair } from "@solana/web3.js";
import * as readline from "readline";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { KageAgent, createKageAgent } from "./src/index.js";

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const RED    = "\x1b[31m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const WHITE  = "\x1b[37m";

function print(text: string) { process.stdout.write(text + "\n"); }
function clear() { process.stdout.write("\x1b[2J\x1b[H"); }

async function main() {
  clear();

  print(`${BOLD}${WHITE}`);
  print(`  影  KAGE — Shadow Memory Protocol`);
  print(`${DIM}  Privacy-first AI agent with encrypted memory${RESET}`);
  print(`${DIM}  ─────────────────────────────────────────────${RESET}`);
  print("");

  // Load keypair
  const keyfilePath = join(homedir(), ".config", "solana", "id.json");
  let keypair: Keypair;
  try {
    const keyfileData = JSON.parse(readFileSync(keyfilePath, "utf-8")) as number[];
    keypair = Keypair.fromSecretKey(Uint8Array.from(keyfileData));
  } catch {
    keypair = Keypair.generate();
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    print(`${RED}Error: ANTHROPIC_API_KEY not set in environment.${RESET}`);
    print(`Run: export ANTHROPIC_API_KEY=your-key-here`);
    process.exit(1);
  }

  print(`${DIM}  Wallet : ${keypair.publicKey.toBase58()}${RESET}`);
  print(`${DIM}  Network: devnet${RESET}`);
  print(`${DIM}  Model  : claude-haiku-4-5-20251001${RESET}`);
  print("");

  // Initialize agent
  process.stdout.write(`${YELLOW}  Initializing agent...${RESET}`);
  const agent = createKageAgent(
    {
      rpcUrl: "https://api.devnet.solana.com",
      programId: "AK3B3weUT97hm2Dzx2zLfgVBxZNPkxfSxPYEjkX8HcaS",
      ipfsGateway: "https://ipfs.io",
      umbraNetwork: "devnet",
      anthropicApiKey: apiKey,
      model: "claude-haiku-4-5-20251001",
    },
    keypair
  );

  await agent.initialize();
  process.stdout.write(`\r${GREEN}  Agent ready.${RESET}              \n`);
  print("");
  print(`${DIM}  Type your message. Commands: ${CYAN}/memories${DIM}, ${CYAN}/clear${DIM}, ${CYAN}/exit${DIM}${RESET}`);
  print(`${DIM}  ─────────────────────────────────────────────${RESET}`);
  print("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const prompt = () => {
    rl.question(`${CYAN}  You  ${RESET}`, async (input) => {
      const text = input.trim();

      if (!text) { prompt(); return; }

      if (text === "/exit" || text === "/quit") {
        print(`\n${DIM}  Memories encrypted. Session ended.${RESET}\n`);
        rl.close();
        process.exit(0);
      }

      if (text === "/clear") {
        clear();
        print(`${BOLD}${WHITE}  影  KAGE — Shadow Memory Protocol${RESET}\n`);
        prompt();
        return;
      }

      if (text === "/memories") {
        try {
          const memories = await agent.listMemories();
          print("");
          if (memories.length === 0) {
            print(`${DIM}  No memories stored yet.${RESET}`);
          } else {
            print(`${DIM}  Stored memories (${memories.length}):${RESET}`);
            memories.forEach((m, i) => {
              const label = m.cid.slice(0, 16) + "…";
              const time = new Date(m.createdAt).toLocaleTimeString();
              print(`${DIM}  ${i + 1}. [${m.memoryType}] ${label}  ${time}${RESET}`);
            });
          }
          print("");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          print(`${RED}  Failed to list memories: ${msg}${RESET}\n`);
        }
        prompt();
        return;
      }

      print("");
      process.stdout.write(`${YELLOW}  Kage ${RESET}`);

      try {
        const response = await agent.chat(text);
        process.stdout.write(`\r${GREEN}  Kage ${RESET}${response}\n\n`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(`\r${RED}  Error: ${msg}${RESET}\n\n`);
      }

      prompt();
    });
  };

  prompt();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
