# Kage: Shadow Memory Protocol for Autonomous Agents

<p align="center">
  <strong>Privacy-first AI agent memory vault on Solana</strong>
</p>

<p align="center">
  <em>"Memories hidden in shadows — visible only to those who hold the key."</em>
</p>

---

## Overview

Kage (影, "shadow" in Japanese) is a privacy-preserving memory protocol for autonomous AI agents built on Solana. It enables agents to store, recall, and manage encrypted memories while maintaining full privacy through integration with [Umbra Privacy](https://umbraprivacy.com).

### Key Features

- **Encrypted Memory Storage**: All agent memories are encrypted client-side before storage
- **On-chain Commitments**: Cryptographic proofs stored on Solana for verifiability
- **Owner-only Access**: Only the agent owner (or explicitly granted parties) can decrypt memories
- **Eliza Compatible**: Plugin system compatible with ElizaOS agent framework
- **Decentralized Storage**: Encrypted blobs stored on IPFS/Arweave

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Kage Agent (Eliza)                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Memory      │  │ Privacy     │  │ LLM Provider        │  │
│  │ Plugin      │  │ Plugin      │  │ (Claude)            │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
└─────────┼────────────────┼──────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                        Kage SDK                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Vault       │  │ Encryption  │  │ Storage Adapter     │  │
│  │ Operations  │  │ Engine      │  │ (IPFS/Arweave)      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼────────────────┼───────────────────┼──────────────┘
          │                │                   │
          ▼                ▼                   ▼
┌─────────────────┐  ┌─────────────┐  ┌───────────────────────┐
│ Solana Program  │  │ Umbra SDK   │  │ IPFS / Arweave        │
│ (Anchor)        │  │ (Privacy)   │  │ (Encrypted Blobs)     │
└─────────────────┘  └─────────────┘  └───────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 9.0
- Rust & Cargo (for Anchor programs)
- Solana CLI
- Anchor CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/ranulfmeier/kage.git
cd kage

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build Solana program
anchor build
```

### Configuration

Create a `.env` file in the root directory:

```env
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=<base58-encoded-keypair>

# LLM Provider
ANTHROPIC_API_KEY=<your-anthropic-api-key>

# Storage
IPFS_GATEWAY=https://ipfs.io

# Umbra Privacy
UMBRA_NETWORK=devnet
```

### Quick Start

```typescript
import { Keypair, Connection } from "@solana/web3.js";
import { createKageAgent } from "@kage/agent";

// Create agent
const agent = createKageAgent({
  rpcUrl: "https://api.devnet.solana.com",
  programId: "KAGE...",
  ipfsGateway: "https://ipfs.io",
  umbraNetwork: "devnet",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
}, keypair);

// Initialize
await agent.initialize();

// Chat with the agent
const response = await agent.chat("Remember that my favorite color is blue.");
console.log(response);
// "I've securely stored your preference in my encrypted memory vault..."

// Recall memories
const recall = await agent.chat("What do you remember about me?");
console.log(recall);
```

## Packages

| Package | Description |
|---------|-------------|
| `@kage/sdk` | Core SDK for memory vault operations |
| `@kage/agent` | Eliza-compatible agent with Kage plugins |
| `programs/kage` | Solana program (Anchor) |

## SDK Usage

### Direct SDK Usage

```typescript
import { createVault, MemoryType } from "@kage/sdk";

const vault = createVault(connection, config, keypair);
await vault.initialize();

// Store encrypted memory
const result = await vault.storeMemory(
  { content: "Secret data" },
  { tags: ["secret"], source: "api" },
  MemoryType.Knowledge
);

// Recall memory
const memory = await vault.recallMemory(result.cid);
console.log(memory.data); // { content: "Secret data" }
```

### Plugin Usage

```typescript
import { createKageMemoryPlugin } from "@kage/agent";

const plugin = createKageMemoryPlugin(config);
await plugin.initialize(keypair);

// Available actions
const actions = plugin.getActions();
// store_memory, recall_memory, list_memories, search_memories
```

## Solana Program

The Kage program manages on-chain memory commitments and access control.

### Instructions

- `initialize_vault`: Create a new memory vault for an agent
- `store_memory`: Store a memory commitment (CID + metadata hash)
- `grant_access`: Grant viewing access to another public key
- `revoke_access`: Revoke previously granted access

### PDAs

- **MemoryVault**: `[b"vault", owner_pubkey]`
- **MemoryEntry**: `[b"memory", vault_pubkey, index_bytes]`
- **AccessGrant**: `[b"access", vault_pubkey, grantee_pubkey]`

## Security Model

1. **Client-side Encryption**: All data is encrypted before leaving the client using viewing keys derived from the owner's keypair
2. **Zero-knowledge Storage**: IPFS/Arweave nodes only see encrypted blobs
3. **On-chain Verification**: Cryptographic commitments (hashes) are stored on Solana for integrity verification
4. **Access Control**: Viewing keys can be shared with specific public keys via on-chain grants

## Development

```bash
# Run tests
pnpm test

# Run Anchor tests
anchor test

# Build all
pnpm build

# Lint
pnpm lint
```

## Roadmap

### MVP (P0) ✅
- [x] Single agent encrypted memory vault
- [x] Owner-only access control
- [x] Basic memory operations (store, recall, list)
- [x] Eliza plugin integration
- [x] Devnet deployment

### Phase 1 (P1)
- [ ] Multi-party viewing key sharing
- [ ] Memory categories and search
- [ ] Arweave permanent storage

### Phase 2 (P2)
- [ ] Agent-to-agent shielded task delegation
- [ ] x402 payment integration
- [ ] Reasoning trace shielding (ZK)

### Phase 3 (P3)
- [ ] Mainnet deployment
- [ ] DID integration
- [ ] Cross-agent memory sharing

## License

MIT

## Links

- [Umbra Privacy](https://umbraprivacy.com)
- [Umbra SDK Docs](https://sdk.umbraprivacy.com)
- [ElizaOS](https://elizaos.ai)
- [Solana](https://solana.com)
