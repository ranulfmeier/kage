use anchor_lang::prelude::*;

use crate::errors::KageError;
use crate::state::{seeds, MemoryEntry, MemoryType, MemoryVault};

#[derive(Accounts)]
pub struct StoreMemory<'info> {
    #[account(
        mut,
        seeds = [seeds::VAULT_SEED, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ KageError::Unauthorized
    )]
    pub vault: Account<'info, MemoryVault>,

    #[account(
        init,
        payer = owner,
        space = 8 + MemoryEntry::INIT_SPACE,
        seeds = [
            seeds::MEMORY_SEED,
            vault.key().as_ref(),
            &vault.memory_count.to_le_bytes()
        ],
        bump
    )]
    pub memory_entry: Account<'info, MemoryEntry>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<StoreMemory>,
    cid: String,
    metadata_hash: [u8; 32],
    memory_type: u8,
) -> Result<()> {
    require!(cid.len() <= 64, KageError::CidTooLong);

    let vault = &mut ctx.accounts.vault;
    let memory_entry = &mut ctx.accounts.memory_entry;
    let clock = Clock::get()?;

    memory_entry.vault = vault.key();
    memory_entry.index = vault.memory_count;
    memory_entry.cid = cid;
    memory_entry.metadata_hash = metadata_hash;
    memory_entry.memory_type = MemoryType::from(memory_type);
    memory_entry.created_at = clock.unix_timestamp;
    memory_entry.bump = ctx.bumps.memory_entry;

    vault.memory_count = vault
        .memory_count
        .checked_add(1)
        .ok_or(KageError::MemoryIndexOverflow)?;
    vault.updated_at = clock.unix_timestamp;

    msg!(
        "Memory stored: index={}, cid={}",
        memory_entry.index,
        memory_entry.cid
    );

    Ok(())
}
