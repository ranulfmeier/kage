use anchor_lang::prelude::*;
use solana_program::{
    ed25519_program,
    hash::hash as sol_sha256,
    sysvar::instructions as ixs_sysvar,
};

use crate::errors::KageError;
use crate::state::{seeds, CredentialRevocation};

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
    // ── 1. Locate the Ed25519 precompile ix immediately before us ────────
    let ixs_ai = &ctx.accounts.instructions_sysvar;
    let current_ix_index = ixs_sysvar::load_current_index_checked(ixs_ai)?;
    if current_ix_index == 0 {
        return err!(KageError::MissingEd25519Instruction);
    }
    let ed_ix = ixs_sysvar::load_instruction_at_checked(
        (current_ix_index - 1) as usize,
        ixs_ai,
    )?;

    if ed_ix.program_id != ed25519_program::ID {
        return err!(KageError::InvalidEd25519Program);
    }

    // ── 2. Parse the precompile header (same layout as verify_credential) ─
    let data = &ed_ix.data;
    if data.len() < 16 {
        return err!(KageError::MalformedEd25519Instruction);
    }
    if data[0] != 1 {
        return err!(KageError::UnexpectedEd25519SignatureCount);
    }

    let read_u16 = |off: usize| -> u16 {
        u16::from_le_bytes([data[off], data[off + 1]])
    };

    let sig_offset = read_u16(2) as usize;
    let sig_ix_idx = read_u16(4);
    let pk_offset = read_u16(6) as usize;
    let pk_ix_idx = read_u16(8);
    let msg_offset = read_u16(10) as usize;
    let msg_size = read_u16(12) as usize;
    let msg_ix_idx = read_u16(14);

    if sig_ix_idx != u16::MAX || pk_ix_idx != u16::MAX || msg_ix_idx != u16::MAX {
        return err!(KageError::MalformedEd25519Instruction);
    }
    if sig_offset.checked_add(64).map_or(true, |e| e > data.len()) {
        return err!(KageError::MalformedEd25519Instruction);
    }
    if pk_offset.checked_add(32).map_or(true, |e| e > data.len()) {
        return err!(KageError::MalformedEd25519Instruction);
    }
    if msg_offset.checked_add(msg_size).map_or(true, |e| e > data.len()) {
        return err!(KageError::MalformedEd25519Instruction);
    }

    // ── 3. Bind to revocation semantics ──────────────────────────────────
    if msg_size != 32 {
        return err!(KageError::Ed25519MessageLengthMismatch);
    }

    let ed_pubkey = &data[pk_offset..pk_offset + 32];
    if ed_pubkey != issuer.as_ref() {
        return err!(KageError::Ed25519PubkeyMismatch);
    }

    // Canonical revocation preimage:
    //   domain_tag(14) || issuer(32) || credential_id(32) = 78 bytes
    let mut preimage = [0u8; 14 + 32 + 32];
    preimage[0..14].copy_from_slice(REVOCATION_DOMAIN_TAG);
    preimage[14..46].copy_from_slice(issuer.as_ref());
    preimage[46..78].copy_from_slice(&credential_id);
    let digest = sol_sha256(&preimage).to_bytes();

    let ed_msg = &data[msg_offset..msg_offset + msg_size];
    if ed_msg != digest {
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
