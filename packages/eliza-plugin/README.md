# @kage/plugin-eliza

ElizaOS plugin for the **Kage** privacy-first AI agent — adds encrypted memory, on-chain DID, reputation, team vaults, and shielded payments to any ElizaOS agent.

## Install

```bash
npm install @kage/plugin-eliza
# or
bun add @kage/plugin-eliza
```

**Peer dependency:** `@elizaos/core >= 1.0.0`

## Quick Start

```typescript
import { kagePlugin } from "@kage/plugin-eliza";

export const character = {
  name: "MyAgent",
  plugins: [kagePlugin],
  settings: {
    secrets: {
      KAGE_API_URL: "https://kageapi-production.up.railway.app",
    },
  },
};
```

That's it. Your agent now has access to the full Kage privacy stack.

## What Gets Added

### Actions

| Action | Trigger | Description |
|---|---|---|
| `KAGE_STORE_MEMORY` | "remember…", "store…" | Encrypt and vault a memory, anchor on Solana |
| `KAGE_RECALL_MEMORY` | "recall…", "list memories" | Decrypt and retrieve matching memories |
| `KAGE_DELEGATE_TASK` | "delegate task to…" | Send encrypted task to another agent |
| `KAGE_SEND_PAYMENT` | "send SOL privately…" | Shielded payment via stealth addresses |
| `KAGE_STORE_TEAM_SECRET` | "store team secret…" | SSS-encrypted secret in team vault |

### Providers

| Provider | Context injected |
|---|---|
| `KAGE_MEMORY` | Memory count, vault public key, network |
| `KAGE_IDENTITY` | DID, reputation score, tier, capabilities |

### Services

| Service | Description |
|---|---|
| `KageService` | HTTP/WebSocket connection manager to Kage API |

## Configuration

| Variable | Default | Description |
|---|---|---|
| `KAGE_API_URL` | `http://localhost:3002` | Kage API server URL |

## How it Works

The plugin connects to a running **Kage API server** — all cryptography (AES-256-GCM encryption, X25519 key agreement, Shamir's Secret Sharing) runs on the API server, not inside ElizaOS. Your ElizaOS agent sends plaintext instructions; Kage encrypts, stores, and anchors on Solana.

```
ElizaOS Agent
    └── kagePlugin
          └── KageService ──HTTP/WS──► Kage API Server
                                              ├── AES-256-GCM (memory)
                                              ├── X25519 DH (delegation/payments)
                                              ├── SSS (team vaults)
                                              └── Solana (on-chain proofs)
```

## Running the Kage API Server

```bash
git clone https://github.com/ranulfmeier/kage
cd kage
cp .env.example .env  # add ANTHROPIC_API_KEY, SOLANA_PRIVATE_KEY
pnpm install && pnpm build
pnpm --filter @kage/api start
```

## License

MIT
