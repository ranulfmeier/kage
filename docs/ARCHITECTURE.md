# Kage Architecture

This document describes the technical architecture of the Kage Shadow Memory Protocol.

## System Components

### 1. Solana Program (Anchor)

The on-chain program manages memory commitments and access control without ever seeing the actual memory content.

#### State Accounts

**MemoryVault**
```rust
pub struct MemoryVault {
    pub owner: Pubkey,        // Vault owner
    pub memory_count: u64,    // Total memories stored
    pub bump: u8,             // PDA bump seed
    pub created_at: i64,      // Creation timestamp
    pub updated_at: i64,      // Last update timestamp
}
```

**MemoryEntry**
```rust
pub struct MemoryEntry {
    pub vault: Pubkey,           // Parent vault
    pub index: u64,              // Memory index
    pub cid: String,             // IPFS CID (max 64 chars)
    pub metadata_hash: [u8; 32], // SHA-256 of metadata
    pub memory_type: MemoryType, // Category enum
    pub created_at: i64,         // Creation timestamp
    pub bump: u8,                // PDA bump seed
}
```

**AccessGrant**
```rust
pub struct AccessGrant {
    pub vault: Pubkey,                // Parent vault
    pub grantee: Pubkey,              // Authorized viewer
    pub permissions: AccessPermissions, // Permission level
    pub granted_at: i64,              // Grant timestamp
    pub expires_at: i64,              // Expiration (0 = never)
    pub bump: u8,                     // PDA bump seed
}
```

### 2. Kage SDK

TypeScript SDK for client-side operations.

#### Encryption Engine

The encryption engine provides:
- **Viewing Key Generation**: Deterministic key derivation from owner keypair
- **AES-GCM Encryption**: Data encryption with ephemeral keys
- **SHA-256 Hashing**: Metadata commitment generation

```typescript
// Key derivation using HKDF
const viewingKey = await engine.generateViewingKey(ownerKeypair);

// Encrypt data
const encrypted = await engine.encrypt(data, viewingKey);
// Returns: { ciphertext, nonce, ephemeralPubkey }

// Decrypt data
const decrypted = await engine.decrypt(encrypted, viewingKey);
```

#### Storage Adapters

Pluggable storage backends:
- `MemoryStorageAdapter`: In-memory (testing)
- `IpfsStorageAdapter`: IPFS via HTTP gateway

### 3. Agent Layer

Eliza-compatible plugins for AI agent integration.

#### KageMemoryPlugin

Actions:
- `store_memory`: Encrypt and store memory
- `recall_memory`: Retrieve and decrypt memory
- `list_memories`: List all memory entries
- `search_memories`: Search by tags

#### KagePrivacyPlugin

Actions:
- `grant_access`: Share access with another key
- `revoke_access`: Remove access grant
- `check_access`: Verify access permissions
- `get_vault_info`: Get vault statistics

## Data Flow

### Storing a Memory

```
1. Agent calls storeMemory(data, metadata, type)
2. SDK serializes data to JSON
3. EncryptionEngine generates ephemeral keypair
4. Data encrypted with AES-GCM using shared secret
5. Encrypted blob uploaded to IPFS → returns CID
6. Metadata hashed with SHA-256
7. Transaction sent to Solana program:
   - Creates MemoryEntry PDA
   - Stores CID + metadata_hash
8. Returns { memoryId, cid, txSignature }
```

### Recalling a Memory

```
1. Agent calls recallMemory(cid)
2. SDK downloads encrypted blob from IPFS
3. EncryptionEngine decrypts using viewing key
4. Returns decrypted MemoryContent
```

### Granting Access

```
1. Owner calls grantAccess(grantee, permissions, expiresAt)
2. Transaction creates AccessGrant PDA:
   seeds = [b"access", vault_pubkey, grantee_pubkey]
3. Grantee can now verify access on-chain
4. Off-chain: Owner shares viewing key with grantee (encrypted)
```

## Security Considerations

### Threat Model

- **Storage Providers**: See only encrypted blobs
- **Solana Validators**: See only CIDs and hashes
- **Network Observers**: See encrypted traffic only
- **Compromised Agent**: Limited to memories accessible with its keypair

### Key Management

- Viewing keys derived deterministically from owner keypair
- Ephemeral keys used for each encryption operation
- No private keys transmitted or stored off-device

### Future Enhancements

- Integration with Umbra SDK for stealth addresses
- ZK proofs for reasoning trace verification
- Multi-party computation for shared secrets

## Directory Structure

```
kage/
├── programs/kage/           # Solana/Anchor program
│   └── src/
│       ├── lib.rs           # Program entry point
│       ├── state.rs         # Account structures
│       ├── errors.rs        # Error codes
│       └── instructions/    # IX handlers
├── packages/
│   ├── sdk/                 # TypeScript SDK
│   │   └── src/
│   │       ├── vault.ts     # Vault operations
│   │       ├── encryption.ts # Crypto engine
│   │       └── types.ts     # Type definitions
│   └── agent/               # Eliza plugins
│       └── src/
│           ├── agent.ts     # Main agent class
│           ├── character.ts # Agent personality
│           ├── plugins/     # Kage plugins
│           └── actions/     # Action handlers
└── tests/                   # Integration tests
```
