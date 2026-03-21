/**
 * TypeScript HTTP client for the Kage Prover Service (Rust/Axum).
 * Supports submitting proof requests, polling status, and waiting for completion.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ProofStatus = "queued" | "proving" | "completed" | "failed";

export interface ProofRecord {
  proof_id: string;
  proof_type: string;
  status: ProofStatus;
  mode: string;
  vkey: string | null;
  public_outputs: Record<string, unknown> | null;
  /** Hex-encoded Groth16 proof bytes (for on-chain verification) */
  groth16_proof: string | null;
  /** Hex-encoded SP1 public inputs (for on-chain verification) */
  sp1_public_inputs: string | null;
  error: string | null;
  explorer_url: string | null;
  created_at: number;
  completed_at: number | null;
}

export interface ProverHealthResponse {
  service: string;
  version: string;
  mode: string;
  stats: {
    total_proofs: number;
    completed: number;
    proving: number;
  };
}

export interface ReputationProofRequest {
  agent_did: string;
  events: Array<{
    event_type: string;
    delta: number;
    timestamp: number;
  }>;
  claimed_score: number;
}

export interface MemoryProofRequest {
  agent_did: string;
  ciphertext_hash: string;
  stored_at: number;
  memory_type: "episodic" | "semantic" | "procedural";
}

export interface TaskProofRequest {
  task_id: string;
  instruction_hash: string;
  result_hash: string;
  outcome: "success" | "partial" | "failure";
  executor_did: string;
  completed_at?: number;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class ProverClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(serviceUrl = "http://localhost:3080", apiKey?: string) {
    this.baseUrl = serviceUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h["x-api-key"] = this.apiKey;
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const opts: RequestInit = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const json = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      throw new Error(
        (json.error as string) ||
          `Prover service error: ${res.status} ${res.statusText}`
      );
    }
    return json as T;
  }

  // ── Health ───────────────────────────────────────────────────────────────

  async health(): Promise<ProverHealthResponse> {
    return this.request("GET", "/health");
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.health();
      return true;
    } catch {
      return false;
    }
  }

  // ── Submit Proofs ────────────────────────────────────────────────────────

  async submitReputationProof(
    input: ReputationProofRequest
  ): Promise<ProofRecord> {
    return this.request("POST", "/prove/reputation", input);
  }

  async submitMemoryProof(input: MemoryProofRequest): Promise<ProofRecord> {
    return this.request("POST", "/prove/memory", input);
  }

  async submitTaskProof(input: TaskProofRequest): Promise<ProofRecord> {
    return this.request("POST", "/prove/task", input);
  }

  // ── Query ────────────────────────────────────────────────────────────────

  async getProofStatus(proofId: string): Promise<ProofRecord> {
    return this.request("GET", `/proof/${proofId}`);
  }

  /**
   * Poll until the proof reaches a terminal state (completed/failed).
   * Uses exponential backoff: starts at 2s, caps at 15s.
   */
  async waitForProof(
    proofId: string,
    timeoutMs = 300_000,
    onStatusUpdate?: (record: ProofRecord) => void
  ): Promise<ProofRecord> {
    const start = Date.now();
    let interval = 2000;
    const maxInterval = 15_000;

    while (Date.now() - start < timeoutMs) {
      const record = await this.getProofStatus(proofId);
      onStatusUpdate?.(record);

      if (record.status === "completed" || record.status === "failed") {
        return record;
      }

      await sleep(interval);
      interval = Math.min(interval * 1.5, maxInterval);
    }

    throw new Error(`Proof ${proofId} timed out after ${timeoutMs}ms`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
