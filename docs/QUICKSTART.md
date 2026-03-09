# Kage Quick Start Guide

Get started with Kage in 5 minutes.

## Prerequisites

- Node.js 18+
- pnpm 9+
- A Solana wallet with devnet SOL

## Installation

```bash
# Clone and install
git clone https://github.com/your-org/kage.git
cd kage
pnpm install
```

## Setup

### 1. Create Environment File

```bash
cp .env.example .env
```

Edit `.env`:
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
ANTHROPIC_API_KEY=your-api-key-here
```

### 2. Generate a Keypair (if needed)

```bash
solana-keygen new --outfile ~/.config/solana/kage-agent.json
solana airdrop 2 --keypair ~/.config/solana/kage-agent.json
```

## Using the SDK

### Basic Memory Operations

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { createVault, MemoryType, KageConfig } from "@kage/sdk";

// Setup
const connection = new Connection("https://api.devnet.solana.com");
const keypair = Keypair.generate(); // or load from file

const config: KageConfig = {
  rpcUrl: "https://api.devnet.solana.com",
  programId: new PublicKey("KAGE..."),
  ipfsGateway: "https://ipfs.io",
  umbraNetwork: "devnet",
};

// Create and initialize vault
const vault = createVault(connection, config, keypair);
await vault.initialize();

// Store a memory
const result = await vault.storeMemory(
  { secret: "My private data" },
  { tags: ["personal"], source: "app" },
  MemoryType.Knowledge
);
console.log("Stored:", result.cid);

// Recall the memory
const memory = await vault.recallMemory(result.cid);
console.log("Recalled:", memory.data);
```

## Using the Agent

### Create a Conversational Agent

```typescript
import { Keypair } from "@solana/web3.js";
import { createKageAgent } from "@kage/agent";

const agent = createKageAgent({
  rpcUrl: "https://api.devnet.solana.com",
  programId: "KAGE...",
  ipfsGateway: "https://ipfs.io",
  umbraNetwork: "devnet",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
}, Keypair.generate());

await agent.initialize();

// Natural language interaction
const response1 = await agent.chat("Remember that I prefer dark mode.");
console.log(response1);
// "I've stored your preference for dark mode in my encrypted vault..."

const response2 = await agent.chat("What are my preferences?");
console.log(response2);
// "Based on my records, you prefer dark mode..."
```

## Using Plugins Directly

### Memory Plugin

```typescript
import { createKageMemoryPlugin } from "@kage/agent";

const plugin = createKageMemoryPlugin({
  rpcUrl: "https://api.devnet.solana.com",
  programId: "KAGE...",
  ipfsGateway: "https://ipfs.io",
  umbraNetwork: "devnet",
});

await plugin.initialize(keypair);

// Store
await plugin.storeMemory({
  data: { key: "value" },
  tags: ["tag1", "tag2"],
  source: "api",
  type: "knowledge",
});

// Search
const results = await plugin.searchMemories({ tags: ["tag1"] });
```

### Privacy Plugin

```typescript
import { createKagePrivacyPlugin } from "@kage/agent";

const privacyPlugin = createKagePrivacyPlugin(config);
await privacyPlugin.initialize(keypair);

// Grant read access to another user
await privacyPlugin.grantAccess({
  grantee: "Grantee_Public_Key_Base58",
  permissions: "read",
  expiresAt: Date.now() + 86400000, // 24 hours
});

// Check vault info
const info = await privacyPlugin.getVaultInfo({});
console.log(info);
```

## Running Tests

```bash
# Unit tests
pnpm test

# With coverage
pnpm test -- --coverage
```

## Deploying the Program

```bash
# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Update program ID in Anchor.toml and lib.rs
```

## Next Steps

- Read the [Architecture Guide](./ARCHITECTURE.md)
- Explore the [SDK API Reference](./API.md)
- Check out [Example Applications](./examples/)
