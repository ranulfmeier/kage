use anchor_lang::prelude::*;

/// Memory Vault - stores configuration and metadata for an agent's memory vault
#[account]
#[derive(InitSpace)]
pub struct MemoryVault {
    /// Owner of the vault (agent or user)
    pub owner: Pubkey,
    /// Total number of memories stored
    pub memory_count: u64,
    /// Bump seed for PDA
    pub bump: u8,
    /// Vault creation timestamp
    pub created_at: i64,
    /// Last update timestamp
    pub updated_at: i64,
}

/// Memory Entry - stores a single memory commitment
#[account]
#[derive(InitSpace)]
pub struct MemoryEntry {
    /// Vault this memory belongs to
    pub vault: Pubkey,
    /// Memory index within the vault
    pub index: u64,
    /// IPFS CID of encrypted memory blob (max 64 chars for CIDv1)
    #[max_len(64)]
    pub cid: String,
    /// Hash of the memory metadata (for verification)
    pub metadata_hash: [u8; 32],
    /// Memory type (conversation, preference, behavior, task, knowledge)
    pub memory_type: MemoryType,
    /// Creation timestamp
    pub created_at: i64,
    /// Bump seed for PDA
    pub bump: u8,
}

/// Access Grant - stores access permissions for a grantee
#[account]
#[derive(InitSpace)]
pub struct AccessGrant {
    /// Vault this grant applies to
    pub vault: Pubkey,
    /// Grantee's public key
    pub grantee: Pubkey,
    /// Permission level
    pub permissions: AccessPermissions,
    /// Grant timestamp
    pub granted_at: i64,
    /// Expiration timestamp (0 = never expires)
    pub expires_at: i64,
    /// Bump seed for PDA
    pub bump: u8,
}

/// Memory type enumeration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MemoryType {
    Conversation,
    Preference,
    Behavior,
    Task,
    Knowledge,
}

impl From<u8> for MemoryType {
    fn from(value: u8) -> Self {
        match value {
            0 => MemoryType::Conversation,
            1 => MemoryType::Preference,
            2 => MemoryType::Behavior,
            3 => MemoryType::Task,
            _ => MemoryType::Knowledge,
        }
    }
}

/// Access permission levels
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AccessPermissions {
    /// Can only read memories
    Read,
    /// Can read and write memories
    ReadWrite,
    /// Full access including access management
    Admin,
}

impl From<u8> for AccessPermissions {
    fn from(value: u8) -> Self {
        match value {
            0 => AccessPermissions::Read,
            1 => AccessPermissions::ReadWrite,
            _ => AccessPermissions::Admin,
        }
    }
}

/// ZK proof type enumeration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ZkProofType {
    Reputation,
    Memory,
    Task,
}

impl From<u8> for ZkProofType {
    fn from(value: u8) -> Self {
        match value {
            0 => ZkProofType::Reputation,
            1 => ZkProofType::Memory,
            _ => ZkProofType::Task,
        }
    }
}

/// On-chain ZK verification record — stored after successful SP1 proof verification
#[account]
#[derive(InitSpace)]
pub struct ZkVerification {
    /// Agent/owner who submitted the proof
    pub authority: Pubkey,
    /// Type of proof verified
    pub proof_type: ZkProofType,
    /// SP1 program verification key hash (vk.bytes32())
    pub vkey_hash: [u8; 32],
    /// SHA-256 hash of the public outputs committed by the SP1 circuit
    pub public_outputs_hash: [u8; 32],
    /// Verification timestamp
    pub verified_at: i64,
    /// PDA bump
    pub bump: u8,
}

/// PDA seeds
pub mod seeds {
    pub const VAULT_SEED: &[u8] = b"vault";
    pub const MEMORY_SEED: &[u8] = b"memory";
    pub const ACCESS_SEED: &[u8] = b"access";
    pub const ZK_VERIFICATION_SEED: &[u8] = b"zk_verify";
}
