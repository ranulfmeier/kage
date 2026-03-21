use sp1_sdk::{include_elf, ProverClient, Prover, ProvingKey, SP1Stdin, HashableKey, Elf};
use kage_zk_lib::{MemoryCommitment, MemoryProofOutput};

pub const MEMORY_ELF: Elf = include_elf!("memory");

fn derive_hash(commitment: &MemoryCommitment) -> u64 {
    const FNV_OFFSET: u64 = 14695981039346656037;
    const FNV_PRIME: u64 = 1099511628211;
    let mut h = FNV_OFFSET;
    let mut feed = |bytes: &[u8]| {
        for b in bytes { h ^= *b as u64; h = h.wrapping_mul(FNV_PRIME); }
    };
    feed(commitment.ciphertext_hash.as_bytes());
    feed(commitment.agent_did.as_bytes());
    feed(&commitment.stored_at.to_le_bytes());
    feed(commitment.memory_type.as_bytes());
    h
}

#[tokio::main]
async fn main() {
    sp1_sdk::utils::setup_logger();

    let commitment = MemoryCommitment {
        ciphertext_hash: "a".repeat(64),
        agent_did: "did:sol:4792WKwunaZbxwLejvmGJVENAe3xjqwpBiDNDTF2TZQi".to_string(),
        stored_at: 1_700_000_000,
        memory_type: "episodic".to_string(),
    };
    let claimed_hash = derive_hash(&commitment);

    println!("[Kage:ZK] Memory: {} | stored_at: {}", commitment.memory_type, commitment.stored_at);

    let mut stdin = SP1Stdin::new();
    stdin.write(&commitment);
    stdin.write(&claimed_hash);

    println!("[Kage:ZK] Generating memory integrity proof… (mode: LOCAL CPU)");

    let client = ProverClient::builder().cpu().build().await;
    let pk = client.setup(MEMORY_ELF).await.unwrap();
    let vk = pk.verifying_key();
    let proof = client.prove(&pk, stdin).await.unwrap();

    client.verify(&proof, vk, None).unwrap();

    let mut pv = proof.public_values.clone();
    let output: MemoryProofOutput = pv.read();
    println!("[Kage:ZK] Proof verified!");
    println!("[Kage:ZK] commitment_valid: {} | vkey: {}", output.commitment_valid, vk.bytes32());
}
