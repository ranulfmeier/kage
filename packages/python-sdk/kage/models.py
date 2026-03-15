"""
Kage SDK — data models.
All fields map 1-to-1 with the JSON returned by the Kage API server.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ── Memory ────────────────────────────────────────────────────────────────────

@dataclass
class Memory:
    id: str
    type: str
    time: str
    index: int


@dataclass
class StoreProof:
    cid: str | None = None
    tx_signature: str | None = None
    explorer_url: str | None = None
    umbra_proof: str | None = None


@dataclass
class ReasoningProof:
    trace_id: str
    char_count: int
    content_hash: str
    tx_signature: str | None = None
    explorer_url: str | None = None


@dataclass
class ChatResponse:
    text: str
    proof: StoreProof | None = None
    reasoning: ReasoningProof | None = None
    reasoning_steps: list[str] = field(default_factory=list)


# ── Delegation ────────────────────────────────────────────────────────────────

@dataclass
class DelegationTask:
    task_id: str
    from_agent: str
    to_agent: str
    status: str
    explorer_url: str | None = None
    created_at: str = ""


# ── Messaging ─────────────────────────────────────────────────────────────────

@dataclass
class AgentMessage:
    message_id: str
    from_agent: str
    to_agent: str
    sent_at: str
    read: bool = False
    explorer_url: str | None = None


# ── Group Vault ───────────────────────────────────────────────────────────────

@dataclass
class GroupVault:
    group_id: str
    creator: str
    threshold: int
    total_members: int
    entry_count: int
    has_key: bool
    created_at: str
    explorer_url: str | None = None


# ── Team Vault ────────────────────────────────────────────────────────────────

@dataclass
class TeamMember:
    public_key: str
    x25519_public_key: str
    role: str  # "owner" | "admin" | "member"
    display_name: str | None = None
    added_at: int = 0
    added_by: str = ""


@dataclass
class TeamSecret:
    id: str
    label: str
    created_by: str
    created_at: int
    description: str | None = None
    on_chain_tx: str | None = None
    explorer_url: str | None = None


@dataclass
class TeamEvent:
    type: str
    actor: str
    payload: dict[str, Any]
    timestamp: int
    on_chain_tx: str | None = None


@dataclass
class Team:
    id: str
    name: str
    threshold: int
    members: list[TeamMember]
    secrets: list[TeamSecret]
    event_log: list[TeamEvent]
    created_by: str
    created_at: int
    description: str | None = None
    on_chain_tx: str | None = None
    explorer_url: str | None = None


# ── Shielded Payments ─────────────────────────────────────────────────────────

@dataclass
class Payment:
    payment_id: str
    direction: str  # "sent" | "received"
    amount_sol: float
    stealth_address: str
    created_at: str
    ephemeral_pub: str | None = None
    explorer_url: str | None = None


# ── DID ───────────────────────────────────────────────────────────────────────

@dataclass
class DIDDocument:
    id: str
    controller: str
    created: str
    updated: str
    verification_method: list[dict[str, Any]] = field(default_factory=list)
    service: list[dict[str, Any]] = field(default_factory=list)
    kage: dict[str, Any] = field(default_factory=dict)


@dataclass
class Credential:
    credential_id: str
    issuer: str
    subject: str
    type: str
    claim: dict[str, Any]
    claim_hash: str
    signature: str
    issued_at: int
    expires_at: int | None = None
    tx_signature: str | None = None
    explorer_url: str | None = None


# ── Reputation ────────────────────────────────────────────────────────────────

@dataclass
class ReputationEvent:
    type: str
    delta: int
    score_after: int
    description: str
    timestamp: int
    tx_signature: str | None = None


@dataclass
class AgentReputation:
    did: str
    score: int
    tier: str  # "newcomer" | "trusted" | "verified" | "elite"
    total_tasks: int
    successful_tasks: int
    failed_tasks: int
    slash_count: int
    last_updated: int
    events: list[ReputationEvent] = field(default_factory=list)
    last_tx_signature: str | None = None


@dataclass
class ReputationSnapshot:
    score: int
    tier: str
    tx_signature: str | None = None
    explorer_url: str | None = None
