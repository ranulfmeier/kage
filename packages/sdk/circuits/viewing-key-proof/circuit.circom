pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Kage Viewing Key Proof
//
// Proves the caller knows the viewing key whose Poseidon hash is stored
// on the Solana PDA — without ever transmitting the key itself.
//
// Flow:
//   1. On memory creation, Kage stores Poseidon(viewingKey, salt) on the PDA.
//   2. To prove access, the caller generates this proof locally.
//   3. The verifier checks the on-chain hash — key never leaves the device.
//
// Private inputs  : viewingKey, salt
// Public inputs   : viewingKeyHash  (Poseidon hash on Solana PDA)
// Public outputs  : isAuthorized    (1 if valid, 0 otherwise)
//                   nullifier       (prevents replay attacks)

template ViewingKeyProof() {
    // Private — never transmitted
    signal input viewingKey;
    signal input salt;

    // Public — fetched from the Solana PDA
    signal input viewingKeyHash;

    // Outputs
    signal output isAuthorized;
    signal output nullifier;

    // ── Step 1: Recompute Poseidon(viewingKey, salt) ───────────────────────
    component hasher = Poseidon(2);
    hasher.inputs[0] <== viewingKey;
    hasher.inputs[1] <== salt;

    // ── Step 2: Compare recomputed hash with the on-chain hash ─────────────
    component hashCheck = IsEqual();
    hashCheck.in[0] <== hasher.out;
    hashCheck.in[1] <== viewingKeyHash;

    isAuthorized <== hashCheck.out;

    // Boolean constraint
    isAuthorized * (isAuthorized - 1) === 0;

    // ── Step 3: Derive a session nullifier ─────────────────────────────────
    // Poseidon(viewingKey, salt + 1) — unique per (key, salt) pair.
    // Kage records used nullifiers on-chain to block replay attacks.
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== viewingKey;
    nullifierHasher.inputs[1] <== salt + 1;

    nullifier <== nullifierHasher.out;

    // ── Step 4: Viewing key must be non-zero ───────────────────────────────
    component nonZeroCheck = IsZero();
    nonZeroCheck.in <== viewingKey;
    signal isNonZero;
    isNonZero <== 1 - nonZeroCheck.out;
    isNonZero === 1;
}

component main {public [viewingKeyHash]} = ViewingKeyProof();
