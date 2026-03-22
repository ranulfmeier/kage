import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createKageAgent,
  KageAgent,
  createClaudeProvider,
  createOpenAIProvider,
  createOllamaProvider,
  type LLMProvider,
} from "@kage/agent";
import { ZKCommitmentEngine, ProverClient } from "@kage/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3002;
const KAGE_PROGRAM_ID =
  process.env.KAGE_PROGRAM_ID || "ASK5m43oRE67ipfwuBbagVaiMQpFKYRTZNsvZXUfBtRp";

function buildLLMProvider(): LLMProvider {
  const providerName = (process.env.LLM_PROVIDER ?? "claude").toLowerCase();

  if (providerName === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) { console.error("OPENAI_API_KEY required when LLM_PROVIDER=openai"); process.exit(1); }
    return createOpenAIProvider(apiKey, {
      baseURL: process.env.OPENAI_BASE_URL,
      fastModel: process.env.LLM_FAST_MODEL,
      thinkModel: process.env.LLM_THINK_MODEL,
    });
  }

  if (providerName === "ollama") {
    return createOllamaProvider(process.env.LLM_FAST_MODEL ?? "llama3.1");
  }

  // Default: Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("ANTHROPIC_API_KEY required when LLM_PROVIDER=claude (default)"); process.exit(1); }
  return createClaudeProvider(apiKey, {
    fastModel: process.env.LLM_FAST_MODEL,
    thinkModel: process.env.LLM_THINK_MODEL,
  });
}

const llmProvider = buildLLMProvider();
console.log(`[Kage:API] LLM provider: ${llmProvider.name} / ${llmProvider.model}`);

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

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const SOLANA_NETWORK: "mainnet" | "devnet" = SOLANA_RPC_URL.includes("mainnet") ? "mainnet" : "devnet";
console.log(`[Kage:API] Using RPC: ${SOLANA_RPC_URL.replace(/api-key=[^&]+/, "api-key=***")} (${SOLANA_NETWORK})`);

async function ensureDevnetSol(keypair: Keypair): Promise<void> {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const balance = await connection.getBalance(keypair.publicKey);
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log(`[Kage:API] Low balance (${balance / LAMPORTS_PER_SOL} SOL)${SOLANA_NETWORK === "devnet" ? ", requesting airdrop..." : " — mainnet, skipping airdrop"}`);
    if (SOLANA_NETWORK === "devnet") {
      try {
        const sig = await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL);
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

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

app.get("/health", (_req, res) => {
  const engine = getZKEngine();
  const commitments = engine.listCommitments();
  res.json({
    status: "ok",
    agent: "kage",
    llm: { provider: llmProvider.name, model: llmProvider.model },
    zk: {
      engine: "sp1-v6.0.2",
      mode: "hash-commitment + offline-proof",
      commitments: commitments.length,
    },
  });
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

app.get("/reasoning", async (_req, res) => {
  try {
    const agent = await getAgent();
    const traces = agent.getAllReasoningTraces();
    res.json({
      count: traces.length,
      traces: traces.map((t) => ({
        traceId: t.traceId,
        charCount: t.charCount,
        contentHash: t.contentHash,
        txSignature: t.txSignature ?? null,
        explorerUrl: t.explorerUrl ?? null,
        createdAt: new Date(t.createdAt).toLocaleTimeString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/reasoning/:traceId/reveal", async (req, res) => {
  try {
    const { traceId } = req.params;
    const { auditKey } = req.body;
    const agent = await getAgent();
    const result = auditKey
      ? agent.revealReasoningWithAuditKey(traceId, auditKey)
      : agent.revealReasoning(traceId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get("/reasoning/audit-key", async (_req, res) => {
  try {
    const agent = await getAgent();
    const key = agent.exportReasoningAuditKey();
    res.json({ auditKey: key });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Reputation Endpoints ───────────────────────────────────────────────────────

app.get("/reputation", async (_req, res) => {
  try {
    const agent = await getAgent();
    const rep = agent.getSelfReputation();
    res.json({ reputation: rep ?? null, successRate: agent.getSuccessRate() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/reputation/leaderboard", async (_req, res) => {
  try {
    const agent = await getAgent();
    res.json({ leaderboard: agent.getLeaderboard() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/reputation/task", async (req, res) => {
  try {
    const agent = await getAgent();
    const { outcome, description, agentDID } = req.body;
    if (!outcome) return res.status(400).json({ error: "outcome is required" });
    const event = await agent.recordTask({ outcome, description, agentDID });
    const rep = agent.getSelfReputation();
    res.json({ event, reputation: rep });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/reputation/slash", async (req, res) => {
  try {
    const agent = await getAgent();
    const { reason, agentDID } = req.body;
    if (!reason) return res.status(400).json({ error: "reason is required" });
    const event = await agent.slash({ reason, agentDID });
    const rep = agent.getSelfReputation();
    res.json({ event, reputation: rep });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/reputation/snapshot", async (_req, res) => {
  try {
    const agent = await getAgent();
    const snapshot = await agent.commitReputationSnapshot();
    res.json({ snapshot });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Team Vault Endpoints ───────────────────────────────────────────────────────

app.get("/team", async (_req, res) => {
  try {
    const agent = await getAgent();
    res.json({ teams: agent.listTeams() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/team/create", async (req, res) => {
  try {
    const agent = await getAgent();
    const { name, description, members, threshold } = req.body as {
      name: string;
      description?: string;
      members?: Array<{ publicKey: string; x25519PublicKey: string; role: "owner" | "admin" | "member"; displayName?: string }>;
      threshold?: number;
    };
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const team = await agent.createTeam({ name, description, members, threshold });
    res.json({ team });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/team/:teamId/invite", async (req, res) => {
  try {
    const agent = await getAgent();
    const { teamId } = req.params;
    const { publicKey, x25519PublicKey, role, displayName } = req.body;
    if (!publicKey || !x25519PublicKey) { res.status(400).json({ error: "publicKey and x25519PublicKey required" }); return; }
    const team = await agent.inviteTeamMember(teamId, { publicKey, x25519PublicKey, role: role ?? "member", displayName });
    res.json({ team });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/team/:teamId/remove", async (req, res) => {
  try {
    const agent = await getAgent();
    const { teamId } = req.params;
    const { memberPubkey } = req.body;
    if (!memberPubkey) { res.status(400).json({ error: "memberPubkey required" }); return; }
    const team = await agent.removeTeamMember(teamId, memberPubkey);
    res.json({ team });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/team/:teamId/secret", async (req, res) => {
  try {
    const agent = await getAgent();
    const { teamId } = req.params;
    const { label, description, data } = req.body;
    if (!label || data === undefined) { res.status(400).json({ error: "label and data required" }); return; }
    const secret = await agent.storeTeamSecret(teamId, { label, description, data });
    res.json({ secret });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/team/:teamId/secret/:secretId", async (req, res) => {
  try {
    const agent = await getAgent();
    const { teamId, secretId } = req.params;
    const result = agent.retrieveTeamSecret(teamId, secretId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/team/:teamId", async (req, res) => {
  try {
    const agent = await getAgent();
    const team = agent.getTeam(req.params.teamId);
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }
    res.json({ team });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── DID Endpoints ─────────────────────────────────────────────────────────────

app.get("/did", async (_req, res) => {
  try {
    const agent = await getAgent();
    const document = agent.getSelfDIDDocument();
    const did = agent.getSelfDID();
    res.json({ did, document: document ?? null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/did/credentials", async (_req, res) => {
  try {
    const agent = await getAgent();
    const credentials = agent.getDIDCredentials();
    res.json({ count: credentials.length, credentials });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/did/credential/issue", async (req, res) => {
  try {
    const agent = await getAgent();
    const { subjectDID, type, claim, expiresInMs } = req.body;
    if (!subjectDID || !type || !claim) {
      return res.status(400).json({ error: "subjectDID, type, and claim are required" });
    }
    const credential = await agent.issueCredential({ subjectDID, type, claim, expiresInMs });
    res.json({ credential });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/did/credential/verify", async (req, res) => {
  try {
    const agent = await getAgent();
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "credential is required" });
    const result = agent.verifyCredential(credential);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/did/resolve", async (req, res) => {
  try {
    const agent = await getAgent();
    const { did } = req.body;
    if (!did) return res.status(400).json({ error: "did is required" });
    const resolution = await agent.resolveDID(did);
    res.json({ resolution });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── ZK Commitment Endpoints ───────────────────────────────────────────────────

let zkEngine: ZKCommitmentEngine | null = null;
const PROVER_SERVICE_URL = process.env.PROVER_SERVICE_URL || "http://localhost:3080";
const PROVER_API_KEY = process.env.PROVER_API_KEY || undefined;

function getZKEngine(): ZKCommitmentEngine {
  if (!zkEngine) {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    zkEngine = new ZKCommitmentEngine(
      connection,
      sharedKeypair,
      PROVER_SERVICE_URL,
      PROVER_API_KEY
    );
  }
  return zkEngine;
}

app.post("/zk/commit/reputation", async (req, res) => {
  try {
    const { agentDID, events, claimedScore } = req.body;
    if (!agentDID || !events || claimedScore === undefined) {
      res.status(400).json({ error: "agentDID, events, and claimedScore are required" });
      return;
    }
    const engine = getZKEngine();
    const commitment = await engine.commitReputation({ agentDID, events, claimedScore });
    console.log(`[Kage:ZK] Reputation commitment ${commitment.id} → tx: ${commitment.txSignature ?? "pending"}`);
    res.json({ commitment });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/zk/commit/memory", async (req, res) => {
  try {
    const { agentDID, ciphertextHash, storedAt, memoryType } = req.body;
    if (!agentDID || !ciphertextHash || !storedAt || !memoryType) {
      res.status(400).json({ error: "agentDID, ciphertextHash, storedAt, and memoryType are required" });
      return;
    }
    const engine = getZKEngine();
    const commitment = await engine.commitMemory({ agentDID, ciphertextHash, storedAt, memoryType });
    console.log(`[Kage:ZK] Memory commitment ${commitment.id} → tx: ${commitment.txSignature ?? "pending"}`);
    res.json({ commitment });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/zk/commit/task", async (req, res) => {
  try {
    const { taskId, instructionHash, resultHash, outcome, executorDID, completedAt } = req.body;
    if (!taskId || !instructionHash || !resultHash || !outcome || !executorDID) {
      res.status(400).json({ error: "taskId, instructionHash, resultHash, outcome, and executorDID are required" });
      return;
    }
    const engine = getZKEngine();
    const commitment = await engine.commitTask({
      taskId, instructionHash, resultHash, outcome, executorDID,
      completedAt: completedAt ?? Date.now(),
    });
    console.log(`[Kage:ZK] Task commitment ${commitment.id} → tx: ${commitment.txSignature ?? "pending"}`);
    res.json({ commitment });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/zk/commitments", async (req, res) => {
  try {
    const engine = getZKEngine();
    const filters: Record<string, string> = {};
    if (req.query.agentDID) filters.agentDID = req.query.agentDID as string;
    if (req.query.proofType) filters.proofType = req.query.proofType as string;
    if (req.query.status) filters.status = req.query.status as string;
    const commitments = engine.listCommitments(filters as any);
    res.json({ count: commitments.length, commitments });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/zk/commitment/:id", async (req, res) => {
  try {
    const engine = getZKEngine();
    const commitment = engine.getCommitment(req.params.id);
    if (!commitment) { res.status(404).json({ error: "Commitment not found" }); return; }
    res.json({ commitment });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/zk/verify/:id", async (req, res) => {
  try {
    const engine = getZKEngine();
    const result = engine.verifyCommitment(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/zk/mark-proved/:id", async (req, res) => {
  try {
    const { vkey } = req.body;
    if (!vkey) { res.status(400).json({ error: "vkey is required" }); return; }
    const engine = getZKEngine();
    const success = engine.markProved(req.params.id, vkey);
    if (!success) { res.status(404).json({ error: "Commitment not found" }); return; }
    res.json({ success: true, commitment: engine.getCommitment(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Prover Service Endpoints ────────────────────────────────────────────────

app.get("/zk/prover/health", async (_req, res) => {
  try {
    const engine = getZKEngine();
    const available = await engine.isProverAvailable();
    if (!available) {
      res.json({ available: false, message: "Prover service not reachable" });
      return;
    }
    const prover = new ProverClient(PROVER_SERVICE_URL, PROVER_API_KEY);
    const health = await prover.health();
    res.json({ available: true, ...health });
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

app.post("/zk/prove/:id", async (req, res) => {
  try {
    const engine = getZKEngine();
    const commitment = engine.getCommitment(req.params.id);
    if (!commitment) {
      res.status(404).json({ error: "Commitment not found" });
      return;
    }
    const record = await engine.requestProof(req.params.id);
    console.log(`[Kage:ZK] Proof requested for ${req.params.id} → prover id: ${record.proof_id}`);
    res.json({ commitment: engine.getCommitment(req.params.id), proof: record });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/zk/prove/:id/status", async (req, res) => {
  try {
    const engine = getZKEngine();
    const commitment = engine.getCommitment(req.params.id);
    if (!commitment) {
      res.status(404).json({ error: "Commitment not found" });
      return;
    }
    if (!commitment.proofRequestId) {
      res.json({ status: "no_proof_requested", commitment });
      return;
    }
    const record = await engine.checkProofStatus(req.params.id);
    res.json({ commitment: engine.getCommitment(req.params.id), proof: record });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/zk/verify-onchain/:id", async (req, res) => {
  try {
    const engine = getZKEngine();
    const commitment = engine.getCommitment(req.params.id);
    if (!commitment) {
      res.status(404).json({ error: "Commitment not found" });
      return;
    }
    const result = await engine.verifyOnChain(req.params.id);
    console.log(
      `[Kage:ZK] On-chain verification for ${req.params.id} → tx: ${result.txSignature}`
    );
    res.json({
      success: true,
      commitment: engine.getCommitment(req.params.id),
      verification: result,
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
  const storageBackend = (process.env.STORAGE_BACKEND ?? "memory") as "memory" | "arweave";
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

  // Per-connection Deep Think mode state
  let deepThinkEnabled = false;

  ws.send(
    JSON.stringify({
      type: "connected",
      agentId: sharedKeypair.publicKey.toBase58(),
      message: `Kage agent ready.`,
      deepThink: deepThinkEnabled,
    })
  );

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Toggle Deep Think mode
      if (msg.type === "toggle_deep_think") {
        deepThinkEnabled = typeof msg.enabled === "boolean" ? msg.enabled : !deepThinkEnabled;
        ws.send(JSON.stringify({ type: "deep_think_status", enabled: deepThinkEnabled }));
        console.log(`[Kage:API] Deep Think mode: ${deepThinkEnabled ? "ON" : "OFF"}`);
        return;
      }

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

        ws.send(JSON.stringify({ type: "typing", deepThink: deepThinkEnabled }));

        const response = await agent.chat(userText, deepThinkEnabled);

        console.log(`[Kage:API] chat response proof:`, JSON.stringify(response.proof));

        // Stream reasoning steps with staggered delay for UI animation
        if (response.reasoningSteps && response.reasoningSteps.length > 0) {
          for (const step of response.reasoningSteps) {
            ws.send(JSON.stringify({ type: "reasoning_step", content: step }));
            await new Promise<void>((r) => setTimeout(r, 650));
          }
        }

        ws.send(
          JSON.stringify({
            type: "message",
            role: "assistant",
            text: response.text,
            proof: response.proof ?? null,
            reasoning: response.reasoning ?? null,
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

      // Reputation handlers
      if (msg.type === "rep_get") {
        const rep = agent.getSelfReputation();
        ws.send(JSON.stringify({
          type: "reputation",
          reputation: rep ?? null,
          successRate: agent.getSuccessRate(),
          leaderboard: agent.getLeaderboard(),
        }));
      }

      if (msg.type === "rep_record_task") {
        const { outcome, description, agentDID } = msg;
        if (!outcome) {
          ws.send(JSON.stringify({ type: "error", message: "outcome is required" }));
          return;
        }
        try {
          const event = await agent.recordTask({ outcome, description, agentDID });
          const rep = agent.getSelfReputation();
          ws.send(JSON.stringify({ type: "reputation_updated", event, reputation: rep }));
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
        }
      }

      if (msg.type === "rep_slash") {
        const { reason, agentDID } = msg;
        if (!reason) {
          ws.send(JSON.stringify({ type: "error", message: "reason is required" }));
          return;
        }
        try {
          const event = await agent.slash({ reason, agentDID });
          const rep = agent.getSelfReputation();
          ws.send(JSON.stringify({ type: "reputation_updated", event, reputation: rep }));
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
        }
      }

      if (msg.type === "rep_snapshot") {
        try {
          const snapshot = await agent.commitReputationSnapshot();
          ws.send(JSON.stringify({ type: "reputation_snapshot", snapshot }));
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
        }
      }

      // Team Vault handlers
      if (msg.type === "team_list") {
        const teams = agent.listTeams();
        ws.send(JSON.stringify({ type: "team_list", teams }));
      }

      if (msg.type === "team_create") {
        try {
          const { name, description, members, threshold } = msg;
          if (!name) { ws.send(JSON.stringify({ type: "error", message: "name required" })); return; }
          const team = await agent.createTeam({ name, description, members, threshold });
          ws.send(JSON.stringify({ type: "team_created", team }));
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
        }
      }

      if (msg.type === "team_invite") {
        try {
          const { teamId, publicKey, x25519PublicKey, role, displayName } = msg;
          const team = await agent.inviteTeamMember(teamId, { publicKey, x25519PublicKey, role: role ?? "member", displayName });
          ws.send(JSON.stringify({ type: "team_updated", team }));
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
        }
      }

      if (msg.type === "team_store_secret") {
        try {
          const { teamId, label, description, data } = msg;
          if (!teamId || !label || data === undefined) {
            ws.send(JSON.stringify({ type: "error", message: "teamId, label, data required" }));
            return;
          }
          const secret = await agent.storeTeamSecret(teamId, { label, description, data });
          ws.send(JSON.stringify({ type: "team_secret_stored", secret }));
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
        }
      }

      if (msg.type === "team_retrieve_secret") {
        try {
          const { teamId, secretId } = msg;
          const result = agent.retrieveTeamSecret(teamId, secretId);
          ws.send(JSON.stringify({ type: "team_secret_retrieved", ...result }));
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
        }
      }

      // DID handlers
      if (msg.type === "did_get") {
        const document = agent.getSelfDIDDocument();
        ws.send(JSON.stringify({
          type: "did_document",
          did: agent.getSelfDID(),
          document: document ?? null,
        }));
      }

      if (msg.type === "did_issue_credential") {
        const { subjectDID, credType, claim, expiresInMs } = msg;
        if (!subjectDID || !credType || !claim) {
          ws.send(JSON.stringify({ type: "error", message: "subjectDID, credType, and claim are required" }));
          return;
        }
        try {
          const credential = await agent.issueCredential({
            subjectDID,
            type: credType,
            claim,
            expiresInMs,
          });
          ws.send(JSON.stringify({ type: "credential_issued", credential }));
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
        }
      }

      if (msg.type === "did_verify_credential") {
        const { credential } = msg;
        if (!credential) {
          ws.send(JSON.stringify({ type: "error", message: "credential is required" }));
          return;
        }
        const result = agent.verifyCredential(credential);
        ws.send(JSON.stringify({ type: "credential_verified", ...result, credentialId: credential.credentialId }));
      }

      if (msg.type === "did_list_credentials") {
        const credentials = agent.getDIDCredentials();
        ws.send(JSON.stringify({ type: "credentials_list", count: credentials.length, credentials }));
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
