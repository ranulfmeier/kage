# kage-sdk

Python client for the **Kage** privacy-first AI agent — encrypted memories, DID, reputation, team vaults, and shielded payments on Solana.

> Cryptography runs server-side (Kage API). The SDK is a thin, typed wrapper around the REST + WebSocket API.

## Install

```bash
pip install kage-sdk
```

**Requirements:** Python 3.10+

## Quick Start

### Sync (scripts / notebooks)

```python
from kage import KageClient

with KageClient("https://kageapi.up.railway.app") as client:
    # Store an encrypted memory
    resp = client.store("The RSI threshold for my strategy is 0.72")
    print(resp.text)
    if resp.proof:
        print("Solana tx:", resp.proof.explorer_url)

    # Recall memories
    resp = client.recall("RSI threshold")
    print(resp.text)
```

### Async (FastAPI / asyncio)

```python
import asyncio
from kage import KageAsyncClient

async def main():
    async with KageAsyncClient("https://kageapi.up.railway.app") as client:
        resp = await client.chat("Summarise my trading strategy", deep_think=True)
        print(resp.text)

asyncio.run(main())
```

## Features

| Category | Methods |
|---|---|
| **Chat / Memory** | `chat()`, `store()`, `recall()`, `list_memories()` |
| **Delegation** | `delegate()`, `list_tasks()` |
| **Messaging** | `send_message()`, `inbox()` |
| **Payments** | `send_payment()`, `scan_payments()` |
| **DID** | `get_did()`, `issue_credential()`, `verify_credential()`, `list_credentials()` |
| **Reputation** | `get_reputation()`, `record_task()`, `slash()`, `commit_reputation_snapshot()`, `leaderboard()` |
| **Team Vault** | `create_team()`, `list_teams()`, `get_team()`, `store_team_secret()`, `retrieve_team_secret()` |

## Examples

```bash
cd examples/
python basic_chat.py          # Chat + encrypted memory
python did_and_reputation.py  # DID + Verifiable Credentials + Reputation
python team_vault.py          # Shared encrypted secrets (async)
```

## Configuration

By default the client connects to `http://localhost:3002`. Pass any URL:

```python
client = KageClient("https://kageapi.up.railway.app")
```

## Deep Think

Enable Claude's Extended Thinking for multi-step reasoning:

```python
resp = client.chat("Design a MEV-resistant DEX", deep_think=True, stream_steps=True)
# stream_steps=True prints each reasoning step as it arrives
print(resp.text)
print(f"Reasoning: {resp.reasoning.char_count} chars, hash {resp.reasoning.content_hash[:16]}…")
```

## License

MIT
