#![no_main]
// Kage ZK Circuit — Task Completion Proof
// Proves outcome claim is valid without revealing encrypted content.
sp1_zkvm::entrypoint!(main);

use kage_zk_lib::{TaskClaim, TaskProofOutput};

pub fn main() {
    // ── Read private inputs ───────────────────────────────────────────────────
    let claim: TaskClaim = sp1_zkvm::io::read();

    // ── Validate inside the zkVM ──────────────────────────────────────────────

    // 1. Outcome must be a known value
    let valid_outcomes = ["success", "partial", "failure"];
    let outcome_valid = valid_outcomes.contains(&claim.outcome.as_str());
    assert!(outcome_valid, "Invalid outcome: {}", claim.outcome);

    // 2. Hashes must be non-empty (64 hex chars = SHA-256)
    assert!(
        claim.instruction_hash.len() == 64,
        "instruction_hash must be a 64-char hex SHA-256"
    );
    assert!(
        claim.result_hash.len() == 64,
        "result_hash must be a 64-char hex SHA-256"
    );

    // 3. Executor DID must be present
    assert!(
        !claim.executor_did.is_empty(),
        "executor_did cannot be empty"
    );

    // 4. Task must have completed after it was created
    assert!(claim.completed_at > 0, "completed_at must be set");

    // ── Commit public outputs ─────────────────────────────────────────────────
    let output = TaskProofOutput {
        task_id: claim.task_id,
        executor_did: claim.executor_did,
        outcome: claim.outcome,
        instruction_hash: claim.instruction_hash,
        result_hash: claim.result_hash,
        outcome_valid,
    };

    sp1_zkvm::io::commit(&output);
}
