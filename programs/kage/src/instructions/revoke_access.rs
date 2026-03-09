use anchor_lang::prelude::*;

use crate::errors::KageError;
use crate::state::{seeds, AccessGrant, MemoryVault};

#[derive(Accounts)]
#[instruction(grantee: Pubkey)]
pub struct RevokeAccess<'info> {
    #[account(
        seeds = [seeds::VAULT_SEED, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ KageError::Unauthorized
    )]
    pub vault: Account<'info, MemoryVault>,

    #[account(
        mut,
        close = owner,
        seeds = [
            seeds::ACCESS_SEED,
            vault.key().as_ref(),
            grantee.as_ref()
        ],
        bump = access_grant.bump,
        constraint = access_grant.grantee == grantee @ KageError::AccessNotFound
    )]
    pub access_grant: Account<'info, AccessGrant>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RevokeAccess>, grantee: Pubkey) -> Result<()> {
    require!(
        grantee != ctx.accounts.vault.owner,
        KageError::CannotRevokeOwner
    );

    msg!("Access revoked for {}", grantee);

    Ok(())
}
