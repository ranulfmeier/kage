"""
Example 1 — Basic chat and encrypted memory.

Run:
    pip install kage-sdk
    python basic_chat.py
"""
from kage import KageClient

API_URL = "http://localhost:3002"  # or "https://kageapi-production.up.railway.app"


def main() -> None:
    with KageClient(API_URL) as client:
        # Health check
        info = client.health()
        print(f"Agent: {info.get('agentId', '?')[:12]}…")
        print(f"Network: {info.get('network', '?')}\n")

        # Store a memory (encrypted on-device, anchored on Solana)
        print("Storing an encrypted memory…")
        store_resp = client.store("The trading signal threshold is 0.72 RSI")
        print(f"Response: {store_resp.text}")
        if store_resp.proof and store_resp.proof.explorer_url:
            print(f"On-chain: {store_resp.proof.explorer_url}\n")

        # Recall memories
        print("Recalling memories…")
        recall_resp = client.recall("trading")
        print(f"Response: {recall_resp.text}\n")

        # Chat with deep think
        print("Asking agent to reason deeply…")
        deep_resp = client.chat(
            "What is Shamir's Secret Sharing and why is it used in Kage?",
            deep_think=True,
            stream_steps=True,
        )
        print(f"\nAnswer: {deep_resp.text}")
        if deep_resp.reasoning:
            print(f"Reasoning: {deep_resp.reasoning.char_count} chars encrypted")
            print(f"Hash: {deep_resp.reasoning.content_hash[:24]}…")


if __name__ == "__main__":
    main()
