# Kage + CrewAI Multi-Agent Swarm

A 3-agent swarm that collaborates on a security mission using Kage's encrypted coordination layer.

## Agents

| Agent | Role | Kage Features Used |
|-------|------|--------------------|
| **Scout** | Gathers intelligence | Store memory, list memories |
| **Analyst** | Reviews & verifies data | Recall memory, reputation, credentials |
| **Commander** | Coordinates & records | Task delegation, record outcomes, store reports |

## How It Works

```
Scout ──store intel──► Encrypted Vault
                            ↓
Analyst ──recall──► Analyze + Issue Credential
                            ↓
Commander ──record──► Update Reputation + Store Report
```

All communication goes through Kage's encrypted API — agents never see each other's raw data.

## Setup

```bash
pip install kage-sdk[crewai] crewai crewai-tools
```

## Run

```bash
export OPENAI_API_KEY=sk-...
python swarm.py
```

Override API endpoint:

```bash
export KAGE_API_URL=http://localhost:3002
```

## Expected Flow

1. **Scout** stores 2 intelligence items in the encrypted vault
2. **Analyst** recalls the data, checks reputation, issues a credential
3. **Commander** records task success, stores a mission summary

All data is AES-256-GCM encrypted, anchored on Solana.
