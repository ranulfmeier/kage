import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createKageAgent, KageAgent } from "@kage/agent";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3002;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const KAGE_PROGRAM_ID =
  process.env.KAGE_PROGRAM_ID || "AK3B3weUT97hm2Dzx2zLfgVBxZNPkxfSxPYEjkX8HcaS";

if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}

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

async function ensureDevnetSol(keypair: Keypair): Promise<void> {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const balance = await connection.getBalance(keypair.publicKey);
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log(`[Kage:API] Low balance (${balance / LAMPORTS_PER_SOL} SOL), requesting airdrop...`);
    try {
      const sig = await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
      console.log(`[Kage:API] Airdrop successful: 1 SOL`);
    } catch {
      console.warn("[Kage:API] Airdrop failed (rate limit?), continuing without Umbra");
    }
  } else {
    console.log(`[Kage:API] Agent balance: ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  }
}

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: "kage" });
});

app.get("/memories", async (_req, res) => {
  try {
    const agent = await getAgent();
    const memories = await agent.listMemories();
    console.log(`[Kage:API] GET /memories → ${memories.length} item(s)`);
    res.json({
      count: memories.length,
      memories: memories.map((m, i) => ({
        index: i + 1,
        id: m.cid.slice(0, 16) + "…",
        type: m.memoryType,
        time: new Date(m.createdAt).toLocaleTimeString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/tasks", async (_req, res) => {
  try {
    const agent = await getAgent();
    const tasks = agent.listTasks();
    res.json({
      count: tasks.length,
      tasks: tasks.map((t) => ({
        taskId: t.taskId,
        from: t.from.slice(0, 8) + "…",
        to: t.to.slice(0, 8) + "…",
        status: t.status,
        explorerUrl: t.explorerUrl ?? null,
        createdAt: new Date(t.createdAt).toLocaleTimeString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Single shared agent — persists across all WebSocket connections
const sharedKeypair = loadOrCreateKeypair();
let sharedAgent: KageAgent | null = null;

async function getAgent(): Promise<KageAgent> {
  if (sharedAgent) return sharedAgent;
  await ensureDevnetSol(sharedKeypair);
  sharedAgent = createKageAgent(
    {
      rpcUrl: "https://api.devnet.solana.com",
      programId: KAGE_PROGRAM_ID,
      ipfsGateway: "https://ipfs.io",
      umbraNetwork: "devnet",
      anthropicApiKey: ANTHROPIC_API_KEY,
      model: "claude-haiku-4-5-20251001",
    },
    sharedKeypair
  );
  await sharedAgent.initialize();
  console.log(`[Kage:API] Shared agent ready: ${sharedKeypair.publicKey.toBase58()}`);
  return sharedAgent;
}

// Pre-initialize agent on startup
getAgent().catch((err) => console.error("[Kage:API] Agent init failed:", err));

wss.on("connection", async (ws: WebSocket) => {
  console.log("[Kage:API] New WebSocket connection");

  let agent: KageAgent;
  try {
    agent = await getAgent();
  } catch (err) {
    ws.send(JSON.stringify({ type: "error", message: "Agent initialization failed" }));
    ws.close();
    return;
  }

  // Fresh conversation for each new connection, memories persist
  agent.clearHistory();

  ws.send(
    JSON.stringify({
      type: "connected",
      agentId: sharedKeypair.publicKey.toBase58(),
      message: `Kage agent ready.`,
    })
  );

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "chat") {
        const userText: string = msg.text?.trim() || "";
        if (!userText) return;

        if (userText === "/memories") {
          const memories = await agent.listMemories();
          console.log(`[Kage:API] listMemories returned ${memories.length} item(s)`);
          ws.send(
            JSON.stringify({
              type: "memories",
              memories: memories.map((m, i) => ({
                index: i + 1,
                id: m.cid.slice(0, 16) + "…",
                type: m.memoryType,
                time: new Date(m.createdAt).toLocaleTimeString(),
              })),
            })
          );
          return;
        }

        ws.send(JSON.stringify({ type: "typing" }));

        const response = await agent.chat(userText);

        console.log(`[Kage:API] chat response proof:`, JSON.stringify(response.proof));

        ws.send(
          JSON.stringify({
            type: "message",
            role: "assistant",
            text: response.text,
            proof: response.proof ?? null,
          })
        );
      }

      // Programmatic task delegation
      if (msg.type === "delegate") {
        const { recipientPubkey, instruction, context } = msg;
        if (!recipientPubkey || !instruction) {
          ws.send(JSON.stringify({ type: "error", message: "recipientPubkey and instruction are required" }));
          return;
        }

        ws.send(JSON.stringify({ type: "typing" }));

        const result = await agent.delegateTask({ recipientPubkey, instruction, context });

        if (result.success && result.task) {
          ws.send(JSON.stringify({
            type: "task_created",
            task: {
              taskId: result.task.taskId,
              from: result.task.from,
              to: result.task.to,
              status: result.task.status,
              txSignature: result.task.txSignature ?? null,
              explorerUrl: result.task.explorerUrl ?? null,
              createdAt: result.task.createdAt,
            },
          }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: result.error ?? "Delegation failed" }));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      ws.send(JSON.stringify({ type: "error", message }));
    }
  });

  ws.on("close", () => {
    console.log("[Kage:API] Connection closed");
  });
});

httpServer.listen(PORT, () => {
  console.log(`[Kage:API] Server running on http://localhost:${PORT}`);
  console.log(`[Kage:API] WebSocket ready on ws://localhost:${PORT}`);
});
