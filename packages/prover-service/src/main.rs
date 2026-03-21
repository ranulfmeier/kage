use std::{env, net::SocketAddr, path::PathBuf, sync::Arc};

use axum::{
    Router,
    extract::{Json, Path, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::IntoResponse,
    routing::{get, post},
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sp1_sdk::{Elf, HashableKey, ProveRequest, Prover, ProverClient, ProvingKey, SP1Stdin};
use tracing::{error, info, warn};
use uuid::Uuid;

use kage_zk_lib::*;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProofStatus {
    Queued,
    Proving,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofRecord {
    pub proof_id: String,
    pub proof_type: String,
    pub status: ProofStatus,
    pub mode: String,
    pub vkey: Option<String>,
    pub public_outputs: Option<serde_json::Value>,
    /// Groth16 proof bytes (hex-encoded) for on-chain verification
    pub groth16_proof: Option<String>,
    /// SP1 public inputs bytes (hex-encoded) for on-chain verification
    pub sp1_public_inputs: Option<String>,
    pub error: Option<String>,
    pub explorer_url: Option<String>,
    pub created_at: u64,
    pub completed_at: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct ReputationRequest {
    pub agent_did: String,
    pub events: Vec<ReputationEventInput>,
    pub claimed_score: i64,
}

#[derive(Debug, Deserialize)]
pub struct ReputationEventInput {
    pub event_type: String,
    pub delta: i64,
    pub timestamp: u64,
}

#[derive(Debug, Deserialize)]
pub struct MemoryRequest {
    pub agent_did: String,
    pub ciphertext_hash: String,
    pub stored_at: u64,
    pub memory_type: String,
}

#[derive(Debug, Deserialize)]
pub struct TaskRequest {
    pub task_id: String,
    pub instruction_hash: String,
    pub result_hash: String,
    pub outcome: String,
    pub executor_did: String,
    pub completed_at: Option<u64>,
}

// ── App State ────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub proofs: Arc<DashMap<String, ProofRecord>>,
    pub prover_mode: Arc<String>,
    pub api_key: Option<Arc<String>>,
    pub reputation_elf: Arc<Vec<u8>>,
    pub memory_elf: Arc<Vec<u8>>,
    pub task_elf: Arc<Vec<u8>>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn detect_mode() -> String {
    if env::var("NETWORK_PRIVATE_KEY").is_ok() {
        "network".to_string()
    } else {
        "cpu".to_string()
    }
}

/// Result of SP1 proof generation, includes both public values and Groth16 data
struct ProveResult {
    vkey_hex: String,
    public_values: Vec<u8>,
    /// Hex-encoded Groth16 proof bytes (for on-chain verification)
    groth16_proof_hex: Option<String>,
    /// Hex-encoded SP1 public inputs (for on-chain verification)
    sp1_public_inputs_hex: Option<String>,
}

async fn prove_with_elf(
    mode: &str,
    elf_bytes: &[u8],
    stdin: SP1Stdin,
) -> Result<ProveResult, String> {
    info!(mode = %mode, "Building SP1 ProverClient");

    let elf = Elf::from(&elf_bytes[..]);

    if mode == "network" {
        let client = ProverClient::builder().network().build().await;
        let pk = client.setup(elf).await.map_err(|e| format!("Setup failed: {e}"))?;
        let vk = pk.verifying_key();
        let proof = client.prove(&pk, stdin).groth16().await
            .map_err(|e| format!("Groth16 prove failed: {e}"))?;
        client.verify(&proof, vk, None).map_err(|e| format!("Verify failed: {e}"))?;

        let groth16_proof_hex = hex::encode(proof.bytes());
        let sp1_public_inputs_hex = hex::encode(&proof.public_values.to_vec());

        Ok(ProveResult {
            vkey_hex: vk.bytes32(),
            public_values: proof.public_values.to_vec(),
            groth16_proof_hex: Some(groth16_proof_hex),
            sp1_public_inputs_hex: Some(sp1_public_inputs_hex),
        })
    } else {
        let client = ProverClient::builder().cpu().build().await;
        let pk = client.setup(elf).await.map_err(|e| format!("Setup failed: {e}"))?;
        let vk = pk.verifying_key();
        let proof = client.prove(&pk, stdin).compressed().await
            .map_err(|e| format!("Prove failed: {e}"))?;
        client.verify(&proof, vk, None).map_err(|e| format!("Verify failed: {e}"))?;

        Ok(ProveResult {
            vkey_hex: vk.bytes32(),
            public_values: proof.public_values.to_vec(),
            groth16_proof_hex: None,
            sp1_public_inputs_hex: None,
        })
    }
}

// ── Auth middleware ───────────────────────────────────────────────────────────

async fn auth_middleware(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> impl IntoResponse {
    if let Some(expected_key) = &state.api_key {
        let provided = headers
            .get("x-api-key")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if provided != expected_key.as_str() {
            return Err((StatusCode::UNAUTHORIZED, "Invalid or missing API key"));
        }
    }
    Ok(next.run(request).await)
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    let total = state.proofs.len();
    let completed = state
        .proofs
        .iter()
        .filter(|e| e.value().status == ProofStatus::Completed)
        .count();
    let proving = state
        .proofs
        .iter()
        .filter(|e| e.value().status == ProofStatus::Proving)
        .count();

    Json(serde_json::json!({
        "service": "kage-prover-service",
        "version": "0.1.0",
        "mode": *state.prover_mode,
        "stats": {
            "total_proofs": total,
            "completed": completed,
            "proving": proving,
        }
    }))
}

async fn prove_reputation(
    State(state): State<AppState>,
    Json(req): Json<ReputationRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let proof_id = Uuid::new_v4().to_string();
    let mode = state.prover_mode.as_str().to_string();

    let record = ProofRecord {
        proof_id: proof_id.clone(),
        proof_type: "reputation".into(),
        status: ProofStatus::Queued,
        mode: mode.clone(),
        vkey: None,
        public_outputs: None,
        groth16_proof: None,
        sp1_public_inputs: None,
        error: None,
        explorer_url: None,
        created_at: now_ms(),
        completed_at: None,
    };
    state.proofs.insert(proof_id.clone(), record);

    let response = serde_json::to_value(state.proofs.get(&proof_id).unwrap().value()).unwrap();

    let proofs = state.proofs.clone();
    let elf_bytes = state.reputation_elf.clone();
    tokio::spawn(async move {
        run_reputation_proof(proofs, elf_bytes, proof_id, mode, req).await;
    });

    (StatusCode::ACCEPTED, Json(response))
}

async fn run_reputation_proof(
    proofs: Arc<DashMap<String, ProofRecord>>,
    elf_bytes: Arc<Vec<u8>>,
    proof_id: String,
    mode: String,
    req: ReputationRequest,
) {
    if let Some(mut entry) = proofs.get_mut(&proof_id) {
        entry.status = ProofStatus::Proving;
    }

    let events: Vec<ReputationEvent> = req
        .events
        .iter()
        .map(|e| ReputationEvent {
            event_type: e.event_type.clone(),
            delta: e.delta,
            timestamp: e.timestamp,
        })
        .collect();

    let (computed_score, _) = compute_reputation_score(BASE_SCORE, &events);

    let mut stdin = SP1Stdin::new();
    stdin.write(&req.agent_did);
    stdin.write(&events);
    stdin.write(&computed_score);

    match prove_with_elf(&mode, &elf_bytes, stdin).await {
        Ok(result) => {
            let output: ReputationProofOutput =
                sp1_sdk::SP1PublicValues::from(result.public_values.as_slice()).read();

            let public_outputs = serde_json::json!({
                "agent_did": output.agent_did,
                "final_score": output.final_score,
                "event_count": output.event_count,
                "events_hash": format!("0x{:016x}", output.events_hash),
            });

            if let Some(mut entry) = proofs.get_mut(&proof_id) {
                entry.status = ProofStatus::Completed;
                entry.vkey = Some(result.vkey_hex);
                entry.public_outputs = Some(public_outputs);
                entry.groth16_proof = result.groth16_proof_hex;
                entry.sp1_public_inputs = result.sp1_public_inputs_hex;
                entry.completed_at = Some(now_ms());
                if mode == "network" {
                    entry.explorer_url = Some(format!(
                        "https://explorer.succinct.xyz/request/{}",
                        proof_id
                    ));
                }
                info!(proof_id = %proof_id, "Reputation proof completed");
            }
        }
        Err(e) => {
            error!(proof_id = %proof_id, error = %e, "Reputation proof failed");
            if let Some(mut entry) = proofs.get_mut(&proof_id) {
                entry.status = ProofStatus::Failed;
                entry.error = Some(e);
                entry.completed_at = Some(now_ms());
            }
        }
    }
}

async fn prove_memory(
    State(state): State<AppState>,
    Json(req): Json<MemoryRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let proof_id = Uuid::new_v4().to_string();
    let mode = state.prover_mode.as_str().to_string();

    let record = ProofRecord {
        proof_id: proof_id.clone(),
        proof_type: "memory".into(),
        status: ProofStatus::Queued,
        mode: mode.clone(),
        vkey: None,
        public_outputs: None,
        groth16_proof: None,
        sp1_public_inputs: None,
        error: None,
        explorer_url: None,
        created_at: now_ms(),
        completed_at: None,
    };
    state.proofs.insert(proof_id.clone(), record);
    let response = serde_json::to_value(state.proofs.get(&proof_id).unwrap().value()).unwrap();

    let proofs = state.proofs.clone();
    let elf_bytes = state.memory_elf.clone();
    tokio::spawn(async move {
        run_memory_proof(proofs, elf_bytes, proof_id, mode, req).await;
    });

    (StatusCode::ACCEPTED, Json(response))
}

async fn run_memory_proof(
    proofs: Arc<DashMap<String, ProofRecord>>,
    elf_bytes: Arc<Vec<u8>>,
    proof_id: String,
    mode: String,
    req: MemoryRequest,
) {
    if let Some(mut entry) = proofs.get_mut(&proof_id) {
        entry.status = ProofStatus::Proving;
    }

    let commitment = MemoryCommitment {
        ciphertext_hash: req.ciphertext_hash,
        agent_did: req.agent_did,
        stored_at: req.stored_at,
        memory_type: req.memory_type,
    };

    let claimed_hash = derive_memory_hash(&commitment);
    let mut stdin = SP1Stdin::new();
    stdin.write(&commitment);
    stdin.write(&claimed_hash);

    match prove_with_elf(&mode, &elf_bytes, stdin).await {
        Ok(result) => {
            let output: MemoryProofOutput =
                sp1_sdk::SP1PublicValues::from(result.public_values.as_slice()).read();

            let public_outputs = serde_json::json!({
                "agent_did": output.agent_did,
                "ciphertext_hash": output.ciphertext_hash,
                "stored_at": output.stored_at,
                "commitment_valid": output.commitment_valid,
            });

            if let Some(mut entry) = proofs.get_mut(&proof_id) {
                entry.status = ProofStatus::Completed;
                entry.vkey = Some(result.vkey_hex);
                entry.public_outputs = Some(public_outputs);
                entry.groth16_proof = result.groth16_proof_hex;
                entry.sp1_public_inputs = result.sp1_public_inputs_hex;
                entry.completed_at = Some(now_ms());
                info!(proof_id = %proof_id, "Memory proof completed");
            }
        }
        Err(e) => {
            error!(proof_id = %proof_id, error = %e, "Memory proof failed");
            if let Some(mut entry) = proofs.get_mut(&proof_id) {
                entry.status = ProofStatus::Failed;
                entry.error = Some(e);
                entry.completed_at = Some(now_ms());
            }
        }
    }
}

async fn prove_task(
    State(state): State<AppState>,
    Json(req): Json<TaskRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let proof_id = Uuid::new_v4().to_string();
    let mode = state.prover_mode.as_str().to_string();

    let record = ProofRecord {
        proof_id: proof_id.clone(),
        proof_type: "task".into(),
        status: ProofStatus::Queued,
        mode: mode.clone(),
        vkey: None,
        public_outputs: None,
        groth16_proof: None,
        sp1_public_inputs: None,
        error: None,
        explorer_url: None,
        created_at: now_ms(),
        completed_at: None,
    };
    state.proofs.insert(proof_id.clone(), record);
    let response = serde_json::to_value(state.proofs.get(&proof_id).unwrap().value()).unwrap();

    let proofs = state.proofs.clone();
    let elf_bytes = state.task_elf.clone();
    tokio::spawn(async move {
        run_task_proof(proofs, elf_bytes, proof_id, mode, req).await;
    });

    (StatusCode::ACCEPTED, Json(response))
}

async fn run_task_proof(
    proofs: Arc<DashMap<String, ProofRecord>>,
    elf_bytes: Arc<Vec<u8>>,
    proof_id: String,
    mode: String,
    req: TaskRequest,
) {
    if let Some(mut entry) = proofs.get_mut(&proof_id) {
        entry.status = ProofStatus::Proving;
    }

    let claim = TaskClaim {
        task_id: req.task_id,
        instruction_hash: req.instruction_hash,
        result_hash: req.result_hash,
        outcome: req.outcome,
        executor_did: req.executor_did,
        completed_at: req.completed_at.unwrap_or(now_ms()),
    };

    let mut stdin = SP1Stdin::new();
    stdin.write(&claim);

    match prove_with_elf(&mode, &elf_bytes, stdin).await {
        Ok(result) => {
            let output: TaskProofOutput =
                sp1_sdk::SP1PublicValues::from(result.public_values.as_slice()).read();

            let public_outputs = serde_json::json!({
                "task_id": output.task_id,
                "executor_did": output.executor_did,
                "outcome": output.outcome,
                "instruction_hash": output.instruction_hash,
                "result_hash": output.result_hash,
                "outcome_valid": output.outcome_valid,
            });

            if let Some(mut entry) = proofs.get_mut(&proof_id) {
                entry.status = ProofStatus::Completed;
                entry.vkey = Some(result.vkey_hex);
                entry.public_outputs = Some(public_outputs);
                entry.groth16_proof = result.groth16_proof_hex;
                entry.sp1_public_inputs = result.sp1_public_inputs_hex;
                entry.completed_at = Some(now_ms());
                info!(proof_id = %proof_id, "Task proof completed");
            }
        }
        Err(e) => {
            error!(proof_id = %proof_id, error = %e, "Task proof failed");
            if let Some(mut entry) = proofs.get_mut(&proof_id) {
                entry.status = ProofStatus::Failed;
                entry.error = Some(e);
                entry.completed_at = Some(now_ms());
            }
        }
    }
}

async fn get_proof(
    State(state): State<AppState>,
    Path(proof_id): Path<String>,
) -> impl IntoResponse {
    match state.proofs.get(&proof_id) {
        Some(entry) => {
            let val = serde_json::to_value(entry.value()).unwrap();
            (StatusCode::OK, Json(val))
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Proof not found"})),
        ),
    }
}

fn derive_memory_hash(c: &MemoryCommitment) -> u64 {
    const FNV_OFFSET: u64 = 14695981039346656037;
    const FNV_PRIME: u64 = 1099511628211;
    let mut h = FNV_OFFSET;
    let mut feed = |bytes: &[u8]| {
        for b in bytes {
            h ^= *b as u64;
            h = h.wrapping_mul(FNV_PRIME);
        }
    };
    feed(c.ciphertext_hash.as_bytes());
    feed(c.agent_did.as_bytes());
    feed(&c.stored_at.to_le_bytes());
    feed(c.memory_type.as_bytes());
    h
}

// ── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "kage_prover_service=info,tower_http=info".into()),
        )
        .json()
        .init();

    let mode = detect_mode();
    info!(mode = %mode, "Kage Prover Service starting");

    let elf_dir = env::var("ELF_DIR").unwrap_or_else(|_| {
        let default = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../zk-circuits/program/elf");
        default.to_string_lossy().to_string()
    });
    info!(elf_dir = %elf_dir, "Loading ELF binaries");

    let load_elf = |name: &str| -> Vec<u8> {
        let path = PathBuf::from(&elf_dir).join(name);
        std::fs::read(&path).unwrap_or_else(|e| {
            panic!("Failed to load ELF {}: {} (path: {})", name, e, path.display());
        })
    };

    let reputation_elf = Arc::new(load_elf("reputation"));
    let memory_elf = Arc::new(load_elf("memory"));
    let task_elf = Arc::new(load_elf("task"));
    info!("ELF binaries loaded: reputation={}B, memory={}B, task={}B",
        reputation_elf.len(), memory_elf.len(), task_elf.len());

    let api_key = env::var("PROVER_API_KEY").ok().map(Arc::new);
    if api_key.is_some() {
        info!("API key authentication enabled");
    } else {
        warn!("No PROVER_API_KEY set — service is unauthenticated");
    }

    let state = AppState {
        proofs: Arc::new(DashMap::new()),
        prover_mode: Arc::new(mode),
        api_key,
        reputation_elf,
        memory_elf,
        task_elf,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/prove/reputation", post(prove_reputation))
        .route("/prove/memory", post(prove_memory))
        .route("/prove/task", post(prove_task))
        .route("/proof/{proof_id}", get(get_proof))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .layer(
            tower_http::cors::CorsLayer::permissive()
        )
        .layer(
            tower_http::trace::TraceLayer::new_for_http()
        )
        .with_state(state);

    let port: u16 = env::var("PROVER_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!(addr = %addr, "Listening");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
