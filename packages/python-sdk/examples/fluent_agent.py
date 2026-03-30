"""
Fluent KageAgent API — the simplest way to use Kage from Python.

Prerequisites:
    pip install kage-sdk

Usage:
    python fluent_agent.py
"""

from kage import KageAgent

KAGE_API = "http://localhost:3002"

with KageAgent(KAGE_API) as agent:
    print("=== Kage Fluent Agent ===\n")

    # Health check
    health = agent.health()
    print(f"Server: {health['status']} | LLM: {health['llm']['provider']}\n")

    # Identity
    me = agent.identity()
    print(f"DID: {me.did}")
    print(f"Solana: {me.solana_pubkey}")
    print(f"X25519: {me.x25519_pubkey}\n")

    # Store a memory
    result = agent.store_memory("The user's risk tolerance is moderate")
    print(f"Stored: {result.text}\n")

    # Recall memories
    memories = agent.list_memories()
    print(f"Memories ({len(memories)}):")
    for m in memories:
        print(f"  [{m.type}] {m.id}")

    # Reputation
    rep = agent.reputation()
    print(f"\nReputation: {rep.score}/1000 (tier: {rep.tier})")
    print(f"Tasks: {rep.total_tasks} total, {rep.successful_tasks} success")

    # Record task outcome
    rep = agent.record_task("success", "Completed user preference analysis")
    print(f"After task: {rep.score}/1000 (tier: {rep.tier})")

    # Issue a credential
    cred = agent.issue_credential(
        subject_did="did:sol:ExampleAgent",
        cred_type="AnalysisCapability",
        claim={"capability": "sentiment-analysis", "accuracy": 0.95},
    )
    print(f"\nCredential issued: {cred.credential_id}")
    print(f"  Type: {cred.type}")
    print(f"  Signature: {cred.signature[:32]}...")
