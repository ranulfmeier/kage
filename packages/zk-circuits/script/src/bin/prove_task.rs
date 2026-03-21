use sp1_sdk::{include_elf, ProverClient, Prover, ProvingKey, SP1Stdin, HashableKey, Elf};
use kage_zk_lib::{TaskClaim, TaskProofOutput};

pub const TASK_ELF: Elf = include_elf!("task");

#[tokio::main]
async fn main() {
    sp1_sdk::utils::setup_logger();

    let claim = TaskClaim {
        task_id: "task-kage-001".to_string(),
        instruction_hash: "a".repeat(64),
        result_hash: "b".repeat(64),
        outcome: "success".to_string(),
        executor_did: "did:sol:4792WKwunaZbxwLejvmGJVENAe3xjqwpBiDNDTF2TZQi".to_string(),
        completed_at: 1_700_001_000,
    };

    println!("[Kage:ZK] Task: {} | outcome: {}", claim.task_id, claim.outcome);

    let mut stdin = SP1Stdin::new();
    stdin.write(&claim);

    println!("[Kage:ZK] Generating task completion proof… (mode: LOCAL CPU)");

    let client = ProverClient::builder().cpu().build().await;
    let pk = client.setup(TASK_ELF).await.unwrap();
    let vk = pk.verifying_key();
    let proof = client.prove(&pk, stdin).await.unwrap();

    client.verify(&proof, vk, None).unwrap();

    let mut pv = proof.public_values.clone();
    let output: TaskProofOutput = pv.read();
    println!("[Kage:ZK] Proof verified!");
    println!("[Kage:ZK] outcome_valid: {} | vkey: {}", output.outcome_valid, vk.bytes32());
}
