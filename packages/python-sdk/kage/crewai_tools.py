"""
CrewAI tool wrappers for Kage — privacy-first AI agent memory vault.

Usage:
    from kage.crewai_tools import get_kage_tools

    tools = get_kage_tools(base_url="http://localhost:3002")
    agent = Agent(role="...", tools=tools, ...)
"""

from __future__ import annotations

import asyncio
from typing import Any, Type

from pydantic import BaseModel, Field

try:
    from crewai.tools import BaseTool
except ImportError:
    raise ImportError(
        "crewai is required for Kage CrewAI tools. "
        "Install it with: pip install kage-sdk[crewai]"
    )

from .client import KageAsyncClient


def _run_async(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(asyncio.run, coro).result()
    return asyncio.run(coro)


# ── Input Schemas ─────────────────────────────────────────────────────────────


class StoreMemoryInput(BaseModel):
    text: str = Field(description="Text or information to store in the encrypted memory vault")


class RecallMemoryInput(BaseModel):
    query: str = Field(default="", description="Search query for memories. Empty to list all.")


class DelegateTaskInput(BaseModel):
    to_pubkey: str = Field(description="Solana public key of the target agent")
    instruction: str = Field(description="Task instruction for the delegatee")
    priority: str = Field(default="normal", description="Priority: low, normal, high, critical")


class SendMessageInput(BaseModel):
    to_pubkey: str = Field(description="Recipient's Solana public key")
    to_x25519: str = Field(description="Recipient's X25519 public key")
    content: str = Field(description="Message content (encrypted E2E)")


class RecordTaskInput(BaseModel):
    outcome: str = Field(description="Task outcome: success, partial, or failure")
    description: str = Field(default="", description="What was accomplished")


class IssueCredentialInput(BaseModel):
    subject_did: str = Field(description="DID of the credential subject")
    cred_type: str = Field(description="Credential type")
    claim: dict = Field(description="Claims to include")


# ── Tools ─────────────────────────────────────────────────────────────────────


class KageStoreMemoryTool(BaseTool):
    name: str = "Store Memory"
    description: str = (
        "Store information in the agent's AES-256-GCM encrypted memory vault on Solana. "
        "Use this to remember facts, decisions, or any data the agent should retain."
    )
    args_schema: Type[BaseModel] = StoreMemoryInput
    base_url: str = "http://localhost:3002"

    def _run(self, text: str) -> str:
        async def _do():
            async with KageAsyncClient(self.base_url) as client:
                resp = await client.store(text)
                proof = resp.proof
                if proof and proof.tx_signature:
                    return f"Stored. CID: {proof.cid} | TX: {proof.tx_signature}"
                return f"Stored. Response: {resp.text}"
        return _run_async(_do())


class KageRecallMemoryTool(BaseTool):
    name: str = "Recall Memory"
    description: str = (
        "Search and recall memories from the encrypted vault. "
        "Provide a query to find specific memories or leave empty to list all."
    )
    args_schema: Type[BaseModel] = RecallMemoryInput
    base_url: str = "http://localhost:3002"

    def _run(self, query: str = "") -> str:
        async def _do():
            async with KageAsyncClient(self.base_url) as client:
                resp = await client.recall(query)
                return resp.text
        return _run_async(_do())


class KageListMemoriesTool(BaseTool):
    name: str = "List Memories"
    description: str = "List all stored memories with their types, IDs, and timestamps."
    base_url: str = "http://localhost:3002"

    def _run(self) -> str:
        async def _do():
            async with KageAsyncClient(self.base_url) as client:
                memories = await client.list_memories()
                if not memories:
                    return "No memories stored yet."
                lines = [f"- [{m.type}] {m.id} (index {m.index}, {m.time})" for m in memories]
                return f"Found {len(memories)} memories:\n" + "\n".join(lines)
        return _run_async(_do())


class KageDelegateTaskTool(BaseTool):
    name: str = "Delegate Task"
    description: str = (
        "Delegate a task to another AI agent with encrypted shielded payload. "
        "Only the assigned agent can decrypt the instructions."
    )
    args_schema: Type[BaseModel] = DelegateTaskInput
    base_url: str = "http://localhost:3002"

    def _run(self, to_pubkey: str, instruction: str, priority: str = "normal") -> str:
        async def _do():
            async with KageAsyncClient(self.base_url) as client:
                result = await client.delegate(to_pubkey, instruction, priority)
                task_id = result.get("taskId", "unknown")
                return f"Task delegated. ID: {task_id} | To: {to_pubkey[:8]}..."
        return _run_async(_do())


class KageSendMessageTool(BaseTool):
    name: str = "Send Encrypted Message"
    description: str = "Send an E2E encrypted message to another agent via X25519 key exchange."
    args_schema: Type[BaseModel] = SendMessageInput
    base_url: str = "http://localhost:3002"

    def _run(self, to_pubkey: str, to_x25519: str, content: str) -> str:
        async def _do():
            async with KageAsyncClient(self.base_url) as client:
                result = await client.send_message(to_pubkey, to_x25519, content)
                msg_id = result.get("messageId", "unknown")
                return f"Message sent. ID: {msg_id}"
        return _run_async(_do())


class KageGetReputationTool(BaseTool):
    name: str = "Get Reputation"
    description: str = "Check the current reputation score, tier, and task history."
    base_url: str = "http://localhost:3002"

    def _run(self) -> str:
        async def _do():
            async with KageAsyncClient(self.base_url) as client:
                rep = await client.get_reputation()
                return (
                    f"Score: {rep.score}/1000 | Tier: {rep.tier}\n"
                    f"Tasks: {rep.total_tasks} total, {rep.successful_tasks} success"
                )
        return _run_async(_do())


class KageRecordTaskTool(BaseTool):
    name: str = "Record Task Outcome"
    description: str = "Record a task outcome on the agent's reputation history."
    args_schema: Type[BaseModel] = RecordTaskInput
    base_url: str = "http://localhost:3002"

    def _run(self, outcome: str, description: str = "") -> str:
        async def _do():
            async with KageAsyncClient(self.base_url) as client:
                rep = await client.record_task(outcome, description)
                return f"Recorded. Score: {rep.score}/1000 | Tier: {rep.tier}"
        return _run_async(_do())


class KageIssueCredentialTool(BaseTool):
    name: str = "Issue Credential"
    description: str = "Issue a verifiable credential (VC) signed with Ed25519 to another agent."
    args_schema: Type[BaseModel] = IssueCredentialInput
    base_url: str = "http://localhost:3002"

    def _run(self, subject_did: str, cred_type: str, claim: dict) -> str:
        async def _do():
            async with KageAsyncClient(self.base_url) as client:
                cred = await client.issue_credential(subject_did, cred_type, claim)
                return f"Credential issued. ID: {cred.credential_id} | Type: {cred.type}"
        return _run_async(_do())


class KageGetDIDTool(BaseTool):
    name: str = "Get Agent Identity"
    description: str = "Get this agent's Decentralized Identifier (DID) and capabilities."
    base_url: str = "http://localhost:3002"

    def _run(self) -> str:
        async def _do():
            async with KageAsyncClient(self.base_url) as client:
                did, doc = await client.get_did()
                return f"DID: {did}"
        return _run_async(_do())


# ── Toolkit ───────────────────────────────────────────────────────────────────


def get_kage_tools(base_url: str = "http://localhost:3002") -> list[BaseTool]:
    """
    Get all Kage tools for use with CrewAI agents.

    Usage:
        from kage.crewai_tools import get_kage_tools
        from crewai import Agent

        tools = get_kage_tools("http://localhost:3002")
        agent = Agent(role="Research Agent", tools=tools, ...)
    """
    return [
        KageStoreMemoryTool(base_url=base_url),
        KageRecallMemoryTool(base_url=base_url),
        KageListMemoriesTool(base_url=base_url),
        KageDelegateTaskTool(base_url=base_url),
        KageSendMessageTool(base_url=base_url),
        KageGetReputationTool(base_url=base_url),
        KageRecordTaskTool(base_url=base_url),
        KageIssueCredentialTool(base_url=base_url),
        KageGetDIDTool(base_url=base_url),
    ]
