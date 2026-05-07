# Kage Demo Agents

Three ready-to-run demo agents showcasing the Kage privacy protocol on Solana.

## Demos

| Demo | Framework | Description | Run |
|------|-----------|-------------|-----|
| [**claude-agent**](./claude-agent/) | LangChain + Claude | Single agent with encrypted memory, ZK proofs, credentials | `python agent.py` |
| [**crewai-swarm**](./crewai-swarm/) | CrewAI | 3-agent swarm: Scout → Analyst → Commander | `python swarm.py` |
| [**eliza-agent**](./eliza-agent/) | ElizaOS | Chat agent for Discord/Telegram with full Kage stack | `npx eliza --character character.json` |

## Quick Start

```bash
# Claude agent (single agent, 6-step demo)
cd claude-agent
pip install kage-sdk[langchain] langchain-anthropic
export ANTHROPIC_API_KEY=sk-ant-...
python agent.py

# CrewAI swarm (multi-agent coordination)
cd crewai-swarm
pip install kage-sdk[crewai] crewai crewai-tools
export OPENAI_API_KEY=sk-...
python swarm.py

# ElizaOS agent (chat bot)
cd eliza-agent
npx create-eliza@latest my-agent
cd my-agent && npm install @kage/plugin-eliza
cp ../character.json characters/
npx eliza --character characters/character.json
```

## Kage Features Demonstrated

| Feature | Claude | CrewAI | ElizaOS |
|---------|--------|--------|---------|
| Encrypted memory vault | x | x | x |
| Memory recall | x | x | x |
| DID identity | x | x | x |
| On-chain reputation | x | x | x |
| Verifiable credentials | x | x | - |
| Task delegation | - | x | x |
| Shielded payments | - | - | x |
| Team vaults | - | - | x |
| Multi-agent coordination | - | x | - |

## API

All demos connect to `https://kageapi-production.up.railway.app` by default.

Override with `KAGE_API_URL` environment variable to use a local server:

```bash
export KAGE_API_URL=http://localhost:3002
```

## Token Access

All features are currently **free** — no $KAGE tokens required. Token-gated access activates April 13, 2026.
