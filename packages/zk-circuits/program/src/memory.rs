#![no_main]
// Kage ZK Circuit — Memory Commitment Integrity
sp1_zkvm::entrypoint!(main);

use kage_zk_lib::{MemoryCommitment, MemoryProofOutput};

/// Simple FNV-1a hash to derive a commitment from memory fields.
fn derive_hash(commitment: &MemoryCommitment) -> u64 {
    const FNV_OFFSET: u64 = 14695981039346656037;
    const FNV_PRIME: u64 = 1099511628211;
    let mut h = FNV_OFFSET;
    let feed = |h: &mut u64, bytes: &[u8]| {
        for b in bytes { *h ^= *b as u64; *h = h.wrapping_mul(FNV_PRIME); }
    };
    feed(&mut h, commitment.ciphertext_hash.as_bytes());
    feed(&mut h, commitment.agent_did.as_bytes());
    feed(&mut h, &commitment.stored_at.to_le_bytes());
    feed(&mut h, commitment.memory_type.as_bytes());
    h
}

pub fn main() {
    let commitment: MemoryCommitment = sp1_zkvm::io::read();
    let claimed_hash: u64 = sp1_zkvm::io::read();

    let derived = derive_hash(&commitment);
    assert!(
        derived == claimed_hash,
        "Memory commitment hash mismatch — data may have been tampered"
    );

    let valid_types = ["episodic", "semantic", "procedural"];
    assert!(
        valid_types.contains(&commitment.memory_type.as_str()),
        "Invalid memory type"
    );

    let output = MemoryProofOutput {
        agent_did: commitment.agent_did,
        ciphertext_hash: commitment.ciphertext_hash,
        stored_at: commitment.stored_at,
        commitment_valid: true,
    };
    sp1_zkvm::io::commit(&output);
}
