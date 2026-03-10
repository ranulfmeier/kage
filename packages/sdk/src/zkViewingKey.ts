/**
 * ZK Viewing Key Verification — powered by zkRune
 *
 * Replaces plaintext viewing key transmission with a Groth16 zero-knowledge
 * proof. Callers prove they hold a valid viewing key without ever sending it.
 *
 * Circuit: packages/sdk/circuits/viewing-key-proof/circuit.circom
 * Proof system: Groth16 / BN254 (snarkjs)
 *
 * Integration with existing Kage SDK:
 *   - hashViewingKey()         → call at memory creation, store result on PDA
 *   - proveViewingKeyAccess()  → call when requesting access
 *   - verifyViewingKeyProof()  → call in grantAccess / access-check flows
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZkViewingKeyProofInput {
  /** The raw viewing key — private, never leaves the device. */
  viewingKey: bigint;
  /**
   * Random salt chosen at memory creation time.
   * Stored locally alongside the encrypted blob, never on-chain.
   */
  salt: bigint;
  /**
   * Poseidon(viewingKey, salt) — stored on the Solana PDA.
   * Fetched from chain; safe to transmit publicly.
   */
  viewingKeyHash: bigint;
}

export interface ZkViewingKeyProof {
  /** Groth16 proof (π_a, π_b, π_c). */
  proof: object;
  /** Public signals: [isAuthorized, nullifier, viewingKeyHash] */
  publicSignals: string[];
  /** "1" when the key is valid. */
  isAuthorized: string;
  /** Replay-prevention token — store on-chain after first use. */
  nullifier: string;
}

export interface ZkViewingKeyProofResult {
  success: boolean;
  data?: ZkViewingKeyProof;
  error?: string;
  timingMs?: number;
}

// ---------------------------------------------------------------------------
// Circuit asset URLs (served from zkRune CDN)
// ---------------------------------------------------------------------------

const ZKRUNE_BASE = "https://zkrune.com/circuits/viewing-key-proof";

async function loadCircuit(baseUrl = ZKRUNE_BASE) {
  const [wasmRes, zkeyRes, vkeyRes] = await Promise.all([
    fetch(`${baseUrl}/circuit.wasm`),
    fetch(`${baseUrl}/circuit_final.zkey`),
    fetch(`${baseUrl}/verification_key.json`),
  ]);

  if (!wasmRes.ok || !zkeyRes.ok || !vkeyRes.ok) {
    throw new Error(`[kage/zk] Failed to load circuit assets from ${baseUrl}`);
  }

  const [wasmBuffer, zkeyBuffer, vKey] = await Promise.all([
    wasmRes.arrayBuffer(),
    zkeyRes.arrayBuffer(),
    vkeyRes.json(),
  ]);

  return {
    wasm: new Uint8Array(wasmBuffer),
    zkey: new Uint8Array(zkeyBuffer),
    vKey,
  };
}

// ---------------------------------------------------------------------------
// hashViewingKey — call at memory creation
// ---------------------------------------------------------------------------

/**
 * Computes Poseidon(viewingKey, salt) using circomlibjs.
 *
 * Store the returned hash on the Solana PDA instead of the raw viewing key.
 *
 * @example
 * ```ts
 * const hash = await hashViewingKey(viewingKey, salt);
 * await vault.storeMemory(data, { ...metadata, viewingKeyHash: hash });
 * ```
 */
export async function hashViewingKey(
  viewingKey: bigint,
  salt: bigint
): Promise<bigint> {
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const hash = poseidon([viewingKey, salt]);
  return poseidon.F.toObject(hash) as bigint;
}

// ---------------------------------------------------------------------------
// proveViewingKeyAccess — call on the user / agent side
// ---------------------------------------------------------------------------

/**
 * Generates a ZK proof that the caller knows the viewing key for a Kage memory.
 *
 * The viewing key **never** leaves the device. Only the proof, nullifier, and
 * `isAuthorized` flag are produced as public outputs.
 *
 * @example
 * ```ts
 * const result = await proveViewingKeyAccess({
 *   viewingKey,   // from local vault
 *   salt,         // from local vault
 *   viewingKeyHash: onChainHash,  // fetched from Solana PDA
 * });
 *
 * if (result.success) {
 *   await kage.requestAccess({ zkProof: result.data });
 * }
 * ```
 */
export async function proveViewingKeyAccess(
  input: ZkViewingKeyProofInput,
  circuitBaseUrl?: string
): Promise<ZkViewingKeyProofResult> {
  const t0 = Date.now();

  try {
    const { wasm, zkey, vKey } = await loadCircuit(circuitBaseUrl);
    const snarkjs = await import("snarkjs");

    const { proof, publicSignals } = await (snarkjs as any).groth16.fullProve(
      {
        viewingKey: input.viewingKey.toString(),
        salt: input.salt.toString(),
        viewingKeyHash: input.viewingKeyHash.toString(),
      },
      wasm,
      zkey
    );

    // publicSignals: [isAuthorized, nullifier, viewingKeyHash]
    const isAuthorized = publicSignals[0] as string;
    const nullifier = publicSignals[1] as string;

    if (isAuthorized !== "1") {
      return {
        success: false,
        error: "Viewing key does not match the on-chain hash — access denied.",
      };
    }

    const valid = await (snarkjs as any).groth16.verify(
      vKey,
      publicSignals,
      proof
    );

    if (!valid) {
      return { success: false, error: "Proof failed local verification." };
    }

    return {
      success: true,
      data: { proof, publicSignals, isAuthorized, nullifier },
      timingMs: Date.now() - t0,
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// verifyViewingKeyProof — call on the Kage SDK / server side
// ---------------------------------------------------------------------------

/**
 * Verifies a viewing key proof received from a client.
 *
 * No viewing key required — only the public proof and on-chain hash.
 *
 * @param proof          The proof returned by `proveViewingKeyAccess`.
 * @param onChainHash    Poseidon hash stored on the Solana PDA.
 * @param usedNullifiers Set of already-consumed nullifiers (persist in DB).
 *
 * @example
 * ```ts
 * const usedNullifiers = new Set<string>(); // load from DB
 *
 * const { valid, reason } = await verifyViewingKeyProof(
 *   incomingProof,
 *   onChainHash,
 *   usedNullifiers,
 * );
 *
 * if (valid) grantDecryptedAccess();
 * ```
 */
export async function verifyViewingKeyProof(
  proof: ZkViewingKeyProof,
  onChainHash: bigint,
  usedNullifiers: Set<string>,
  circuitBaseUrl?: string
): Promise<{ valid: boolean; reason?: string }> {
  // Replay attack check
  if (usedNullifiers.has(proof.nullifier)) {
    return { valid: false, reason: "Nullifier already used — replay attack." };
  }

  // Claimed hash must match what we fetched from the PDA
  const claimedHash = proof.publicSignals[2];
  if (BigInt(claimedHash) !== onChainHash) {
    return { valid: false, reason: "On-chain hash mismatch." };
  }

  try {
    const { vKey } = await loadCircuit(circuitBaseUrl);
    const snarkjs = await import("snarkjs");

    const valid = await (snarkjs as any).groth16.verify(
      vKey,
      proof.publicSignals,
      proof.proof
    );

    if (valid) usedNullifiers.add(proof.nullifier);

    return { valid, reason: valid ? undefined : "Proof verification failed." };
  } catch (err: any) {
    return { valid: false, reason: err?.message ?? "Verification error" };
  }
}
