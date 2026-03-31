"""
Kage SDK — Python client.

KageClient wraps the Kage API server's HTTP REST and WebSocket endpoints.
Cryptography is handled server-side; the SDK is a thin, typed interface.

Usage (async):
    async with KageClient("https://kageapi-production.up.railway.app") as client:
        response = await client.chat("Remember: the API key is sk-xxx")
        print(response.text)

Usage (sync, via run_sync helper):
    client = KageClient.sync("https://kageapi-production.up.railway.app")
    response = client.chat("Remember: the API key is sk-xxx")
"""
from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
import websockets

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

__all__ = ["KageClient", "KageAsyncClient"]


def _parse_proof(d: dict | None) -> StoreProof | None:
    if not d:
        return None
    return StoreProof(
        cid=d.get("cid"),
        tx_signature=d.get("txSignature"),
        explorer_url=d.get("explorerUrl"),
        umbra_proof=d.get("umbraProof"),
    )


def _parse_reasoning(d: dict | None) -> ReasoningProof | None:
    if not d:
        return None
    return ReasoningProof(
        trace_id=d["traceId"],
        char_count=d["charCount"],
        content_hash=d["contentHash"],
        tx_signature=d.get("txSignature"),
        explorer_url=d.get("explorerUrl"),
    )


def _parse_reputation(d: dict) -> AgentReputation:
    events = [
        ReputationEvent(
            type=e.get("type", ""),
            delta=e.get("delta", 0),
            score_after=e.get("scoreAfter", e.get("score", 0)),
            description=e.get("description", ""),
            timestamp=e.get("timestamp", 0),
            tx_signature=e.get("txSignature"),
        )
        for e in d.get("events", [])
    ]
    return AgentReputation(
        did=d.get("agentDID") or d.get("did", ""),
        score=d.get("score", 0),
        tier=d.get("tier", "newcomer"),
        total_tasks=d.get("totalTasks", 0),
        successful_tasks=d.get("successfulTasks", 0),
        failed_tasks=d.get("failedTasks", 0),
        slash_count=d.get("slashCount", 0),
        last_updated=d.get("lastUpdated", 0),
        events=events,
        last_tx_signature=d.get("lastTxSignature"),
    )


def _parse_team(d: dict) -> Team:
    members = [
        TeamMember(
            public_key=m["publicKey"],
            x25519_public_key=m["x25519PublicKey"],
            role=m["role"],
            display_name=m.get("displayName"),
            added_at=m.get("addedAt", 0),
            added_by=m.get("addedBy", ""),
        )
        for m in d.get("members", [])
    ]
    secrets = [
        TeamSecret(
            id=s["id"],
            label=s["label"],
            created_by=s["createdBy"],
            created_at=s["createdAt"],
            description=s.get("description"),
            on_chain_tx=s.get("onChainTx"),
            explorer_url=s.get("explorerUrl"),
        )
        for s in d.get("secrets", [])
    ]
    return Team(
        id=d["id"],
        name=d["name"],
        threshold=d["threshold"],
        members=members,
        secrets=secrets,
        event_log=[],
        created_by=d["createdBy"],
        created_at=d["createdAt"],
        description=d.get("description"),
        on_chain_tx=d.get("onChainTx"),
        explorer_url=d.get("explorerUrl"),
    )


# ── Async client ──────────────────────────────────────────────────────────────

class KageAsyncClient:
    """
    Async Kage API client.

    Uses httpx for REST calls and websockets for streaming chat.
    """

    def __init__(self, base_url: str = "http://localhost:3002") -> None:
        self.base_url = base_url.rstrip("/")
        self.ws_url = self.base_url.replace("https://", "wss://").replace("http://", "ws://")
        self._http: httpx.AsyncClient | None = None

    async def __aenter__(self) -> KageAsyncClient:
        self._http = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._http:
            await self._http.aclose()

    def _http_client(self) -> httpx.AsyncClient:
        if self._http is None:
            raise RuntimeError("Use 'async with KageAsyncClient(...) as client:'")
        return self._http

    # ── Health ────────────────────────────────────────────────────────────────

    async def health(self) -> dict[str, Any]:
        """Check API server health and agent status."""
        r = await self._http_client().get("/health")
        r.raise_for_status()
        return r.json()

    async def agent_info(self) -> dict[str, Any]:
        """Return agent Solana public key and X25519 viewing key."""
        r = await self._http_client().get("/agent/x25519")
        r.raise_for_status()
        return r.json()

    # ── Chat / Memory ─────────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        *,
        deep_think: bool = False,
        stream_steps: bool = False,
    ) -> ChatResponse:
        """
        Send a chat message and return the agent's response.

        Args:
            message: The user message to send.
            deep_think: Enable Claude's Extended Thinking (slower, deeper).
            stream_steps: If True, print reasoning steps as they arrive.

        Returns:
            ChatResponse with text, optional proof, and reasoning.
        """
        reasoning_steps: list[str] = []
        final_text = ""
        proof: StoreProof | None = None
        reasoning: ReasoningProof | None = None

        async with websockets.connect(f"{self.ws_url}/ws") as ws:
            # Wait for connected message and set deep_think mode
            raw = await ws.recv()
            msg = json.loads(raw)
            if msg.get("type") == "connected" and deep_think:
                await ws.send(json.dumps({"type": "toggle_deep_think"}))
                await ws.recv()  # consume deep_think_status

            # Send the chat message
            await ws.send(json.dumps({"type": "chat", "message": message}))

            # Consume messages until we get the final response
            async for raw in ws:
                msg = json.loads(raw)
                t = msg.get("type")

                if t == "typing":
                    continue
                elif t == "reasoning_step":
                    step = msg.get("step", "")
                    reasoning_steps.append(step)
                    if stream_steps:
                        print(f"  [{len(reasoning_steps)}] {step}")
                elif t == "message":
                    final_text = msg.get("message", "")
                    proof = _parse_proof(msg.get("proof"))
                    reasoning = _parse_reasoning(msg.get("reasoning"))
                    break
                elif t == "error":
                    raise RuntimeError(msg.get("message", "Unknown error from agent"))

        return ChatResponse(
            text=final_text,
            proof=proof,
            reasoning=reasoning,
            reasoning_steps=reasoning_steps,
        )

    async def store(self, text: str) -> ChatResponse:
        """Store a memory via HTTP POST /chat (no WebSocket needed)."""
        return await self.chat_http(f"Remember: {text}")

    async def recall(self, query: str = "") -> ChatResponse:
        """Recall memories via HTTP POST /chat (no WebSocket needed)."""
        prompt = f"Recall: {query}" if query else "List all my memories"
        return await self.chat_http(prompt)

    async def chat_http(self, message: str, *, deep_think: bool = False) -> ChatResponse:
        """Send a chat via HTTP POST /chat — simpler alternative to WebSocket."""
        r = await self._http_client().post(
            "/chat",
            json={"message": message, "deep_think": deep_think},
        )
        r.raise_for_status()
        data = r.json()
        proof_data = data.get("proof")
        proof = StoreProof(
            cid=proof_data["cid"],
            content_hash=proof_data.get("hash", ""),
            tx_signature=proof_data.get("txSignature"),
        ) if proof_data else None
        return ChatResponse(
            text=data.get("reply", ""),
            proof=proof,
            reasoning=None,
            reasoning_steps=[],
        )

    async def list_memories(self) -> list[Memory]:
        """Fetch the raw memory index from the vault."""
        r = await self._http_client().get("/memories")
        r.raise_for_status()
        data = r.json()
        return [
            Memory(id=m["id"], type=m["type"], time=m["time"], index=m["index"])
            for m in data.get("memories", [])
        ]

    # ── Delegation ────────────────────────────────────────────────────────────

    async def delegate(
        self,
        to_pubkey: str,
        instruction: str,
        priority: str = "normal",
        deadline_ms: int | None = None,
    ) -> dict[str, Any]:
        """
        Delegate a task to another agent (encrypted payload).

        Args:
            to_pubkey: Recipient agent's Solana public key.
            instruction: Task description (encrypted before sending).
            priority: "low" | "normal" | "high"
            deadline_ms: Optional deadline in milliseconds from now.
        """
        payload: dict[str, Any] = {
            "recipientPubkey": to_pubkey,
            "instruction": instruction,
            "priority": priority,
        }
        if deadline_ms is not None:
            payload["deadlineMs"] = deadline_ms

        r = await self._http_client().post("/delegate", json=payload)
        r.raise_for_status()
        return r.json()

    async def list_tasks(self) -> list[dict[str, Any]]:
        """List active delegation tasks."""
        r = await self._http_client().get("/tasks")
        r.raise_for_status()
        return r.json().get("tasks", [])

    # ── Messaging ─────────────────────────────────────────────────────────────

    async def send_message(
        self,
        to_pubkey: str,
        to_x25519: str,
        content: str,
    ) -> dict[str, Any]:
        """
        Send an encrypted message to another agent.

        Args:
            to_pubkey: Recipient's Solana public key.
            to_x25519: Recipient's X25519 public key (base64).
            content: Message body (AES-256-GCM encrypted in transit).
        """
        r = await self._http_client().post("/send", json={
            "recipientPubkey": to_pubkey,
            "recipientX25519": to_x25519,
            "content": content,
        })
        r.raise_for_status()
        return r.json()

    async def inbox(self) -> list[dict[str, Any]]:
        """Fetch received messages."""
        r = await self._http_client().get("/inbox")
        r.raise_for_status()
        return r.json().get("messages", [])

    # ── Shielded Payments ─────────────────────────────────────────────────────

    async def send_payment(
        self,
        to_pubkey: str,
        viewing_key: str,
        amount_sol: float,
        memo: str = "",
    ) -> Payment:
        """
        Send a shielded SOL payment to a stealth address.

        Args:
            to_pubkey: Recipient's Solana public key.
            viewing_key: Recipient's X25519 viewing key (base64).
            amount_sol: Amount in SOL (e.g. 0.01).
            memo: Optional payment memo.
        """
        r = await self._http_client().post("/pay", json={
            "recipientSolana": to_pubkey,
            "recipientViewing": viewing_key,
            "amountSol": amount_sol,
            "memo": memo or None,
        })
        r.raise_for_status()
        d = r.json().get("payment", {})
        return Payment(
            payment_id=d.get("paymentId", ""),
            direction="sent",
            amount_sol=amount_sol,
            stealth_address=d.get("stealthAddress", ""),
            created_at=d.get("createdAt", ""),
            ephemeral_pub=d.get("ephemeralPub"),
            explorer_url=d.get("explorerUrl"),
        )

    async def scan_payments(self) -> list[Payment]:
        """Scan for payments received to stealth addresses."""
        r = await self._http_client().get("/payments")
        r.raise_for_status()
        return [
            Payment(
                payment_id=p.get("paymentId", ""),
                direction=p.get("direction", "received"),
                amount_sol=p.get("amountSol", 0),
                stealth_address=p.get("stealthAddress", ""),
                created_at=p.get("createdAt", ""),
                explorer_url=p.get("explorerUrl"),
            )
            for p in r.json().get("payments", [])
        ]

    # ── DID ───────────────────────────────────────────────────────────────────

    async def get_did(self) -> tuple[str, DIDDocument | None]:
        """Return (did_string, DIDDocument) for this agent."""
        r = await self._http_client().get("/did")
        r.raise_for_status()
        d = r.json()
        doc_data = d.get("document")
        doc = None
        if doc_data:
            doc = DIDDocument(
                id=doc_data["id"],
                controller=doc_data["controller"],
                created=doc_data.get("created", ""),
                updated=doc_data.get("updated", ""),
                verification_method=doc_data.get("verificationMethod", []),
                service=doc_data.get("service", []),
                kage=doc_data.get("kage", {}),
            )
        return d.get("did", ""), doc

    async def issue_credential(
        self,
        subject_did: str,
        cred_type: str,
        claim: dict[str, Any],
        expires_in_ms: int | None = None,
    ) -> Credential:
        """Issue a Verifiable Credential to another DID."""
        payload: dict[str, Any] = {
            "subjectDID": subject_did,
            "type": cred_type,
            "claim": claim,
        }
        if expires_in_ms is not None:
            payload["expiresInMs"] = expires_in_ms

        r = await self._http_client().post("/did/credential/issue", json=payload)
        r.raise_for_status()
        c = r.json().get("credential", {})
        return Credential(
            credential_id=c["credentialId"],
            issuer=c["issuer"],
            subject=c["subject"],
            type=c["type"],
            claim=c["claim"],
            claim_hash=c["claimHash"],
            signature=c["signature"],
            issued_at=c["issuedAt"],
            expires_at=c.get("expiresAt"),
            tx_signature=c.get("txSignature"),
            explorer_url=c.get("explorerUrl"),
        )

    async def verify_credential(self, credential: dict[str, Any]) -> dict[str, Any]:
        """Verify a Verifiable Credential. Returns {valid, reason?}."""
        r = await self._http_client().post("/did/credential/verify", json={"credential": credential})
        r.raise_for_status()
        return r.json()

    async def list_credentials(self) -> list[Credential]:
        """List all credentials held by this agent."""
        r = await self._http_client().get("/did/credentials")
        r.raise_for_status()
        return [
            Credential(
                credential_id=c["credentialId"],
                issuer=c["issuer"],
                subject=c["subject"],
                type=c["type"],
                claim=c["claim"],
                claim_hash=c["claimHash"],
                signature=c["signature"],
                issued_at=c["issuedAt"],
                expires_at=c.get("expiresAt"),
                tx_signature=c.get("txSignature"),
                explorer_url=c.get("explorerUrl"),
            )
            for c in r.json().get("credentials", [])
        ]

    # ── Reputation ────────────────────────────────────────────────────────────

    async def get_reputation(self) -> AgentReputation:
        """Get this agent's reputation score and event history."""
        r = await self._http_client().get("/reputation")
        r.raise_for_status()
        return _parse_reputation(r.json().get("reputation", {}))

    async def record_task(
        self,
        outcome: str,
        description: str = "",
    ) -> AgentReputation:
        """
        Record a task outcome and update reputation score.

        Args:
            outcome: "success" | "partial" | "failure"
            description: Human-readable description of the task.
        """
        r = await self._http_client().post("/reputation/task", json={
            "outcome": outcome,
            "description": description or None,
        })
        r.raise_for_status()
        return _parse_reputation(r.json().get("reputation", {}))

    async def slash(self, reason: str) -> AgentReputation:
        """Apply a slash penalty to this agent's reputation."""
        r = await self._http_client().post("/reputation/slash", json={"reason": reason})
        r.raise_for_status()
        return _parse_reputation(r.json().get("reputation", {}))

    async def commit_reputation_snapshot(self) -> ReputationSnapshot:
        """Anchor the current reputation score on Solana."""
        r = await self._http_client().post("/reputation/snapshot")
        r.raise_for_status()
        s = r.json().get("snapshot", {})
        return ReputationSnapshot(
            score=s.get("score", 0),
            tier=s.get("tier", ""),
            tx_signature=s.get("txSignature"),
            explorer_url=s.get("explorerUrl"),
        )

    async def leaderboard(self) -> list[AgentReputation]:
        """Get the reputation leaderboard."""
        r = await self._http_client().get("/reputation/leaderboard")
        r.raise_for_status()
        return [_parse_reputation(a) for a in r.json().get("leaderboard", [])]

    # ── Team Vault ────────────────────────────────────────────────────────────

    async def create_team(
        self,
        name: str,
        description: str = "",
        threshold: int = 1,
        members: list[dict[str, str]] | None = None,
    ) -> Team:
        """
        Create a new team vault.

        Args:
            name: Team name.
            description: Optional description.
            threshold: m-of-n threshold for key reconstruction.
            members: List of {"publicKey", "x25519PublicKey", "role"} dicts.
        """
        r = await self._http_client().post("/team/create", json={
            "name": name,
            "description": description or None,
            "threshold": threshold,
            "members": members or [],
        })
        r.raise_for_status()
        return _parse_team(r.json().get("team", {}))

    async def list_teams(self) -> list[Team]:
        """List all teams this agent belongs to."""
        r = await self._http_client().get("/team")
        r.raise_for_status()
        return [_parse_team(t) for t in r.json().get("teams", [])]

    async def get_team(self, team_id: str) -> Team:
        """Get a specific team by ID."""
        r = await self._http_client().get(f"/team/{team_id}")
        r.raise_for_status()
        return _parse_team(r.json().get("team", {}))

    async def store_team_secret(
        self,
        team_id: str,
        label: str,
        data: Any,
        description: str = "",
    ) -> TeamSecret:
        """
        Store an encrypted secret in a team vault.

        Args:
            team_id: Target team ID.
            label: Human-readable label (e.g. "Production API Key").
            data: Secret data — any JSON-serialisable value.
            description: Optional description.
        """
        r = await self._http_client().post(f"/team/{team_id}/secret", json={
            "label": label,
            "data": data,
            "description": description or None,
        })
        r.raise_for_status()
        s = r.json().get("secret", {})
        return TeamSecret(
            id=s["id"],
            label=s["label"],
            created_by=s["createdBy"],
            created_at=s["createdAt"],
            description=s.get("description"),
            on_chain_tx=s.get("onChainTx"),
            explorer_url=s.get("explorerUrl"),
        )

    async def retrieve_team_secret(self, team_id: str, secret_id: str) -> dict[str, Any]:
        """Decrypt and retrieve a team secret. Returns {label, data}."""
        r = await self._http_client().get(f"/team/{team_id}/secret/{secret_id}")
        r.raise_for_status()
        return r.json()


# ── Sync wrapper ──────────────────────────────────────────────────────────────

class KageClient:
    """
    Synchronous Kage client — wraps KageAsyncClient via asyncio.run().

    Convenient for scripts and notebooks that don't use async/await.

    Example:
        with KageClient("https://kageapi-production.up.railway.app") as client:
            response = client.chat("Remember: ETH is at 3200")
            print(response.text)
    """

    def __init__(self, base_url: str = "http://localhost:3002") -> None:
        self._async = KageAsyncClient(base_url)
        self._loop: asyncio.AbstractEventLoop | None = None

    def __enter__(self) -> KageClient:
        self._loop = asyncio.new_event_loop()
        self._loop.run_until_complete(self._async.__aenter__())
        return self

    def __exit__(self, *args: Any) -> None:
        if self._loop:
            self._loop.run_until_complete(self._async.__aexit__(*args))
            self._loop.close()

    def _run(self, coro: Any) -> Any:
        if not self._loop:
            raise RuntimeError("Use 'with KageClient(...) as client:'")
        return self._loop.run_until_complete(coro)

    # Delegate every method to the async version synchronously
    def health(self) -> dict[str, Any]:
        return self._run(self._async.health())

    def agent_info(self) -> dict[str, Any]:
        return self._run(self._async.agent_info())

    def chat(self, message: str, *, deep_think: bool = False, stream_steps: bool = False) -> ChatResponse:
        return self._run(self._async.chat(message, deep_think=deep_think, stream_steps=stream_steps))

    def store(self, text: str) -> ChatResponse:
        return self._run(self._async.store(text))

    def recall(self, query: str = "") -> ChatResponse:
        return self._run(self._async.recall(query))

    def list_memories(self) -> list[Memory]:
        return self._run(self._async.list_memories())

    def delegate(self, to_pubkey: str, instruction: str, priority: str = "normal", deadline_ms: int | None = None) -> dict[str, Any]:
        return self._run(self._async.delegate(to_pubkey, instruction, priority, deadline_ms))

    def list_tasks(self) -> list[dict[str, Any]]:
        return self._run(self._async.list_tasks())

    def send_message(self, to_pubkey: str, to_x25519: str, content: str) -> dict[str, Any]:
        return self._run(self._async.send_message(to_pubkey, to_x25519, content))

    def inbox(self) -> list[dict[str, Any]]:
        return self._run(self._async.inbox())

    def send_payment(self, to_pubkey: str, viewing_key: str, amount_sol: float, memo: str = "") -> Payment:
        return self._run(self._async.send_payment(to_pubkey, viewing_key, amount_sol, memo))

    def scan_payments(self) -> list[Payment]:
        return self._run(self._async.scan_payments())

    def get_did(self) -> tuple[str, DIDDocument | None]:
        return self._run(self._async.get_did())

    def issue_credential(self, subject_did: str, cred_type: str, claim: dict[str, Any], expires_in_ms: int | None = None) -> Credential:
        return self._run(self._async.issue_credential(subject_did, cred_type, claim, expires_in_ms))

    def verify_credential(self, credential: dict[str, Any]) -> dict[str, Any]:
        return self._run(self._async.verify_credential(credential))

    def list_credentials(self) -> list[Credential]:
        return self._run(self._async.list_credentials())

    def get_reputation(self) -> AgentReputation:
        return self._run(self._async.get_reputation())

    def record_task(self, outcome: str, description: str = "") -> AgentReputation:
        return self._run(self._async.record_task(outcome, description))

    def slash(self, reason: str) -> AgentReputation:
        return self._run(self._async.slash(reason))

    def commit_reputation_snapshot(self) -> ReputationSnapshot:
        return self._run(self._async.commit_reputation_snapshot())

    def leaderboard(self) -> list[AgentReputation]:
        return self._run(self._async.leaderboard())

    def create_team(self, name: str, description: str = "", threshold: int = 1, members: list[dict[str, str]] | None = None) -> Team:
        return self._run(self._async.create_team(name, description, threshold, members))

    def list_teams(self) -> list[Team]:
        return self._run(self._async.list_teams())

    def get_team(self, team_id: str) -> Team:
        return self._run(self._async.get_team(team_id))

    def store_team_secret(self, team_id: str, label: str, data: Any, description: str = "") -> TeamSecret:
        return self._run(self._async.store_team_secret(team_id, label, data, description))

    def retrieve_team_secret(self, team_id: str, secret_id: str) -> dict[str, Any]:
        return self._run(self._async.retrieve_team_secret(team_id, secret_id))
