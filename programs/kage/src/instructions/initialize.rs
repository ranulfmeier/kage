use anchor_lang::prelude::*;

use crate::state::{seeds, MemoryVault};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + MemoryVault::INIT_SPACE,
        seeds = [seeds::VAULT_SEED, owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, MemoryVault>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.owner = ctx.accounts.owner.key();
    vault.memory_count = 0;
    vault.bump = ctx.bumps.vault;
    vault.created_at = clock.unix_timestamp;
    vault.updated_at = clock.unix_timestamp;

    msg!("Memory vault initialized for owner: {}", vault.owner);

    Ok(())
}
