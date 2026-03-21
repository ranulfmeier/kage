use anchor_lang::prelude::*;
use solana_program::hash::hash as sol_hash;

use crate::errors::KageError;
use crate::state::{seeds, ZkProofType, ZkVerification};

/// Verify an SP1 Groth16 proof on-chain and store the result in a PDA.
///
/// The proof is verified using the sp1-solana crate, which leverages
/// Solana's BN254 precompiles for efficient Groth16 verification
/// (~200K compute units).
pub fn handler(
    ctx: Context<VerifyProof>,
    proof_type: u8,
    vkey_hash: [u8; 32],
    proof_bytes: Vec<u8>,
    public_inputs: Vec<u8>,
) -> Result<()> {
    require!(proof_bytes.len() <= 512, KageError::ProofDataTooLarge);
    require!(public_inputs.len() <= 1024, KageError::ProofDataTooLarge);

    let proof_type_enum = ZkProofType::from(proof_type);

    let vkey_hash_hex = hex_encode(&vkey_hash);

    let groth16_vk = sp1_solana::GROTH16_VK_5_0_0_BYTES;

    sp1_solana::verify_proof(
        &proof_bytes,
        &public_inputs,
        &vkey_hash_hex,
        groth16_vk,
    )
    .map_err(|_| error!(KageError::ZkProofVerificationFailed))?;

    let verification = &mut ctx.accounts.verification;
    verification.authority = ctx.accounts.authority.key();
    verification.proof_type = proof_type_enum;
    verification.vkey_hash = vkey_hash;
    verification.public_outputs_hash = sol_hash(&public_inputs).to_bytes();
    verification.verified_at = Clock::get()?.unix_timestamp;
    verification.bump = ctx.bumps.verification;

    msg!(
        "Kage: ZK proof verified on-chain | type={:?} | authority={}",
        proof_type_enum,
        ctx.accounts.authority.key()
    );

    Ok(())
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

#[derive(Accounts)]
#[instruction(proof_type: u8, vkey_hash: [u8; 32])]
pub struct VerifyProof<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + ZkVerification::INIT_SPACE,
        seeds = [
            seeds::ZK_VERIFICATION_SEED,
            authority.key().as_ref(),
            &[proof_type],
            &vkey_hash,
        ],
        bump,
    )]
    pub verification: Account<'info, ZkVerification>,

    pub system_program: Program<'info, System>,
}
