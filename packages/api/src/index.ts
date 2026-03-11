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

app.get("/agent/x25519", async (_req, res) => {
  try {
    const agent = await getAgent();
    res.json({
      solanaPubkey: sharedKeypair.publicKey.toBase58(),
      x25519PublicKey: agent.getX25519PublicKey(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/inbox", async (_req, res) => {
  try {
    const agent = await getAgent();
    const messages = agent.getInbox();
    res.json({
      count: messages.length,
      unread: agent.getUnreadMessages().length,
      messages: messages.map((m) => ({
        messageId: m.messageId,
        from: m.from.slice(0, 8) + "…",
        sentAt: new Date(m.sentAt).toLocaleTimeString(),
        read: m.read,
        explorerUrl: m.explorerUrl ?? null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/groups", async (_req, res) => {
  try {
    const agent = await getAgent();
    const groups = agent.listGroups();
    res.json({
      count: groups.length,
      groups: groups.map((g) => ({
        groupId: g.group.groupId,
        creator: g.group.creator.slice(0, 8) + "…",
        threshold: g.group.threshold,
        totalMembers: g.group.members.length,
        entryCount: g.entries.length,
        hasKey: agent.hasGroupKey(g.group.groupId),
        explorerUrl: g.group.explorerUrl ?? null,
        createdAt: new Date(g.group.createdAt).toLocaleTimeString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/payments", async (_req, res) => {
  try {
    const agent = await getAgent();
    const payments = agent.getPaymentHistory();
    res.json({
      count: payments.length,
      viewingPublicKey: agent.getPaymentViewingKey(),
      payments: payments.map((p) => ({
        paymentId: p.paymentId,
        direction: p.direction,
        stealthAddress: p.stealthAddress,
        amountLamports: p.amountLamports,
        amountSol: (p.amountLamports / 1e9).toFixed(6),
        explorerUrl: p.explorerUrl ?? null,
        createdAt: new Date(p.createdAt).toLocaleTimeString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/pay", async (req, res) => {
  try {
    const { recipientPubkey, recipientViewingPub, amountLamports, memo } = req.body;
    if (!recipientPubkey || !recipientViewingPub || !amountLamports) {
      res.status(400).json({ error: "recipientPubkey, recipientViewingPub, and amountLamports are required" });
      return;
    }
    const agent = await getAgent();
    const payment = await agent.shieldedTransfer(
      recipientPubkey,
      recipientViewingPub,
      Number(amountLamports),
      memo
    );
    res.json({
      paymentId: payment.paymentId,
      stealthAddress: payment.stealthAddress,
      ephemeralPub: payment.ephemeralPub,
      amountLamports: payment.amountLamports,
      txSignature: payment.txSignature ?? null,
      explorerUrl: payment.explorerUrl ?? null,
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

      // Send encrypted message to another agent
      if (msg.type === "send_message") {
        const { recipientPubkey, recipientX25519Pub, text } = msg;
        if (!recipientPubkey || !recipientX25519Pub || !text) {
          ws.send(JSON.stringify({ type: "error", message: "recipientPubkey, recipientX25519Pub, and text are required" }));
          return;
        }
        ws.send(JSON.stringify({ type: "typing" }));
        const result = await agent.sendMessage({ recipientPubkey, recipientX25519Pub, text });
        if (result.success && result.message) {
          // If sending to self (or same agent), auto-deliver to inbox
          if (result.message.to === sharedKeypair.publicKey.toBase58()) {
            agent.deliverToInbox(result.message);
          }
          ws.send(JSON.stringify({ type: "message_sent", message: {
            messageId: result.message.messageId,
            to: result.message.to,
            sentAt: result.message.sentAt,
            explorerUrl: result.message.explorerUrl ?? null,
          }}));
        } else {
          ws.send(JSON.stringify({ type: "error", message: result.error ?? "Send failed" }));
        }
      }

      // Deliver a received message to this agent's inbox (simulates transport)
      if (msg.type === "deliver_message") {
        const { encryptedMessage } = msg;
        if (!encryptedMessage) {
          ws.send(JSON.stringify({ type: "error", message: "encryptedMessage is required" }));
          return;
        }
        agent.deliverToInbox(encryptedMessage);
        const content = agent.receiveMessage(encryptedMessage);
        ws.send(JSON.stringify({ type: "message_received", content, messageId: encryptedMessage.messageId }));
      }

      // Create a group vault
      if (msg.type === "group_create") {
        const { members, threshold } = msg;
        if (!members || !threshold) {
          ws.send(JSON.stringify({ type: "error", message: "members and threshold are required" }));
          return;
        }
        ws.send(JSON.stringify({ type: "typing" }));
        const result = await agent.createGroup(members, threshold);
        if (result.success && result.group) {
          ws.send(JSON.stringify({ type: "group_created", group: result.group, explorerUrl: result.explorerUrl ?? null }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: result.error ?? "Group creation failed" }));
        }
      }

      // Store an entry in a group vault
      if (msg.type === "group_store") {
        const { groupId, content } = msg;
        if (!groupId || content === undefined) {
          ws.send(JSON.stringify({ type: "error", message: "groupId and content are required" }));
          return;
        }
        const result = agent.storeGroupEntry(groupId, content);
        if (result.success) {
          ws.send(JSON.stringify({ type: "group_entry_stored", entryId: result.entryId, groupId }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: result.error ?? "Store failed" }));
        }
      }

      // Read all entries from a group vault
      if (msg.type === "group_read") {
        const { groupId } = msg;
        if (!groupId) {
          ws.send(JSON.stringify({ type: "error", message: "groupId is required" }));
          return;
        }
        const result = agent.readGroupEntries(groupId);
        if (result.success) {
          ws.send(JSON.stringify({ type: "group_entries", groupId, entries: result.entries }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: result.error ?? "Read failed" }));
        }
      }

      // Shielded SOL payment via stealth address
      if (msg.type === "shielded_pay") {
        const { recipientPubkey, recipientViewingPub, amountLamports, memo } = msg;
        if (!recipientPubkey || !recipientViewingPub || !amountLamports) {
          ws.send(JSON.stringify({ type: "error", message: "recipientPubkey, recipientViewingPub, and amountLamports are required" }));
          return;
        }
        ws.send(JSON.stringify({ type: "typing" }));
        const payment = await agent.shieldedTransfer(
          recipientPubkey,
          recipientViewingPub,
          Number(amountLamports),
          memo
        );
        ws.send(JSON.stringify({
          type: "payment_sent",
          payment: {
            paymentId: payment.paymentId,
            stealthAddress: payment.stealthAddress,
            ephemeralPub: payment.ephemeralPub,
            amountLamports: payment.amountLamports,
            amountSol: (payment.amountLamports / 1e9).toFixed(6),
            txSignature: payment.txSignature ?? null,
            explorerUrl: payment.explorerUrl ?? null,
          },
        }));
      }

      // Scan for incoming stealth payments
      if (msg.type === "scan_payments") {
        ws.send(JSON.stringify({ type: "typing" }));
        const results = await agent.scanForPayments(msg.limit ?? 50);
        ws.send(JSON.stringify({
          type: "scan_results",
          count: results.length,
          results: results.map((r) => ({
            paymentId: r.paymentId,
            stealthAddress: r.stealthAddress,
            ephemeralPub: r.ephemeralPub,
            amountLamports: r.amountLamports,
            amountSol: (r.amountLamports / 1e9).toFixed(6),
            txSignature: r.txSignature,
            explorerUrl: r.explorerUrl,
          })),
        }));
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
