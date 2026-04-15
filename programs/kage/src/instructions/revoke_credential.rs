use anchor_lang::prelude::*;
use solana_program::{
    hash::hash as sol_sha256,
    sysvar::instructions as ixs_sysvar,
};

use crate::errors::KageError;
use crate::state::{seeds, CredentialRevocation};
use crate::utils::ed25519_precompile::load_and_parse_preceding_ed25519;

/// Domain-separated prefix for revocation signatures. This prevents any valid
/// credential-verification signature from being replayed as a revocation
/// intent — the preimage hashes will never collide because the prefix is only
/// ever used in the revocation payload.
pub const REVOCATION_DOMAIN_TAG: &[u8] = b"kage:revoke:v1";

/// Revoke a Kage DID credential on-chain.
///
/// The issuer signs a canonical revocation payload off-chain; a Solana
/// Ed25519 precompile instruction placed immediately before this handler
/// verifies the signature. This handler binds the precompile to the
/// revocation semantics:
///
///   signed_digest = sha256(
///       b"kage:revoke:v1"  (14 bytes) ||
///       issuer_pubkey      (32 bytes) ||
///       credential_id      (32 bytes)
///   )
///
/// The revocation PDA at `[b"cred_revoke", issuer, credential_id]` is
/// initialised with `init`. The program never closes this PDA — revocation
/// is permanent, matching DID revocation semantics.
///
/// It is legal to revoke a credential whose verification PDA has not been
/// created on-chain: downstream consumers must always check for the
/// revocation PDA before trusting a credential.
pub fn handler(
    ctx: Context<RevokeCredential>,
    credential_id: [u8; 32],
    issuer: Pubkey,
) -> Result<()> {
    // ── 1. Parse the Ed25519 precompile ix immediately before us ─────────
    let parsed = load_and_parse_preceding_ed25519(&ctx.accounts.instructions_sysvar)?;

    // ── 2. Bind precompile to revocation semantics ───────────────────────
    if parsed.message.len() != 32 {
        return err!(KageError::Ed25519MessageLengthMismatch);
    }

    if parsed.pubkey != issuer.to_bytes() {
        return err!(KageError::Ed25519PubkeyMismatch);
    }

    // Canonical revocation preimage:
    //   domain_tag(14) || issuer(32) || credential_id(32) = 78 bytes
    let mut preimage = [0u8; 14 + 32 + 32];
    preimage[0..14].copy_from_slice(REVOCATION_DOMAIN_TAG);
    preimage[14..46].copy_from_slice(issuer.as_ref());
    preimage[46..78].copy_from_slice(&credential_id);
    let digest = sol_sha256(&preimage).to_bytes();

    if parsed.message.as_slice() != digest {
        return err!(KageError::Ed25519MessageMismatch);
    }

    // ── 4. Persist revocation PDA ─────────────────────────────────────────
    let revocation = &mut ctx.accounts.revocation;
    revocation.credential_id = credential_id;
    revocation.issuer = issuer;
    revocation.revoked_at = Clock::get()?.unix_timestamp;
    revocation.bump = ctx.bumps.revocation;

    msg!(
        "Kage: credential revoked | issuer={} | cred_id={}",
        issuer,
        super::verify_credential::hex_short(&credential_id),
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(credential_id: [u8; 32], issuer: Pubkey)]
pub struct RevokeCredential<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + CredentialRevocation::INIT_SPACE,
        seeds = [
            seeds::CREDENTIAL_REVOKE_SEED,
            issuer.as_ref(),
            credential_id.as_ref(),
        ],
        bump,
    )]
    pub revocation: Account<'info, CredentialRevocation>,

    /// CHECK: address-constrained to the sysvar; read-only.
    #[account(address = ixs_sysvar::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
