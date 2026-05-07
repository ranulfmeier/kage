# Kage + Claude Demo Agent

A LangChain agent powered by Claude that uses Kage's encrypted memory vault, ZK proofs, and on-chain reputation.

## What It Does

1. **Stores sensitive data** in AES-256-GCM encrypted vault
2. **Recalls memories** with natural language queries
3. **Checks identity** — DID and reputation score
4. **Records tasks** to build on-chain reputation
5. **Issues credentials** — verifiable credentials anchored to Solana

## Setup

```bash
pip install kage-sdk[langchain] langchain-anthropic
```

## Run

```bash
export ANTHROPIC_API_KEY=sk-ant-...
python agent.py
```

By default connects to the production API. Override with:

```bash
export KAGE_API_URL=http://localhost:3002
```

## Expected Output

```
══════════════════════════════════════════════════════
  Kage + Claude Demo Agent
  API: https://kageapi-production.up.railway.app
══════════════════════════════════════════════════════

──────────────────────────────────────────────────────
  Step 1: Store encrypted memory
──────────────────────────────────────────────────────
> Invoking: kage_store_memory ...
→ Stored securely. The API key for project Alpha is now in your encrypted vault.

  ... (6 steps total) ...

══════════════════════════════════════════════════════
  Demo complete. All data encrypted & on-chain.
══════════════════════════════════════════════════════
```

## Architecture

```
Claude (Anthropic) ←→ LangChain AgentExecutor
                           ↓
                      Kage Tools (10 tools)
                           ↓
                      Kage API Server
                      ├── AES-256-GCM vault
                      ├── ZK commitment engine
                      ├── DID + reputation
                      └── Solana (on-chain anchoring)
```
