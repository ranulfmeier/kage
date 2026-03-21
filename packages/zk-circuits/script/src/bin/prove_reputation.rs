use sp1_sdk::{include_elf, ProverClient, Prover, ProvingKey, SP1Stdin, HashableKey, Elf};
use kage_zk_lib::{ReputationEvent, ReputationProofOutput, compute_reputation_score, BASE_SCORE};

pub const REPUTATION_ELF: Elf = include_elf!("reputation");

#[tokio::main]
async fn main() {
    sp1_sdk::utils::setup_logger();

    let agent_did = "did:sol:4792WKwunaZbxwLejvmGJVENAe3xjqwpBiDNDTF2TZQi".to_string();
    let events = vec![
        ReputationEvent { event_type: "task_complete".to_string(), delta: 25, timestamp: 1_700_000_000 },
        ReputationEvent { event_type: "task_complete".to_string(), delta: 25, timestamp: 1_700_001_000 },
        ReputationEvent { event_type: "task_fail".to_string(),     delta: -15, timestamp: 1_700_002_000 },
    ];

    let (claimed_score, _) = compute_reputation_score(BASE_SCORE, &events);
    println!("[Kage:ZK] DID: {} | Events: {} | Score: {}", agent_did, events.len(), claimed_score);

    let mut stdin = SP1Stdin::new();
    stdin.write(&agent_did);
    stdin.write(&events);
    stdin.write(&claimed_score);

    println!("[Kage:ZK] Generating reputation proof… (mode: LOCAL CPU)");
    println!("[Kage:ZK] For network mode, use the prover-service instead");

    let client = ProverClient::builder().cpu().build().await;
    let pk = client.setup(REPUTATION_ELF).await.unwrap();
    let vk = pk.verifying_key();
    let proof = client.prove(&pk, stdin).await.unwrap();

    client.verify(&proof, vk, None).unwrap();
    println!("[Kage:ZK] Proof verified!");

    let mut pv = proof.public_values.clone();
    let output: ReputationProofOutput = pv.read();
    let vkey_hex = vk.bytes32();

    println!("\n[Kage:ZK] === PUBLIC OUTPUTS ===");
    println!("  agent_did:    {}", output.agent_did);
    println!("  final_score:  {}", output.final_score);
    println!("  event_count:  {}", output.event_count);
    println!("  events_hash:  0x{:016x}", output.events_hash);
    println!("  vkey:         {}", vkey_hex);

    let proof_json = serde_json::to_string_pretty(&serde_json::json!({
        "agent_did": output.agent_did,
        "final_score": output.final_score,
        "event_count": output.event_count,
        "events_hash": format!("0x{:016x}", output.events_hash),
        "vkey": vkey_hex,
    })).unwrap();
    std::fs::write("reputation_proof.json", &proof_json).expect("write failed");
    println!("\n[Kage:ZK] Public outputs saved -> reputation_proof.json");
}
