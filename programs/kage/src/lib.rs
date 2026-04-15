use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("ASK5m43oRE67ipfwuBbagVaiMQpFKYRTZNsvZXUfBtRp");

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

    /// Verify an SP1 Groth16 ZK proof on-chain.
    /// Stores the verification result in a PDA for trustless querying.
    pub fn verify_sp1_proof(
        ctx: Context<VerifyProof>,
        proof_type: u8,
        vkey_hash: [u8; 32],
        proof_bytes: Vec<u8>,
        public_inputs: Vec<u8>,
    ) -> Result<()> {
        instructions::verify_proof::handler(ctx, proof_type, vkey_hash, proof_bytes, public_inputs)
    }

    /// Verify a Kage DID credential on-chain.
    ///
    /// The Ed25519 signature must be validated by Solana's ed25519 precompile
    /// instruction placed immediately before this instruction in the tx.
    /// See `instructions::verify_credential` for the full binding contract.
    pub fn verify_credential(
        ctx: Context<VerifyCredential>,
        credential_id: [u8; 32],
        issuer: Pubkey,
        subject: Pubkey,
        claim_hash: [u8; 32],
        issued_at: i64,
        expires_at: i64,
    ) -> Result<()> {
        instructions::verify_credential::handler(
            ctx,
            credential_id,
            issuer,
            subject,
            claim_hash,
            issued_at,
            expires_at,
        )
    }

    /// Revoke a Kage DID credential on-chain.
    ///
    /// The issuer signs a domain-separated revocation payload off-chain; the
    /// Ed25519 precompile verifies the signature. Revocation is permanent —
    /// no instruction closes the CredentialRevocation PDA.
    pub fn revoke_credential(
        ctx: Context<RevokeCredential>,
        credential_id: [u8; 32],
        issuer: Pubkey,
    ) -> Result<()> {
        instructions::revoke_credential::handler(ctx, credential_id, issuer)
    }
}
