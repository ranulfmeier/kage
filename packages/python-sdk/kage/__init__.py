"""
kage-sdk — Python client for the Kage privacy-first AI agent.

Quick start:
    pip install kage-sdk

    from kage import KageClient

    with KageClient("https://kageapi-production.up.railway.app") as client:
        response = client.chat("Remember: my Solana wallet is 7xKp...")
        print(response.text)
        if response.proof:
            print("On-chain proof:", response.proof.explorer_url)
"""
from .agent import KageAgent
from .client import KageAsyncClient, KageClient
from .models import (
    AgentReputation,
    ChatResponse,
    Credential,
    DIDDocument,
    GroupVault,
    Memory,
    Payment,
    ReasoningProof,
    ReputationEvent,
    ReputationSnapshot,
    StoreProof,
    Team,
    TeamMember,
    TeamSecret,
)

__all__ = [
    "KageAgent",
    "KageClient",
    "KageAsyncClient",
    # models
    "ChatResponse",
    "StoreProof",
    "ReasoningProof",
    "Memory",
    "Payment",
    "DIDDocument",
    "Credential",
    "AgentReputation",
    "ReputationEvent",
    "ReputationSnapshot",
    "GroupVault",
    "Team",
    "TeamMember",
    "TeamSecret",
]

__version__ = "0.1.0"
