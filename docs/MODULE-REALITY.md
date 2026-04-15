# Kage Module Reality

What each SDK module actually does on-chain, versus what its API promises.
This document is maintained as the source of truth for test planning,
documentation, and marketing claims — do not let any external doc claim a
stronger guarantee than is listed here.

**Ground truth: the Kage Solana program exposes exactly 7 instructions:**
`initialize_vault`, `store_memory`, `grant_access`, `revoke_access`,
`verify_sp1_proof`, `verify_credential`, `revoke_credential`. Anything else
an SDK module "commits" is either (a) a Memo-program log, (b) a native
Solana transfer, (c) a Solana-native read, or (d) purely client-side state.

## Reality table

| Module | LOC | On-chain footprint | Verdict |
|--------|-----|--------------------|---------|
| [vault.ts](../packages/sdk/src/vault.ts) | 603 | Kage program: initialize_vault, store_memory, grant_access, revoke_access | **Real on-chain** |
| [did.ts](../packages/sdk/src/did.ts) | 504 | Memo log + client-side Ed25519 signing | Client crypto + memo log |
| [credential-tx.ts](../packages/sdk/src/credential-tx.ts) | 328 | Kage program: verify_credential, revoke_credential | **Real on-chain** |
| [zk.ts](../packages/sdk/src/zk.ts) | 611 | Kage program: verify_sp1_proof + prover-service HTTP | **Real on-chain** (SP1 Groth16) |
| [shielded-payment.ts](../packages/sdk/src/shielded-payment.ts) | 319 | `SystemProgram.transfer` + memo log for ephemeral pubkey broadcast | **Real on-chain** (native SOL, stealth address is cryptographic) |
| [tiers.ts](../packages/sdk/src/tiers.ts) | 218 | Reads SPL token balances on-chain | **Real on-chain** (read-only) |
| [arweave.ts](../packages/sdk/src/arweave.ts) | 109 | Irys upload to Arweave | **Real off-chain persistent** |
| [messaging.ts](../packages/sdk/src/messaging.ts) | 294 | Memo log for envelope broadcast, X25519+AES-GCM payload | Client crypto + memo log |
| [encryption.ts](../packages/sdk/src/encryption.ts) | 126 | None — pure crypto | Client crypto only (AES-256-GCM) |
| [umbra.ts](../packages/sdk/src/umbra.ts) | 264 | Delegates to `@umbra-privacy/sdk` | Real, via external SDK |
| [delegation.ts](../packages/sdk/src/delegation.ts) | 258 | **Memo log only** | Client crypto + memo log |
| [team-vault.ts](../packages/sdk/src/team-vault.ts) | 561 | **Memo log only** | Client crypto + memo log |
| [group-vault.ts](../packages/sdk/src/group-vault.ts) | 438 | **Memo log only** | Client crypto + memo log |
| [reasoning.ts](../packages/sdk/src/reasoning.ts) | 310 | **Memo log only** (trace hash) | Client crypto + memo log |
| [reputation.ts](../packages/sdk/src/reputation.ts) | 320 | **Memo log only** (scores computed and stored locally) | Client-side only |

## What "memo log only" means

A "commitment" to the SPL Memo program is a UTF-8 log line attached to a
transaction signed by the agent. Solana validators record it in the tx
metadata, so it's globally visible and timestamped — but:

- **No smart contract can read it.** The Memo program has no state. Any
  on-chain enforcement (access control, state transitions, slashing) would
  need to re-implement a parser and interpreter for these memo strings
  inside a real Solana program, which does not exist in Kage today.
- **Data format is unverifiable.** The memo says
  `kage:rep:did:sol:Alice:score:420:…`. Nothing on-chain says Alice actually
  earned a 420. An attacker who controls Alice's keypair can write any
  score string they like — even one contradicting a previous memo.
- **Logs can diverge from local state.** The SDK may update local state
  first and fail the memo tx silently (see `catch { /* warn only */ }`
  blocks in several modules). Consumers of the local state may believe
  facts that were never committed.

Conclusion: Memo logs are a **timestamped audit trail**, not an
enforcement mechanism. Treat them as "this agent claimed X at time T",
never as "this agent owns X".

## Per-module findings (non-vault core)

### delegation.ts — client crypto + memo log

**Promise**: shielded task delegation between agents with X25519 ECDH payload encryption.

**Reality**: X25519 + AES-256-GCM are real. Task state (accepted, completed, result) is a local `Map` in the `DelegationEngine`. The only on-chain artifact is a Memo log `kage:task:{taskId}:{payloadHash.slice(0,16)}` written by [delegation.ts:233-246](../packages/sdk/src/delegation.ts).

**Attack surface**: An attacker with local access can mutate task status without any on-chain rejection. Two agents cannot cryptographically prove to each other via chain that a task was delegated — they must trust each other's local state or re-verify via the memo log (which only proves "this hash was signed by Alice at time T", not "Bob accepted it").

### team-vault.ts — client crypto + memo log

**Promise**: team vault with role-based access (owner/admin/member), invite/remove/role-change lifecycle, encrypted secrets.

**Reality**: All team state is in-memory (`teams: Map<teamId, Team>`). Secrets are encrypted via the underlying GroupVault engine (real Shamir SSS + AES-GCM). **7 memo logs** are written for lifecycle events ([team-vault.ts](../packages/sdk/src/team-vault.ts) lines 167, 243, 292, 328, 362, 404, 480), all `kage:team:{teamId}:{action}` strings.

**Attack surface**: Membership is client-enforced. If a removed member keeps a copy of the old team key (pre-removal), they can still decrypt old secrets. The "removeMember" memo doesn't rotate the key, doesn't revoke anything on-chain, and doesn't prevent the removed member from reading past content they already had access to. **Rotating a team key requires an SDK-level workflow that currently does not exist.**

### group-vault.ts — client crypto + memo log

**Promise**: m-of-n Shamir secret sharing for group vaults, encrypted entries.

**Reality**: Shamir over GF(256) is correctly implemented ([group-vault.ts:19-116](../packages/sdk/src/group-vault.ts)). Share wrapping uses X25519 ECDH per member, AES-GCM with AAD binding (`groupId:memberId`, `groupId:entryId`). This is **cryptographically real work**. But: all group state is local; only memo logs mark creation.

**Attack surface**: A threshold reconstruction cannot be proven on-chain. If two members collude offline to recover the key, no chain event records this. Auditability relies on members being honest about their local action logs.

### reasoning.ts — client crypto + memo log

**Promise**: commit reasoning trace hash on-chain; allow optional audit-key reveal.

**Reality**: AES-256-GCM encrypted trace stored locally. SHA-256 hash of plaintext is written to a memo (`kage:reasoning:{traceId}:{contentHash.slice(0,16)}`) at [reasoning.ts:135](../packages/sdk/src/reasoning.ts). Audit key unwrap uses ephemeral X25519 ECDH. Crypto is real.

**Attack surface**: The memo proves "this hash was logged at time T" — but nothing on-chain links the hash to a specific trace, and the agent can produce any plaintext when asked to reveal (as long as its hash matches). An agent that commits hash `H` can later reveal a plaintext that happens to hash to `H`; finding such a plaintext is intractable, but the agent can pre-compute favorable traces before committing.

**This is actually stronger than it sounds**: the SHA-256 preimage-resistance means once committed, the agent is locked into a plaintext. But there is no way for a third party to force reveal or to verify that the plaintext produced at reveal time is semantically the same as the one the agent was "really thinking about."

### reputation.ts — client-side only

**Promise**: track task outcomes, compute reputation scores, commit on-chain.

**Reality**: Scores are stored in `Map<did, AgentReputation>`, updated in-memory. Initial score **hardcoded to 100** ([reputation.ts:98](../packages/sdk/src/reputation.ts)). Memo logs are optional and often wrapped in `try/catch { warn }` — silent on failure. No cryptographic binding between a memo and the current score.

**Attack surface**: **This module is not a reputation system, it's a local scoreboard with optional logging.** An attacker can trivially inflate their own score by instantiating a fresh `ReputationEngine` with any agent keypair and calling `recordTask(success)` however many times they want. The memo logs don't prevent this because (a) nothing on-chain reads them, (b) the SDK never even fetches them back.

**For real reputation, the ZK circuits in [packages/zk-circuits/program/reputation](../packages/zk-circuits/program/reputation) + `verify_sp1_proof` are the honest path.** Use `zk.ts:commitReputation(...)` instead — that generates a Groth16 proof and anchors it via `verify_sp1_proof`. The `reputation.ts` module is local tracking that should not be trusted cross-agent.

### shielded-payment.ts — real on-chain

**Promise**: shielded SOL transfers with stealth addresses.

**Reality**: Actually real. Uses real `SystemProgram.transfer()` ([shielded-payment.ts:133](../packages/sdk/src/shielded-payment.ts)) to a stealth address derived via X25519 ECDH between sender's ephemeral keypair and recipient's viewing pubkey. Ephemeral pubkey is broadcast via memo so the recipient can scan + derive the claim keypair.

**Caveat**: Privacy depends on observers not correlating the memo broadcast (which contains the ephemeral pubkey) with the transfer destination. The memo makes stealth-address lookup easy for the recipient AND for any adversary who scans memos for `kage:stealth:` prefixes. This is a known pattern in stealth address schemes; the privacy guarantee is against *passive* observers who don't deliberately index these memos.

### tiers.ts — real on-chain read

**Promise**: check a wallet's KAGE token tier.

**Reality**: Calls `getAssociatedTokenAddress()` + `getAccount()` ([tiers.ts:167-169](../packages/sdk/src/tiers.ts)) against the real SPL token mint. No fakery. Returns tier based on raw token balance.

### arweave.ts — real off-chain persistent storage

**Promise**: permanent memory storage via Arweave.

**Reality**: Uses `@irys/sdk` dynamic import ([arweave.ts:41](../packages/sdk/src/arweave.ts)), calls `irys.upload()` for real bundled uploads. Gateway is `gateway.irys.xyz` on devnet, `arweave.net` on mainnet. Returns a real Arweave tx ID (43 chars).

## Implications for testing

Given this reality, test priorities shift:

1. **Real on-chain modules** (vault, credential-tx, zk, shielded-payment) need **end-to-end integration tests** against a real validator. `verify_credential` already has 9 such tests. vault.ts and zk.ts need similar.

2. **Client crypto + memo log modules** (delegation, team-vault, group-vault, reasoning, messaging) need **cryptographic correctness tests**: encrypt → decrypt roundtrips, Shamir threshold reconstruction, X25519 ECDH agreement, AAD binding. Memo writes can be mocked — the on-chain side is not under test because there's nothing on-chain to test.

3. **reputation.ts** should NOT be tested as if it were a reputation system. Either:
   - Delete it and route all reputation through `zk.ts`/`verify_sp1_proof`, OR
   - Explicitly rename its public API to `LocalReputationTracker` to signal no enforcement, and document this in its JSDoc.

## Implications for marketing / docs

The following claims in README/website need review:

- **"Decentralized agent reputation"**: currently only true via `zk.ts` + SP1 proofs. `reputation.ts` is not decentralized.
- **"Team vaults with on-chain membership"**: membership is not on-chain. The vault rent-exempt state lives in client memory.
- **"Delegated tasks with shielded payloads"**: payload encryption is real; task lifecycle state is not on-chain.
- **"Agent reasoning anchored on-chain"**: trace *hash* is in a memo log, not a contract. Agents can pre-compute favorable hashes before committing.

Each of these is **technically defensible** (the cryptography is real, memos are timestamped) but not the "smart-contract-enforced" thing a reader would assume. Either tighten the copy or upgrade the implementation.

## Action items

1. ❗ **reputation.ts** — rename to LocalReputationTracker OR replace internals with `zk.ts` calls. Current state is actively misleading.
2. ⚠️ **team-vault key rotation** — add a real key-rotation workflow so `removeMember` is meaningful.
3. ⚠️ **Docs review** — sweep README/website/roadmap for claims that imply smart-contract enforcement on memo-logged modules.
4. ✅ **Memo modules as audit trail** — this is a legitimate use case if marketed honestly. Keep them, document the limitation.
5. 🔜 **Phase 2 roadmap option**: turn one or more memo-logged modules into real on-chain features. Delegation and team-vault are the most natural candidates (they already have the crypto; only the state machine needs a program instruction).
