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
| `@kage/sdk` | Core TypeScript SDK — vault, credentials, ZK, DID, encryption, messaging |
| `@kage/agent` | Agent runtime with pluggable LLM providers (Claude, OpenAI, Ollama) |
| `@kage/api` | REST + WebSocket API server (Express) |
| `@kage/cli` | Terminal CLI for chat, memory, DID, reputation commands |
| `@kage/plugin-eliza` | ElizaOS plugin wrapping the Kage SDK |
| `kage-sdk` (Python) | Python client with LangChain + CrewAI wrappers |
| `kage-prover-service` | Rust/Axum hosted SP1 prover (CPU + Succinct Network mode) |
| `kage-zk-circuits` | SP1 RISC-V circuits (reputation, memory, task) |
| `@kage/website` | Public docs, agent showcase, marketplace UI (Vue) |
| `programs/kage` | Solana Anchor program |

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

The Kage program manages on-chain memory commitments, access control, ZK proof verification, and DID credentials.

### Instructions

- `initialize_vault` — Create a new memory vault for an agent
- `store_memory` — Store a memory commitment (CID + metadata hash)
- `grant_access` — Grant viewing access to another public key (enforced by `has_one = owner` + `Signer`)
- `revoke_access` — Revoke previously granted access
- `verify_sp1_proof` — Verify an SP1 Groth16 proof on-chain via the `sp1-solana` precompile pipeline (~200K CU)
- `verify_credential` — Verify a DID credential signature through the Ed25519 precompile sequential pattern; binds the precompile to a canonical 144-byte credential envelope and stores a `CredentialVerification` PDA
- `revoke_credential` — Revoke a credential via an issuer-signed, domain-separated digest; creates a permanent `CredentialRevocation` PDA

### PDAs

- **MemoryVault**: `[b"vault", owner_pubkey]`
- **MemoryEntry**: `[b"memory", vault_pubkey, index_bytes]`
- **AccessGrant**: `[b"access", vault_pubkey, grantee_pubkey]`
- **ZkVerification**: `[b"zk_verify", authority_pubkey, proof_type, vkey_hash]`
- **CredentialVerification**: `[b"credential", issuer_pubkey, credential_id]`
- **CredentialRevocation**: `[b"cred_revoke", issuer_pubkey, credential_id]`

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

The phased roadmap lives in [roadmap.md](roadmap.md). Short summary:

- **Phase 壱 Core Protocol** ✅ — client-side AES-256-GCM, IPFS, PDA commitments, viewing keys, Eliza plugin, devnet
- **Phase 弐 Privacy Layer** ✅ — Umbra SDK integration, shielded proofs, on-chain verification
- **Phase 参 Multi-Agent** ✅ — shielded delegation, E2E messaging, group vaults, stealth payments (real on-chain)
- **Phase 肆 Advanced Privacy** ✅ — reasoning traces, DID integration, SP1 zkVM circuits
- **Phase 伍 Enterprise** ✅ — CLI, Arweave, team vaults, Python SDK
- **Phase 六 ZK Proofs** ✅ — SP1 circuits (reputation/memory/task), hash commitment engine, on-chain Groth16 verifier
- **Phase 七 Foundation** 🟡 — vault access control, Ed25519 DID on-chain, prover auth + rate limiting (shipped); mainnet + broader test coverage (in progress)
- **Phase 八 Adoption** ✅ — LangChain/CrewAI wrappers, wallet connect, token-gated API, demo agents, quickstart
- **Phase 九 Horizon** 🟡 — marketplace (shipped); Light Protocol, ZK circuit registry, private semantic search (planned)

## Module reality

Not every feature in Kage is enforced by a smart contract. Some SDK modules use client-side cryptography (X25519 ECDH, AES-256-GCM, Shamir SSS) plus an on-chain audit trail via the SPL Memo program, while others write state directly to the Kage Anchor program. If you're building on top of Kage, read [docs/MODULE-REALITY.md](docs/MODULE-REALITY.md) to know exactly which module gives you which guarantee before choosing your architecture.

Smart-contract-enforced: `vault` (initialize/store/grant/revoke), `credential-tx` (verify/revoke), `zk` (SP1 Groth16 verifier), `shielded-payment` (native SOL transfers), `tiers` (SPL token reads).

Client-crypto + memo audit trail: `delegation`, `team-vault`, `group-vault`, `reasoning`, `messaging`.

Local-only (no on-chain state): `reputation.ts` — for provable reputation, use the SP1 pipeline via `zk.commitReputation`.

## License

MIT

## Links

- [Umbra Privacy](https://umbraprivacy.com)
- [Umbra SDK Docs](https://sdk.umbraprivacy.com)
- [ElizaOS](https://elizaos.ai)
- [Solana](https://solana.com)
