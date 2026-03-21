use anchor_lang::prelude::*;

#[error_code]
pub enum KageError {
    #[msg("Unauthorized: caller does not have permission")]
    Unauthorized,

    #[msg("Invalid memory type provided")]
    InvalidMemoryType,

    #[msg("CID too long, maximum 64 characters")]
    CidTooLong,

    #[msg("Access grant has expired")]
    AccessExpired,

    #[msg("Access grant already exists")]
    AccessAlreadyExists,

    #[msg("Access grant not found")]
    AccessNotFound,

    #[msg("Cannot revoke owner's access")]
    CannotRevokeOwner,

    #[msg("Insufficient permissions for this operation")]
    InsufficientPermissions,

    #[msg("Vault already initialized")]
    VaultAlreadyInitialized,

    #[msg("Memory index overflow")]
    MemoryIndexOverflow,

    #[msg("ZK proof verification failed")]
    ZkProofVerificationFailed,

    #[msg("Invalid proof type")]
    InvalidProofType,

    #[msg("Proof data too large")]
    ProofDataTooLarge,
}
