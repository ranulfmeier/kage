import { Service, IAgentRuntime, logger } from "@elizaos/core";

export interface AgentInfo {
  publicKey: string;
  x25519PublicKey: string;
  network: string;
  agentId: string;
}

export interface ChatResult {
  text: string;
  proof?: { cid?: string; txSignature?: string; explorerUrl?: string };
  reasoning?: { traceId: string; charCount: number; contentHash: string };
}

export interface TeamSecret {
  id: string;
  label: string;
  createdBy: string;
  createdAt: number;
  onChainTx?: string;
  explorerUrl?: string;
}

/**
 * KageService — singleton ElizaOS Service that manages the connection
 * to the Kage API server. All actions and providers go through this service.
 *
 * Configure via character settings:
 *   KAGE_API_URL  — default: http://localhost:3002
 */
export class KageService extends Service {
  static serviceType = "kage";
  capabilityDescription =
    "Kage privacy vault — encrypted memories, DID, reputation, team vaults, shielded payments on Solana";

  private baseUrl!: string;
  private agentInfoCache: AgentInfo | null = null;

  static async start(runtime: IAgentRuntime): Promise<KageService> {
    const svc = new KageService(runtime);
    const url = String(runtime.getSetting("KAGE_API_URL") ?? "http://localhost:3002");
    svc.baseUrl = url.replace(/\/$/, "");
    logger.info(`[KageService] Connecting to ${svc.baseUrl}`);

    // Verify connectivity
    try {
      await svc.health();
      logger.info("[KageService] Connected successfully");
    } catch {
      logger.warn("[KageService] API unreachable — actions will fail at runtime");
    }

    return svc;
  }

  async stop(): Promise<void> {
    this.agentInfoCache = null;
  }

  // ── HTTP helpers ─────────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`[KageService] GET ${path} → ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[KageService] POST ${path} → ${res.status}: ${err}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async health(): Promise<Record<string, unknown>> {
    return this.get("/health");
  }

  async agentInfo(): Promise<AgentInfo> {
    if (this.agentInfoCache) return this.agentInfoCache;
    const data = await this.get<AgentInfo>("/agent/info");
    this.agentInfoCache = data;
    return data;
  }

  async chat(message: string): Promise<ChatResult> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl
        .replace("https://", "wss://")
        .replace("http://", "ws://");

      const ws = new WebSocket(`${wsUrl}/ws`);
      let connected = false;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          message?: string;
          proof?: ChatResult["proof"];
          reasoning?: ChatResult["reasoning"];
        };

        if (msg.type === "connected") {
          connected = true;
          ws.send(JSON.stringify({ type: "chat", message }));
        } else if (msg.type === "message") {
          resolve({
            text: msg.message ?? "",
            proof: msg.proof,
            reasoning: msg.reasoning,
          });
          ws.close();
        } else if (msg.type === "error") {
          reject(new Error(msg.message ?? "Unknown error"));
          ws.close();
        }
      };

      ws.onerror = () => reject(new Error("[KageService] WebSocket error"));
      ws.onclose = () => {
        if (!connected) reject(new Error("[KageService] WebSocket closed before connecting"));
      };
    });
  }

  async listMemories(): Promise<unknown[]> {
    const data = await this.get<{ memories: unknown[] }>("/memories");
    return data.memories ?? [];
  }

  async delegate(
    recipientPubkey: string,
    instruction: string,
    priority: "low" | "normal" | "high" = "normal"
  ): Promise<unknown> {
    return this.post("/delegate", { recipientPubkey, instruction, priority });
  }

  async sendMessage(
    recipientPubkey: string,
    recipientX25519: string,
    content: string
  ): Promise<unknown> {
    return this.post("/message/send", { recipientPubkey, recipientX25519, content });
  }

  async sendPayment(
    recipientSolana: string,
    recipientViewing: string,
    amountSol: number,
    memo?: string
  ): Promise<unknown> {
    return this.post("/payment/send", {
      recipientSolana,
      recipientViewing,
      amountSol,
      memo: memo ?? null,
    });
  }

  async getDid(): Promise<unknown> {
    return this.get("/did");
  }

  async getReputation(): Promise<unknown> {
    return this.get("/reputation");
  }

  async recordTask(outcome: "success" | "partial" | "failure", description?: string): Promise<unknown> {
    return this.post("/reputation/task", { outcome, description: description ?? null });
  }

  async createTeam(
    name: string,
    description: string,
    threshold: number,
    members: Array<{ publicKey: string; x25519PublicKey: string; role: string; displayName?: string }>
  ): Promise<unknown> {
    return this.post("/team/create", { name, description, threshold, members });
  }

  async listTeams(): Promise<unknown[]> {
    const data = await this.get<{ teams: unknown[] }>("/team");
    return data.teams ?? [];
  }

  async storeTeamSecret(
    teamId: string,
    label: string,
    data: unknown,
    description?: string
  ): Promise<TeamSecret> {
    const res = await this.post<{ secret: TeamSecret }>(
      `/team/${teamId}/secret`,
      { label, data, description: description ?? null }
    );
    return res.secret;
  }

  async retrieveTeamSecret(teamId: string, secretId: string): Promise<unknown> {
    return this.get(`/team/${teamId}/secret/${secretId}`);
  }
}
