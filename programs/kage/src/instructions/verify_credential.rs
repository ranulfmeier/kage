use anchor_lang::prelude::*;
use solana_program::{
    hash::hash as sol_sha256,
    sysvar::instructions as ixs_sysvar,
};

use crate::errors::KageError;
use crate::state::{seeds, CredentialVerification};
use crate::utils::ed25519_precompile::load_and_parse_preceding_ed25519;

/// Verify a Kage DID credential on-chain.
///
/// The issuer's Ed25519 signature is validated by Solana's ed25519 precompile
/// (~0 CU) placed immediately before this instruction in the transaction.
/// This handler then binds the precompile to our credential semantics:
///
///  1. Loads the previous instruction and asserts it targets the ed25519 program.
///  2. Parses the 16-byte Ed25519 precompile header and asserts num_signatures == 1.
///  3. Extracts the signer pubkey from the precompile data (self-contained case:
///     all *_instruction_index fields must equal u16::MAX).
///  4. Rebuilds the 144-byte canonical credential envelope from the instruction
///     args (same layout as `buildCredentialSignaturePayload` in the SDK) and
///     computes its SHA-256 digest.
///  5. Asserts the precompile's signed message equals that 32-byte digest AND
///     that its pubkey equals the credential's claimed issuer. Either mismatch
///     rejects a relayed "valid but unrelated" signature.
///  6. Checks the credential isn't expired.
///  7. Initialises a CredentialVerification PDA at
///     `[b"credential", issuer, credential_id]` with `init` (not
///     `init_if_needed`) — re-verification naturally fails and downstream
///     consumers treat PDA existence as a boolean "verified" signal.
///
/// The `payer` account may be any signer (subject, relayer, etc.) — the
/// authenticity of the credential comes from the Ed25519 signature, not from
/// who submits the transaction.
pub fn handler(
    ctx: Context<VerifyCredential>,
    credential_id: [u8; 32],
    issuer: Pubkey,
    subject: Pubkey,
    claim_hash: [u8; 32],
    issued_at: i64,
    expires_at: i64,
) -> Result<()> {
    // ── 1. Expiration ────────────────────────────────────────────────────
    let now = Clock::get()?.unix_timestamp;
    if expires_at != 0 && now > expires_at {
        return err!(KageError::CredentialExpired);
    }

    // ── 2. Parse the Ed25519 precompile ix immediately before us ─────────
    let parsed = load_and_parse_preceding_ed25519(&ctx.accounts.instructions_sysvar)?;

    // ── 3. Bind precompile to our credential semantics ───────────────────
    //
    // (a) The signed message must be exactly 32 bytes — our digest width.
    if parsed.message.len() != 32 {
        return err!(KageError::Ed25519MessageLengthMismatch);
    }

    // (b) The signer pubkey must be the credential issuer.
    if parsed.pubkey != issuer.to_bytes() {
        return err!(KageError::Ed25519PubkeyMismatch);
    }

    // (c) Rebuild the canonical 144-byte envelope and hash it.
    let mut envelope = [0u8; 144];
    envelope[0..32].copy_from_slice(&credential_id);
    envelope[32..64].copy_from_slice(issuer.as_ref());
    envelope[64..96].copy_from_slice(subject.as_ref());
    envelope[96..128].copy_from_slice(&claim_hash);
    envelope[128..136].copy_from_slice(&issued_at.to_le_bytes());
    envelope[136..144].copy_from_slice(&expires_at.to_le_bytes());
    let digest = sol_sha256(&envelope).to_bytes();

    // (d) The precompile's signed message must equal our digest.
    if parsed.message.as_slice() != digest {
        return err!(KageError::Ed25519MessageMismatch);
    }

    // ── 5. Persist verification PDA ──────────────────────────────────────
    let verification = &mut ctx.accounts.verification;
    verification.credential_id = credential_id;
    verification.issuer = issuer;
    verification.subject = subject;
    verification.claim_hash = claim_hash;
    verification.issued_at = issued_at;
    verification.expires_at = expires_at;
    verification.verified_at = now;
    verification.bump = ctx.bumps.verification;

    msg!(
        "Kage: credential verified | issuer={} | subject={} | cred_id={}",
        issuer,
        subject,
        hex_short(&credential_id),
    );

    Ok(())
}

pub(crate) fn hex_short(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(16);
    for b in bytes.iter().take(8) {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

#[derive(Accounts)]
#[instruction(credential_id: [u8; 32], issuer: Pubkey)]
pub struct VerifyCredential<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + CredentialVerification::INIT_SPACE,
        seeds = [
            seeds::CREDENTIAL_SEED,
            issuer.as_ref(),
            credential_id.as_ref(),
        ],
        bump,
    )]
    pub verification: Account<'info, CredentialVerification>,

    /// CHECK: address-constrained to the sysvar; read-only.
    #[account(address = ixs_sysvar::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
