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

    // ── Credential verification ────────────────────────────────────────────
    #[msg("Credential has expired")]
    CredentialExpired,

    #[msg("Credential revocation PDA already exists for this credential")]
    CredentialRevoked,

    #[msg("Invalid Ed25519 instruction: must be immediately before verify_credential")]
    MissingEd25519Instruction,

    #[msg("Ed25519 precompile instruction has wrong program id")]
    InvalidEd25519Program,

    #[msg("Ed25519 precompile instruction data is malformed")]
    MalformedEd25519Instruction,

    #[msg("Ed25519 precompile must contain exactly one signature")]
    UnexpectedEd25519SignatureCount,

    #[msg("Ed25519 signer pubkey does not match credential issuer")]
    Ed25519PubkeyMismatch,

    #[msg("Ed25519 signed message length must be 32 (sha256 digest)")]
    Ed25519MessageLengthMismatch,

    #[msg("Ed25519 signed message does not match credential digest")]
    Ed25519MessageMismatch,

    #[msg("Credential subject does not match the caller")]
    CredentialSubjectMismatch,
}
