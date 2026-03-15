#![no_main]
// Kage ZK Circuit — Reputation Score Verification
// Proves an agent's score was computed correctly from events.
sp1_zkvm::entrypoint!(main);

use kage_zk_lib::{
    compute_reputation_score, hash_events, ReputationEvent, ReputationProofOutput, BASE_SCORE,
};

pub fn main() {
    // ── Read private inputs ───────────────────────────────────────────────────
    let agent_did: String = sp1_zkvm::io::read();
    let events: Vec<ReputationEvent> = sp1_zkvm::io::read();
    let claimed_score: i64 = sp1_zkvm::io::read();

    // ── Compute inside the zkVM ───────────────────────────────────────────────
    let (computed_score, rules_valid) = compute_reputation_score(BASE_SCORE, &events);

    assert!(
        computed_score == claimed_score,
        "Score mismatch: claimed {} but computed {}",
        claimed_score,
        computed_score
    );
    assert!(rules_valid, "Reputation events contain invalid delta values");

    let events_hash = hash_events(&events);

    // ── Commit public outputs ─────────────────────────────────────────────────
    let output = ReputationProofOutput {
        agent_did,
        final_score: computed_score,
        event_count: events.len() as u32,
        events_hash,
    };

    sp1_zkvm::io::commit(&output);
}
