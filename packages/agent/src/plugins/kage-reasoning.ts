import { Connection, Keypair } from "@solana/web3.js";
import {
  ReasoningEngine,
  ReasoningTrace,
  RevealResult,
  createReasoningEngine,
} from "@kage/sdk";

export interface KageReasoningPluginConfig {
  rpcUrl: string;
}

export class KageReasoningPlugin {
  private engine: ReasoningEngine | null = null;
  private config: KageReasoningPluginConfig;
  private initialized = false;
  /** Current active session ID (one per conversation) */
  private activeSessionId: string | null = null;

  readonly name = "kage-reasoning";
  readonly description = "Hidden reasoning traces — encrypt agent thinking, commit hash on-chain";
  readonly version = "0.1.0";

  constructor(config: KageReasoningPluginConfig) {
    this.config = config;
  }

  async initialize(keypair: Keypair): Promise<void> {
    const connection = new Connection(this.config.rpcUrl, "confirmed");
    this.engine = createReasoningEngine(connection, keypair);
    this.initialized = true;
    console.log(`[KageReasoning] Plugin initialized. Viewing pub: ${this.engine.viewingPublicKey.slice(0, 20)}…`);
  }

  private ensureReady(): ReasoningEngine {
    if (!this.engine || !this.initialized) throw new Error("Reasoning plugin not initialized");
    return this.engine;
  }

  // ─── Session ──────────────────────────────────────────────────────────────

  startSession(): string {
    const engine = this.ensureReady();
    this.activeSessionId = engine.startSession();
    return this.activeSessionId;
  }

  endSession(): void {
    if (this.activeSessionId) {
      this.ensureReady().endSession(this.activeSessionId);
      this.activeSessionId = null;
    }
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  // ─── Trace ────────────────────────────────────────────────────────────────

  async commitTrace(reasoning: string, sessionId?: string): Promise<ReasoningTrace> {
    const sid = sessionId ?? this.activeSessionId;
    if (!sid) throw new Error("No active session — call startSession() first");
    return this.ensureReady().commitTrace(sid, reasoning);
  }

  // ─── Audit ────────────────────────────────────────────────────────────────

  reveal(traceId: string): RevealResult {
    return this.ensureReady().reveal(traceId);
  }

  revealWithAuditKey(traceId: string, auditKey: string): RevealResult {
    return this.ensureReady().revealWithAuditKey(traceId, auditKey);
  }

  exportAuditKey(sessionId?: string): string {
    const sid = sessionId ?? this.activeSessionId;
    if (!sid) throw new Error("No active session");
    return this.ensureReady().exportAuditKey(sid);
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  getTrace(traceId: string): ReasoningTrace | undefined {
    return this.ensureReady().getTrace(traceId);
  }

  getAllTraces(): ReasoningTrace[] {
    return this.ensureReady().getAllTraces();
  }

  getViewingPublicKey(): string {
    return this.ensureReady().viewingPublicKey;
  }
}

export function createKageReasoningPlugin(
  config: KageReasoningPluginConfig
): KageReasoningPlugin {
  return new KageReasoningPlugin(config);
}
