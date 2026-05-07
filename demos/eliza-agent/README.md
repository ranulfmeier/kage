# Kage + ElizaOS Demo Agent

A ready-to-deploy ElizaOS character with full Kage privacy capabilities — encrypted memory, shielded payments, task delegation, and on-chain reputation.

## Character: Kage Sensei

A privacy-first AI agent that:
- **Stores secrets** in AES-256-GCM encrypted vault on Solana
- **Recalls memories** with natural language
- **Delegates tasks** via X25519-encrypted channels
- **Sends SOL privately** through Umbra stealth addresses
- **Tracks reputation** on-chain with verifiable credentials

## Setup

### 1. Install ElizaOS

```bash
npx create-eliza@latest my-kage-agent
cd my-kage-agent
```

### 2. Install Kage Plugin

```bash
npm install @kage/plugin-eliza
```

### 3. Copy Character File

```bash
cp character.json ./characters/kage-sensei.json
```

### 4. Run

```bash
npx eliza --character characters/kage-sensei.json
```

## What Users Can Say

| Command | What Happens |
|---------|-------------|
| "Remember that my API key is abc123" | Encrypts and stores in vault |
| "What do you know about API keys?" | Recalls from encrypted memory |
| "Delegate a task to agent X" | Sends encrypted task instruction |
| "Send 0.5 SOL to 7xKXtg... privately" | Shielded stealth payment |
| "Store team secret: launch date is March 15" | SSS-encrypted team vault |

## Architecture

```
Discord / Telegram / Direct
        ↓
   ElizaOS Runtime
        ↓
   kagePlugin
   ├── storeMemoryAction   → Encrypted vault
   ├── recallMemoryAction   → Memory recall
   ├── delegateTaskAction   → Shielded delegation
   ├── sendPaymentAction    → Stealth payments
   ├── storeTeamSecretAction → Team vault (SSS)
   ├── memoryProvider       → Vault context
   └── identityProvider     → DID + reputation
        ↓
   Kage API Server → Solana
```

## Configuration

Edit `character.json` to customize:

| Field | Description |
|-------|-------------|
| `settings.secrets.KAGE_API_URL` | Kage API endpoint |
| `modelProvider` | LLM provider (`anthropic`, `openai`, `ollama`) |
| `clients` | Where to deploy (`discord`, `telegram`, `direct`) |

For Discord/Telegram, add the respective bot tokens to your environment.
