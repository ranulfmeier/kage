"""
LangChain tool wrappers for Kage — privacy-first AI agent memory vault.

Usage:
    from kage.langchain import get_kage_tools

    tools = get_kage_tools(base_url="http://localhost:3002")
    # Pass `tools` to your LangChain agent
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional, Type

from pydantic import BaseModel, Field

try:
    from langchain_core.tools import BaseTool
except ImportError:
    raise ImportError(
        "langchain-core is required for Kage LangChain tools. "
        "Install it with: pip install kage-sdk[langchain]"
    )

from .client import KageAsyncClient

# ── Input Schemas ─────────────────────────────────────────────────────────────


class StoreMemoryInput(BaseModel):
    text: str = Field(description="The text or information to store in the agent's encrypted memory vault")


class RecallMemoryInput(BaseModel):
    query: str = Field(default="", description="Optional search query to recall specific memories. Leave empty to list all.")


class DelegateTaskInput(BaseModel):
    to_pubkey: str = Field(description="Solana public key of the agent to delegate the task to")
    instruction: str = Field(description="Task instruction/description for the delegatee")
    priority: str = Field(default="normal", description="Task priority: low, normal, high, critical")


class SendMessageInput(BaseModel):
    to_pubkey: str = Field(description="Recipient agent's Solana public key")
    to_x25519: str = Field(description="Recipient's X25519 public key for encryption")
    content: str = Field(description="Message content to send (will be encrypted end-to-end)")


class RecordTaskInput(BaseModel):
    outcome: str = Field(description="Task outcome: success, partial, or failure")
    description: str = Field(default="", description="Optional description of what was accomplished")


class IssueCredentialInput(BaseModel):
    subject_did: str = Field(description="DID of the agent receiving the credential (e.g. did:sol:...)")
    cred_type: str = Field(description="Credential type (e.g. AgentCapability, TradingPermission)")
    claim: dict = Field(description="Claims to include in the credential")


class TeamSecretInput(BaseModel):
    team_id: str = Field(description="Team vault ID")
    label: str = Field(description="Label for the secret")
    data: str = Field(description="Secret data to store (will be encrypted)")
    description: str = Field(default="", description="Optional description")


# ── Tools ─────────────────────────────────────────────────────────────────────


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


class KageStoreMemoryTool(BaseTool):
    name: str = "kage_store_memory"
    description: str = (
        "Store information in the agent's encrypted memory vault on Solana. "
        "The data is encrypted with AES-256-GCM before storage and committed on-chain."
    )
    args_schema: Type[BaseModel] = StoreMemoryInput
    base_url: str = "http://localhost:3002"

    def _run(self, text: str) -> str:
        return _run_async(self._arun(text))

    async def _arun(self, text: str) -> str:
        async with KageAsyncClient(self.base_url) as client:
            resp = await client.store(text)
            proof = resp.proof
            if proof and proof.tx_signature:
                return f"Stored. CID: {proof.cid} | TX: {proof.tx_signature}"
            return f"Stored. Response: {resp.text}"


class KageRecallMemoryTool(BaseTool):
    name: str = "kage_recall_memory"
    description: str = (
        "Recall or search memories from the agent's encrypted vault. "
        "Provide a query to search specific memories, or leave empty to list all."
    )
    args_schema: Type[BaseModel] = RecallMemoryInput
    base_url: str = "http://localhost:3002"

    def _run(self, query: str = "") -> str:
        return _run_async(self._arun(query))

    async def _arun(self, query: str = "") -> str:
        async with KageAsyncClient(self.base_url) as client:
            resp = await client.recall(query)
            return resp.text


class KageListMemoriesTool(BaseTool):
    name: str = "kage_list_memories"
    description: str = "List all memories stored in the agent's encrypted vault with their types and timestamps."
    base_url: str = "http://localhost:3002"

    def _run(self) -> str:
        return _run_async(self._arun())

    async def _arun(self) -> str:
        async with KageAsyncClient(self.base_url) as client:
            memories = await client.list_memories()
            if not memories:
                return "No memories stored yet."
            lines = [f"- [{m.type}] {m.id} (index {m.index}, {m.time})" for m in memories]
            return f"Found {len(memories)} memories:\n" + "\n".join(lines)


class KageDelegateTaskTool(BaseTool):
    name: str = "kage_delegate_task"
    description: str = (
        "Delegate a task to another AI agent via encrypted shielded delegation. "
        "The task payload is encrypted end-to-end — only the assigned agent can decrypt it."
    )
    args_schema: Type[BaseModel] = DelegateTaskInput
    base_url: str = "http://localhost:3002"

    def _run(self, to_pubkey: str, instruction: str, priority: str = "normal") -> str:
        return _run_async(self._arun(to_pubkey, instruction, priority))

    async def _arun(self, to_pubkey: str, instruction: str, priority: str = "normal") -> str:
        async with KageAsyncClient(self.base_url) as client:
            result = await client.delegate(to_pubkey, instruction, priority)
            task_id = result.get("taskId", "unknown")
            return f"Task delegated. ID: {task_id} | To: {to_pubkey[:8]}... | Priority: {priority}"


class KageSendMessageTool(BaseTool):
    name: str = "kage_send_message"
    description: str = (
        "Send an encrypted message to another agent. Uses X25519 ECDH for key exchange "
        "and AES-256-GCM for encryption. The message hash is anchored on Solana."
    )
    args_schema: Type[BaseModel] = SendMessageInput
    base_url: str = "http://localhost:3002"

    def _run(self, to_pubkey: str, to_x25519: str, content: str) -> str:
        return _run_async(self._arun(to_pubkey, to_x25519, content))

    async def _arun(self, to_pubkey: str, to_x25519: str, content: str) -> str:
        async with KageAsyncClient(self.base_url) as client:
            result = await client.send_message(to_pubkey, to_x25519, content)
            msg_id = result.get("messageId", "unknown")
            return f"Message sent. ID: {msg_id} | To: {to_pubkey[:8]}..."


class KageGetReputationTool(BaseTool):
    name: str = "kage_get_reputation"
    description: str = "Get the current reputation score, tier, and task history for this agent."
    base_url: str = "http://localhost:3002"

    def _run(self) -> str:
        return _run_async(self._arun())

    async def _arun(self) -> str:
        async with KageAsyncClient(self.base_url) as client:
            rep = await client.get_reputation()
            return (
                f"DID: {rep.did}\n"
                f"Score: {rep.score}/1000 | Tier: {rep.tier}\n"
                f"Tasks: {rep.total_tasks} total, {rep.successful_tasks} success, {rep.failed_tasks} failed\n"
                f"Slashes: {rep.slash_count}"
            )


class KageRecordTaskTool(BaseTool):
    name: str = "kage_record_task"
    description: str = "Record a task outcome (success/partial/failure) on the agent's reputation history."
    args_schema: Type[BaseModel] = RecordTaskInput
    base_url: str = "http://localhost:3002"

    def _run(self, outcome: str, description: str = "") -> str:
        return _run_async(self._arun(outcome, description))

    async def _arun(self, outcome: str, description: str = "") -> str:
        async with KageAsyncClient(self.base_url) as client:
            rep = await client.record_task(outcome, description)
            return f"Task recorded. New score: {rep.score}/1000 | Tier: {rep.tier}"


class KageIssueCredentialTool(BaseTool):
    name: str = "kage_issue_credential"
    description: str = (
        "Issue a verifiable credential (VC) to another agent. "
        "The credential is signed with Ed25519 and committed on-chain."
    )
    args_schema: Type[BaseModel] = IssueCredentialInput
    base_url: str = "http://localhost:3002"

    def _run(self, subject_did: str, cred_type: str, claim: dict) -> str:
        return _run_async(self._arun(subject_did, cred_type, claim))

    async def _arun(self, subject_did: str, cred_type: str, claim: dict) -> str:
        async with KageAsyncClient(self.base_url) as client:
            cred = await client.issue_credential(subject_did, cred_type, claim)
            return f"Credential issued. ID: {cred.credential_id} | Type: {cred.type} | Subject: {cred.subject}"


class KageGetDIDTool(BaseTool):
    name: str = "kage_get_did"
    description: str = "Get this agent's Decentralized Identifier (DID) and identity document."
    base_url: str = "http://localhost:3002"

    def _run(self) -> str:
        return _run_async(self._arun())

    async def _arun(self) -> str:
        async with KageAsyncClient(self.base_url) as client:
            did, doc = await client.get_did()
            caps = doc.kage.get("capabilities", []) if doc else []
            return f"DID: {did}\nCapabilities: {', '.join(caps)}"


class KageTeamSecretTool(BaseTool):
    name: str = "kage_store_team_secret"
    description: str = "Store an encrypted secret in a team vault. Requires Shamir threshold for retrieval."
    args_schema: Type[BaseModel] = TeamSecretInput
    base_url: str = "http://localhost:3002"

    def _run(self, team_id: str, label: str, data: str, description: str = "") -> str:
        return _run_async(self._arun(team_id, label, data, description))

    async def _arun(self, team_id: str, label: str, data: str, description: str = "") -> str:
        async with KageAsyncClient(self.base_url) as client:
            secret = await client.store_team_secret(team_id, label, data, description)
            return f"Secret stored. ID: {secret.id} | Label: {secret.label}"


# ── Toolkit ───────────────────────────────────────────────────────────────────


def get_kage_tools(base_url: str = "http://localhost:3002") -> list[BaseTool]:
    """
    Get all Kage tools for use with a LangChain agent.

    Usage:
        from kage.langchain import get_kage_tools
        from langchain.agents import create_tool_calling_agent

        tools = get_kage_tools("http://localhost:3002")
        agent = create_tool_calling_agent(llm, tools, prompt)
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
        KageTeamSecretTool(base_url=base_url),
    ]
