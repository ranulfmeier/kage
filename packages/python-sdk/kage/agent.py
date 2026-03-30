"""
Fluent KageAgent API — high-level interface for privacy-first AI agent operations.

Usage:
    from kage import KageAgent

    agent = KageAgent("http://localhost:3002")
    with agent:
        agent.store_memory("The user prefers dark mode")
        memories = agent.recall("preferences")
        agent.delegate_task("8xPub...", "Analyze this dataset")
        rep = agent.reputation()
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Optional

from .client import KageAsyncClient, KageClient
from .models import (
    AgentReputation,
    ChatResponse,
    Credential,
    DIDDocument,
    Memory,
    Payment,
    ReputationSnapshot,
    Team,
    TeamSecret,
)


@dataclass
class AgentIdentity:
    did: str
    document: Optional[DIDDocument]
    solana_pubkey: Optional[str] = None
    x25519_pubkey: Optional[str] = None


class KageAgent:
    """
    High-level fluent API for Kage agent operations.

    Wraps KageClient with a cleaner interface focused on
    the most common agent workflows.
    """

    def __init__(self, base_url: str = "http://localhost:3002"):
        self._url = base_url
        self._client: Optional[KageClient] = None

    def __enter__(self):
        self._client = KageClient(self._url)
        self._client.__enter__()
        return self

    def __exit__(self, *args):
        if self._client:
            self._client.__exit__(*args)
            self._client = None

    @property
    def _c(self) -> KageClient:
        if not self._client:
            raise RuntimeError("KageAgent must be used as a context manager: with KageAgent() as agent:")
        return self._client

    # ── Memory ────────────────────────────────────────────────────────────────

    def store_memory(self, text: str) -> ChatResponse:
        """Store text in the encrypted memory vault."""
        return self._c.store(text)

    def recall(self, query: str = "") -> str:
        """Recall memories matching the query. Returns the response text."""
        return self._c.recall(query).text

    def list_memories(self) -> list[Memory]:
        """List all stored memories."""
        return self._c.list_memories()

    def chat(self, message: str, *, deep_think: bool = False) -> str:
        """Send a chat message and return the response text."""
        return self._c.chat(message, deep_think=deep_think).text

    # ── Delegation ────────────────────────────────────────────────────────────

    def delegate_task(
        self,
        to_pubkey: str,
        instruction: str,
        priority: str = "normal",
        deadline_ms: Optional[int] = None,
    ) -> dict[str, Any]:
        """Delegate a shielded task to another agent."""
        return self._c.delegate(to_pubkey, instruction, priority, deadline_ms)

    def list_tasks(self) -> list[dict[str, Any]]:
        """List all delegation tasks."""
        return self._c.list_tasks()

    # ── Messaging ─────────────────────────────────────────────────────────────

    def send_message(self, to_pubkey: str, to_x25519: str, content: str) -> dict[str, Any]:
        """Send an encrypted message to another agent."""
        return self._c.send_message(to_pubkey, to_x25519, content)

    def inbox(self) -> list[dict[str, Any]]:
        """Get inbox messages."""
        return self._c.inbox()

    # ── Identity ──────────────────────────────────────────────────────────────

    def identity(self) -> AgentIdentity:
        """Get this agent's DID and identity info."""
        did, doc = self._c.get_did()
        info = self._c.agent_info()
        return AgentIdentity(
            did=did,
            document=doc,
            solana_pubkey=info.get("solanaPubkey"),
            x25519_pubkey=info.get("x25519PublicKey"),
        )

    def issue_credential(
        self,
        subject_did: str,
        cred_type: str,
        claim: dict[str, Any],
        expires_in_ms: Optional[int] = None,
    ) -> Credential:
        """Issue a verifiable credential to another agent."""
        return self._c.issue_credential(subject_did, cred_type, claim, expires_in_ms)

    def verify_credential(self, credential: dict[str, Any]) -> dict[str, Any]:
        """Verify a credential's signature and expiry."""
        return self._c.verify_credential(credential)

    def list_credentials(self) -> list[Credential]:
        """List all credentials issued by or to this agent."""
        return self._c.list_credentials()

    # ── Reputation ────────────────────────────────────────────────────────────

    def reputation(self) -> AgentReputation:
        """Get current reputation score and history."""
        return self._c.get_reputation()

    def record_task(self, outcome: str, description: str = "") -> AgentReputation:
        """Record a task outcome (success/partial/failure)."""
        return self._c.record_task(outcome, description)

    def slash(self, reason: str) -> AgentReputation:
        """Apply a reputation slash."""
        return self._c.slash(reason)

    def reputation_snapshot(self) -> ReputationSnapshot:
        """Commit a reputation snapshot on-chain."""
        return self._c.commit_reputation_snapshot()

    def leaderboard(self) -> list[AgentReputation]:
        """Get the agent reputation leaderboard."""
        return self._c.leaderboard()

    # ── Payments ──────────────────────────────────────────────────────────────

    def send_payment(
        self,
        to_pubkey: str,
        viewing_key: str,
        amount_sol: float,
        memo: str = "",
    ) -> Payment:
        """Send a shielded payment via stealth address."""
        return self._c.send_payment(to_pubkey, viewing_key, amount_sol, memo)

    def scan_payments(self) -> list[Payment]:
        """Scan for incoming shielded payments."""
        return self._c.scan_payments()

    # ── Teams ─────────────────────────────────────────────────────────────────

    def create_team(
        self,
        name: str,
        description: str = "",
        threshold: int = 1,
        members: Optional[list[dict[str, str]]] = None,
    ) -> Team:
        """Create a team vault with Shamir secret sharing."""
        return self._c.create_team(name, description, threshold, members)

    def list_teams(self) -> list[Team]:
        """List all teams."""
        return self._c.list_teams()

    def store_team_secret(
        self,
        team_id: str,
        label: str,
        data: Any,
        description: str = "",
    ) -> TeamSecret:
        """Store a secret in a team vault."""
        return self._c.store_team_secret(team_id, label, data, description)

    def retrieve_team_secret(self, team_id: str, secret_id: str) -> dict[str, Any]:
        """Retrieve a secret from a team vault."""
        return self._c.retrieve_team_secret(team_id, secret_id)

    # ── Health ────────────────────────────────────────────────────────────────

    def health(self) -> dict[str, Any]:
        """Check the Kage API server health."""
        return self._c.health()
