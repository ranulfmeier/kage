use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("AK3B3weUT97hm2Dzx2zLfgVBxZNPkxfSxPYEjkX8HcaS");

#[program]
pub mod kage {
    use super::*;

    /// Initialize a new memory vault for an agent
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    /// Store a memory commitment in the vault
    pub fn store_memory(
        ctx: Context<StoreMemory>,
        cid: String,
        metadata_hash: [u8; 32],
        memory_type: u8,
    ) -> Result<()> {
        instructions::store_memory::handler(ctx, cid, metadata_hash, memory_type)
    }

    /// Grant access to another public key
    pub fn grant_access(
        ctx: Context<GrantAccess>,
        grantee: Pubkey,
        permissions: u8,
        expires_at: i64,
    ) -> Result<()> {
        instructions::grant_access::handler(ctx, grantee, permissions, expires_at)
    }

    /// Revoke access from a grantee
    pub fn revoke_access(ctx: Context<RevokeAccess>, grantee: Pubkey) -> Result<()> {
        instructions::revoke_access::handler(ctx, grantee)
    }
}
