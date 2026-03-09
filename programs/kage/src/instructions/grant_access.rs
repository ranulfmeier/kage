use anchor_lang::prelude::*;

use crate::errors::KageError;
use crate::state::{seeds, AccessGrant, AccessPermissions, MemoryVault};

#[derive(Accounts)]
#[instruction(grantee: Pubkey)]
pub struct GrantAccess<'info> {
    #[account(
        seeds = [seeds::VAULT_SEED, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ KageError::Unauthorized
    )]
    pub vault: Account<'info, MemoryVault>,

    #[account(
        init,
        payer = owner,
        space = 8 + AccessGrant::INIT_SPACE,
        seeds = [
            seeds::ACCESS_SEED,
            vault.key().as_ref(),
            grantee.as_ref()
        ],
        bump
    )]
    pub access_grant: Account<'info, AccessGrant>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<GrantAccess>,
    grantee: Pubkey,
    permissions: u8,
    expires_at: i64,
) -> Result<()> {
    let access_grant = &mut ctx.accounts.access_grant;
    let clock = Clock::get()?;

    access_grant.vault = ctx.accounts.vault.key();
    access_grant.grantee = grantee;
    access_grant.permissions = AccessPermissions::from(permissions);
    access_grant.granted_at = clock.unix_timestamp;
    access_grant.expires_at = expires_at;
    access_grant.bump = ctx.bumps.access_grant;

    msg!(
        "Access granted to {} with permissions {:?}",
        grantee,
        access_grant.permissions
    );

    Ok(())
}
