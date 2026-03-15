"""
Example 2 — Decentralized Identity (DID) and Reputation.

Demonstrates:
  - Fetching the agent's DID document
  - Issuing a Verifiable Credential
  - Recording task outcomes and reading the reputation score

Run:
    python did_and_reputation.py
"""
import json
from kage import KageClient

API_URL = "http://localhost:3002"


def main() -> None:
    with KageClient(API_URL) as client:

        # ── DID ───────────────────────────────────────────────────────────────
        print("=== Decentralized Identity ===\n")

        did, doc = client.get_did()
        print(f"DID:        {did}")
        if doc:
            print(f"Agent type: {doc.kage.get('agentType', '?')}")
            print(f"Network:    {doc.kage.get('network', '?')}")
            print(f"Reasoning:  {doc.kage.get('reasoningEnabled', False)}")
            caps = doc.kage.get("capabilities", [])
            print(f"Caps:       {', '.join(caps)}\n")

        # Issue a Verifiable Credential to self (demo)
        print("Issuing a Verifiable Credential…")
        cred = client.issue_credential(
            subject_did=did,
            cred_type="AgentCapability",
            claim={
                "capability": "trading-analysis",
                "level": "trusted",
                "auditedBy": "KageProtocol",
            },
        )
        print(f"Credential ID: {cred.credential_id}")
        print(f"Type:          {cred.type}")
        print(f"Claim hash:    {cred.claim_hash[:24]}…")
        if cred.explorer_url:
            print(f"On-chain:      {cred.explorer_url}")

        # Verify the credential we just issued
        print("\nVerifying credential…")
        result = client.verify_credential({
            "credentialId": cred.credential_id,
            "issuer": cred.issuer,
            "subject": cred.subject,
            "type": cred.type,
            "claim": cred.claim,
            "claimHash": cred.claim_hash,
            "signature": cred.signature,
            "issuedAt": cred.issued_at,
        })
        status = "VALID" if result.get("valid") else "INVALID"
        print(f"Verification: {status}\n")

        # ── Reputation ────────────────────────────────────────────────────────
        print("=== Reputation System ===\n")

        rep = client.get_reputation()
        print(f"Score:  {rep.score} / 1000")
        print(f"Tier:   {rep.tier.upper()}")
        print(f"Tasks:  {rep.total_tasks} total ({rep.successful_tasks} ok, {rep.failed_tasks} failed)")
        if rep.slash_count:
            print(f"Slashes: {rep.slash_count}")
        print()

        # Record a successful task
        print("Recording a successful task…")
        updated = client.record_task("success", "Completed portfolio analysis with 94% accuracy")
        print(f"New score: {updated.score} (+{updated.score - rep.score})")
        print(f"Tier:      {updated.tier.upper()}\n")

        # Anchor score on-chain
        print("Committing reputation snapshot to Solana…")
        snapshot = client.commit_reputation_snapshot()
        print(f"Score snapshot: {snapshot.score} ({snapshot.tier})")
        if snapshot.explorer_url:
            print(f"On-chain: {snapshot.explorer_url}")


if __name__ == "__main__":
    main()
