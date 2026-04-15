//! Helper for parsing the Solana Ed25519 precompile instruction that must
//! precede any Kage credential verification or revocation instruction in the
//! same transaction.
//!
//! The sequential-instruction pattern:
//!   [i-1] Ed25519Program instruction (precompile verifies the signature)
//!   [i]   kage::verify_credential / kage::revoke_credential
//!
//! This module owns the parser so both handlers can share it (no duplication)
//! and any future instruction that uses the same pattern can reuse the same
//! binding contract.

use anchor_lang::prelude::*;
use solana_program::{ed25519_program, sysvar::instructions as ixs_sysvar};

use crate::errors::KageError;

/// Ed25519 precompile layout (self-contained form, single signature):
///
/// ```text
///   [0]        num_signatures (u8)    // must == 1
///   [1]        padding
///   [2..16]    Ed25519SignatureOffsets (14 bytes)
///   [16..]     signature / pubkey / message bytes at their declared offsets
/// ```
///
/// Each `*_instruction_index` field in the offsets struct must equal
/// `u16::MAX` which is the Solana convention for "the data lives inside
/// this same Ed25519 instruction." We reject anything else so callers can't
/// smuggle data from another instruction in the transaction.
const ED25519_HEADER_LEN: usize = 16;
const ED25519_SIG_LEN: usize = 64;
const ED25519_PK_LEN: usize = 32;

/// The bytes that were actually signed by the holder of the signing key.
pub struct ParsedEd25519 {
    /// 32-byte signer public key extracted from the precompile data
    pub pubkey: [u8; 32],
    /// The message bytes the precompile verified the signature over
    pub message: Vec<u8>,
}

/// Locate the Ed25519 precompile instruction at `current_ix_index - 1` and
/// parse its data into `(pubkey, message)`. The caller is then responsible
/// for checking that the pubkey matches the issuer they claim and that the
/// message equals the canonical digest for the operation being performed.
///
/// Returns `KageError` variants for any malformation or missing precompile.
pub fn load_and_parse_preceding_ed25519<'a>(
    instructions_sysvar: &AccountInfo<'a>,
) -> Result<ParsedEd25519> {
    let current_ix_index = ixs_sysvar::load_current_index_checked(instructions_sysvar)?;
    if current_ix_index == 0 {
        return err!(KageError::MissingEd25519Instruction);
    }

    let ed_ix = ixs_sysvar::load_instruction_at_checked(
        (current_ix_index - 1) as usize,
        instructions_sysvar,
    )?;

    if ed_ix.program_id != ed25519_program::ID {
        return err!(KageError::InvalidEd25519Program);
    }

    parse_precompile_data(&ed_ix.data)
}

/// Parse the raw bytes of an Ed25519 precompile instruction's `data` field.
/// Factored out so tests can exercise the parser with crafted inputs without
/// needing a sysvar account.
pub fn parse_precompile_data(data: &[u8]) -> Result<ParsedEd25519> {
    if data.len() < ED25519_HEADER_LEN {
        return err!(KageError::MalformedEd25519Instruction);
    }
    if data[0] != 1 {
        return err!(KageError::UnexpectedEd25519SignatureCount);
    }

    let read_u16 = |off: usize| -> u16 { u16::from_le_bytes([data[off], data[off + 1]]) };

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
    if sig_offset.checked_add(ED25519_SIG_LEN).map_or(true, |e| e > data.len()) {
        return err!(KageError::MalformedEd25519Instruction);
    }
    if pk_offset.checked_add(ED25519_PK_LEN).map_or(true, |e| e > data.len()) {
        return err!(KageError::MalformedEd25519Instruction);
    }
    if msg_offset.checked_add(msg_size).map_or(true, |e| e > data.len()) {
        return err!(KageError::MalformedEd25519Instruction);
    }

    let mut pubkey = [0u8; ED25519_PK_LEN];
    pubkey.copy_from_slice(&data[pk_offset..pk_offset + ED25519_PK_LEN]);

    let message = data[msg_offset..msg_offset + msg_size].to_vec();

    Ok(ParsedEd25519 { pubkey, message })
}
