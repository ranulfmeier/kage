/// Shared types and logic for Kage ZK circuits.
/// All structs are serializable so they can be passed between
/// the SP1 guest (circuit) and the host (prover/verifier).
use serde::{Deserialize, Serialize};

/// Simple FNV-1a hash for event commitment (zkVM-safe, no OS deps).
/// This produces a deterministic u64 from the event sequence.
pub fn hash_events(events: &[ReputationEvent]) -> u64 {
    const FNV_OFFSET: u64 = 14695981039346656037;
    const FNV_PRIME: u64 = 1099511628211;
    let mut hash = FNV_OFFSET;
    for ev in events {
        for b in ev.event_type.as_bytes() {
            hash ^= *b as u64;
            hash = hash.wrapping_mul(FNV_PRIME);
        }
        for b in ev.delta.to_le_bytes() {
            hash ^= b as u64;
            hash = hash.wrapping_mul(FNV_PRIME);
        }
        for b in ev.timestamp.to_le_bytes() {
            hash ^= b as u64;
            hash = hash.wrapping_mul(FNV_PRIME);
        }
    }
    hash
}

// ── Reputation ────────────────────────────────────────────────────────────────

/// A single reputation event recorded by a Kage agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReputationEvent {
    /// Event kind: "task_complete" | "task_fail" | "slash"
    pub event_type: String,
    /// Score delta — positive (reward) or negative (penalty)
    pub delta: i64,
    /// Unix timestamp (ms)
    pub timestamp: u64,
}

/// Public outputs committed on-chain after a reputation proof.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReputationProofOutput {
    /// Agent DID (e.g. "did:sol:4792WK…")
    pub agent_did: String,
    /// Final computed score
    pub final_score: i64,
    /// Number of events included in this proof
    pub event_count: u32,
    /// FNV-1a hash of the events sequence — tamper-proof commitment
    pub events_hash: u64,
}

/// Scoring rules (same constants used in API reputation plugin).
pub const BASE_SCORE: i64 = 100;
pub const MAX_SCORE: i64 = 1000;
pub const MIN_SCORE: i64 = 0;
pub const TASK_SUCCESS_DELTA: i64 = 25;
pub const TASK_PARTIAL_DELTA: i64 = 5;
pub const TASK_FAIL_DELTA: i64 = -15;
pub const SLASH_DELTA: i64 = -100;

/// Compute score from a base score + list of events.
/// Returns (final_score, is_valid) — invalid if any delta doesn't match the type.
pub fn compute_reputation_score(base: i64, events: &[ReputationEvent]) -> (i64, bool) {
    let mut score = base;
    let mut valid = true;

    for ev in events {
        let expected_delta = match ev.event_type.as_str() {
            "task_complete" => TASK_SUCCESS_DELTA,
            "task_partial"  => TASK_PARTIAL_DELTA,
            "task_fail"     => TASK_FAIL_DELTA,
            "slash"         => SLASH_DELTA,
            _               => { valid = false; ev.delta }
        };

        // Verify the delta matches the expected value for its type
        if ev.delta != expected_delta {
            valid = false;
        }

        score = (score + ev.delta).clamp(MIN_SCORE, MAX_SCORE);
    }

    (score, valid)
}

// ── Memory ────────────────────────────────────────────────────────────────────

/// A Kage memory commitment — what gets anchored on Solana.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryCommitment {
    /// SHA-256 hash of the AES-GCM ciphertext (hex)
    pub ciphertext_hash: String,
    /// Agent DID that owns this memory
    pub agent_did: String,
    /// Unix timestamp (ms) when the memory was stored
    pub stored_at: u64,
    /// Memory type: "episodic" | "semantic" | "procedural"
    pub memory_type: String,
}

/// Public outputs for a memory integrity proof.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryProofOutput {
    pub agent_did: String,
    pub ciphertext_hash: String,
    pub stored_at: u64,
    /// Proof that the commitment existed at this block/timestamp
    pub commitment_valid: bool,
}

// ── Task Completion ───────────────────────────────────────────────────────────

/// A delegation task with its result claim.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskClaim {
    pub task_id: String,
    /// SHA-256 hash of the original encrypted instruction
    pub instruction_hash: String,
    /// SHA-256 hash of the result payload
    pub result_hash: String,
    /// Declared outcome: "success" | "partial" | "failure"
    pub outcome: String,
    /// Agent that executed the task
    pub executor_did: String,
    pub completed_at: u64,
}

/// Public outputs for a task completion proof.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProofOutput {
    pub task_id: String,
    pub executor_did: String,
    pub outcome: String,
    pub instruction_hash: String,
    pub result_hash: String,
    /// True when outcome string is one of the valid values
    pub outcome_valid: bool,
}
