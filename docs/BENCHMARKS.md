# Kage Benchmarks

Reproducible performance numbers for the Kage SDK and (when applicable)
the prover service. Every entry on this page is captured by a committed
bench suite — no cherry-picked numbers, no marketing rounding.

## How to read this

- **hz** — operations per second. Higher = faster.
- **mean / p75 / p99** — operation latency in milliseconds.
- **samples** — how many iterations the harness ran before reporting.
- **rme** — relative margin of error. ±3% or better is trustworthy.

Numbers below are captured on an Apple Silicon macOS development machine.
Run the suite yourself to compare against your own hardware; see
[Reproducing](#reproducing) at the bottom.

## SDK — @kage/sdk

Source: [packages/sdk/bench/sdk.bench.ts](../packages/sdk/bench/sdk.bench.ts)

### Encryption (AES-256-GCM via Node `crypto`)

| Operation              | Payload   | hz          | mean (ms) | p99 (ms) |
| ---------------------- | --------- | ----------- | --------- | -------- |
| `encrypt` small        | ~50 B     | 235,071     | 0.004     | 0.011    |
| `encrypt` medium       | ~13 KB    | 31,756      | 0.032     | 0.132    |
| `encrypt` large        | ~500 KB   | 1,018       | 0.982     | 1.882    |
| `decrypt` small        | ~50 B     | 385,958     | 0.003     | 0.006    |
| `decrypt` medium       | ~13 KB    | 41,440      | 0.024     | 0.082    |
| `decrypt` large        | ~500 KB   | 1,373       | 0.728     | 2.480    |

**Interpretation**: AES-256-GCM on a 500 KB payload runs in under 1 ms.
Decrypt is roughly 1.3–1.5× faster than encrypt (no auth-tag generation,
lower memory pressure). At this rate, encrypting 1 GB of plaintext takes
~2 seconds. The "privacy tax" on a KageAgent that encrypts everything it
stores is effectively invisible at normal agent workloads.

### Hashing (SHA-256 via Node `crypto`)

| Operation           | Payload   | hz          | mean (ms) | p99 (ms) |
| ------------------- | --------- | ----------- | --------- | -------- |
| `computeHash` small | ~50 B     | 870,615     | 0.001     | 0.004    |
| `computeHash` large | ~500 KB   | 1,121       | 0.892     | 1.288    |

### Credential signature envelope (new, DID v1)

This is the hot path introduced by the Binary Canonical Format Migration
(commit `b8abf8b`). Both the SDK and the on-chain `verify_credential`
instruction reconstruct the same 144-byte envelope and compare its
SHA-256. These numbers are the client-side cost of that path.

| Operation                              | hz            | mean (ms) | p99 (ms) |
| -------------------------------------- | ------------- | --------- | -------- |
| `hashClaim` (canonical JSON + sha256)  | 532,168       | 0.002     | 0.005    |
| `buildCredentialSignaturePayload`      | 243,075       | 0.004     | 0.008    |
| `hashCredentialPayload` (envelope sha) | 1,201,024     | 0.001     | 0.004    |

**Interpretation**: the entire client-side cost of preparing a
credential for on-chain Ed25519 verification — canonicalize claim, hash,
build envelope, hash envelope — is under 10 µs. The Ed25519 signing cost
(not included above, dominated by `@noble/curves`) is ~30–60 µs. A full
`buildVerifyCredentialTx` call is well under 200 µs of pure CPU work
before it ever hits the Solana RPC.

## Prover service — SP1 proof generation

**Status**: ⏳ not captured in this pass.

Running these benchmarks requires the SP1 toolchain and pre-built ELFs
in `packages/zk-circuits/program/elf/`. Neither is bundled in the repo
(ELFs are reproducible artefacts, not source). To capture them:

```bash
# install sp1up if you don't have it
curl -L https://sp1up.succinct.xyz | bash
sp1up

# build the three circuits
cd packages/zk-circuits
cargo prove build -p kage-reputation
cargo prove build -p kage-memory
cargo prove build -p kage-task
```

Once ELFs exist, the `kage-prover-service` binary will run them in
`cpu` mode. Expected order of magnitude (from SP1 project documentation,
not our own measurement) for circuits of this size on a modern laptop:

- Proving key setup: ~5–20 seconds (amortized across many proofs).
- Compressed proof generation: ~30–90 seconds per proof.
- Groth16 wrapping (network mode only): additional ~15–30 seconds.
- On-chain verification on Solana via `sp1-solana`: roughly 200–300k
  compute units per Groth16 proof.

**TODO**: replace these order-of-magnitude estimates with measurements
from a local `bench.rs` binary. Tracked separately; gated on SP1 build
environment.

## Reproducing

### SDK

```bash
pnpm install
pnpm --filter @kage/sdk bench
```

Expected runtime: ~7 seconds on Apple Silicon. The suite uses Vitest's
`bench()` with default sample sizes (250 ms warmup, 500 ms run per
benchmark). For more stable numbers, wrap with `taskset` on Linux or
close background apps on macOS.

### What this page deliberately does not claim

- **No throughput comparison against other SDKs.** Apples-to-apples
  comparisons require matching payloads, key sizes, and threading
  models. Until we do that carefully, we do not publish comparisons.
- **No end-to-end latency** for a `store → commit → prove → verify`
  round-trip. That depends on network conditions (Solana RPC, SP1
  prover network) that move faster than benchmark captures. See
  [docs/ARCHITECTURE.md](ARCHITECTURE.md) for the data flow.
- **No cost-per-operation in USD.** We'd rather give you the compute
  unit counts and let you plug in your own Solana fee model.

Every number on this page can be reproduced from a clean clone with
the commands above. If you run the suite and get wildly different
numbers, open an issue — that's a signal, not a nit.
