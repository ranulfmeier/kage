# Kage Development Roadmap

Kage is building the privacy infrastructure for autonomous AI agents on Solana. This document tracks every major milestone from genesis through the horizon — what's shipped, what's in progress, and what's next.

> **Note on scope.** Some shipped items below provide their security guarantee through client-side cryptography (X25519 ECDH, AES-256-GCM, Shamir SSS) plus a timestamped on-chain audit trail via the SPL Memo program. These are cryptographically real — data contents are protected and signatures are timestamped on Solana — but the Kage Anchor program does not read or enforce their state machine. See [docs/MODULE-REALITY.md](docs/MODULE-REALITY.md) for the full reality audit per module. Items that are *smart-contract-enforced* by the Kage program are: vault initialization, memory commitments, access grants/revocations, SP1 proof verification, and credential verification/revocation.

---

## Phase 壱 — Core Protocol `Shipped`

- [x] Client-side AES-256-GCM encryption
- [x] IPFS blob storage
- [x] Solana PDA commitments
- [x] Viewing key system
- [x] Eliza-compatible plugins
- [x] Devnet deployment

**What this means:** The foundational layer is live. Agents can encrypt data client-side, store blobs on IPFS, anchor commitments to Solana PDAs, and share access through viewing keys — all running on devnet with Eliza plugin support.

---

## Phase 弐 — Privacy Layer `Shipped`

- [x] Umbra SDK integration
- [x] Shielded memory proofs
- [x] zkRune ownership proofs
- [x] On-chain verification via Solscan

**What this means:** Agents now have cryptographic privacy. Shielded proofs let agents prove memory ownership and rune holdings without revealing underlying data, verified directly on-chain.

---

## Phase 参 — Multi-Agent `Shipped`

- [x] Shielded task delegation *(payload encryption real; task-state lifecycle is client-side + audit memo)*
- [x] Encrypted agent-to-agent messaging *(X25519+AES-GCM envelopes; memo broadcast)*
- [x] Group vaults *(Shamir SSS + AES-GCM real; membership is client-side + audit memo)*
- [x] Private payment channels *(real `SystemProgram.transfer` to stealth addresses)*

**What this means:** Multiple agents can collaborate with full content privacy. Payloads are end-to-end encrypted — no coordinator can read message bodies, task instructions, or vault contents. Payment transfers are enforced by Solana natively. Task-lifecycle state (accepted/completed/result) and group-membership state are currently managed client-side with optional on-chain audit memos; smart-contract enforcement for these state machines is planned as a follow-up. See [docs/MODULE-REALITY.md](docs/MODULE-REALITY.md).

---

## Phase 肆 — Advanced Privacy `Shipped`

- [x] Hidden reasoning traces *(trace encrypted client-side with AES-GCM, hash committed to memo; audit-key reveal)*
- [x] DID integration *(client-side Ed25519 signing + on-chain verification via `verify_credential`)*
- [x] Reputation system *(two paths: SP1 reputation circuit + `verify_sp1_proof` is the provable one; `reputation.ts` is a local tracker kept for convenience — see [docs/MODULE-REALITY.md](docs/MODULE-REALITY.md))*
- [x] zkVM integration (SP1) *(reputation, memory, task circuits; on-chain Groth16 verification)*

**What this means:** Agent reasoning is encrypted at rest and in flight. Decentralized identity is now end-to-end: credentials are signed with Ed25519 client-side and verified on-chain through a dedicated program instruction that binds the Solana precompile to canonical credential envelopes. The SP1 reputation circuit produces Groth16 proofs that are verified on-chain via `verify_sp1_proof` — use that pipeline for cross-agent provable reputation.

---

## Phase 伍 — Enterprise `Shipped`

- [x] CLI tools
- [x] Arweave permanent storage *(real `@irys/sdk` uploads)*
- [x] Team vaults *(secret contents encrypted via group-vault engine; team membership lifecycle is client-side + audit memo — key rotation on member removal is not yet implemented)*
- [x] Python SDK
- [x] ElizaOS plugin
- [x] LLM provider abstraction

**What this means:** Kage has the tooling surface for teams and frameworks: terminal CLI, permanent Arweave-backed storage, encrypted multi-user secret stores, a Python client, and a provider-agnostic LLM layer. Note that "team vault" today protects *contents* via client-side cryptography; membership revocation requires a key-rotation workflow that is planned but not shipped (see [docs/MODULE-REALITY.md](docs/MODULE-REALITY.md)).

---

## Phase 六 — ZK Proofs `Shipped`

- [x] SP1 zkVM circuits (reputation, memory, task)
- [x] Hash commitment engine (TypeScript)
- [x] ZK API endpoints (/zk/commit, /zk/verify)
- [x] On-chain commitment anchoring (Solana memo)

**What this means:** Zero-knowledge proof infrastructure is operational. SP1 circuits for core agent operations, a TypeScript commitment engine, dedicated API endpoints, and on-chain anchoring via Solana memos form a complete ZK pipeline.

---

## Phase 七 — Foundation `In Progress`

- [x] Hosted prover service (Succinct Network) *(auth + per-IP rate limiting enforced in production mode)*
- [x] On-chain ZK verifier (Solana program)
- [x] Production-grade vault access control *(Anchor `has_one = owner` + `Signer<'info>` on all vault mutation paths)*
- [x] Ed25519 DID credential signing *(client + on-chain `verify_credential` with Ed25519 precompile binding + `revoke_credential` with domain-separated digest)*
- [x] WebSocket relay messaging transport *(devnet only — MITM/TLS hardening tests pending)*
- [ ] Mainnet deployment
- [~] Anchor + SDK test coverage *(123 tests green: 22 agent + 6 api + 86 tests + 9 program integration; SDK modules ~45% module-level coverage, target is ~80% before mainnet)*

**What this means:** Moving from prototype to production. The hosted prover is hardened (mandatory API key + rate limiting when network mode), the on-chain SP1 verifier is live, and vault access control is enforced by Anchor constraints backed by real Solana signatures. DID credentials are now end-to-end: the Ed25519 precompile + `verify_credential` instruction bind a canonical 144-byte envelope and reject relayed-but-unrelated signatures. Remaining: mainnet deployment prep and broader SDK test coverage.

---

## Phase 八 — Adoption `Shipped`

- [x] LangChain + CrewAI tool wrappers
- [x] Phantom & Solflare wallet connect
- [x] Token-gated API access ($KAGE tiers)
- [x] Demo agents (Claude, ElizaOS, CrewAI)
- [x] Developer quickstart documentation

**What this means:** Making Kage accessible to the broader agent ecosystem. Tool wrappers for popular frameworks, wallet integration for end users, token-gated access tiers, reference demo agents, and clear documentation lower the barrier to entry for developers and projects building private agents.

---

## Phase 九 — Horizon `In Progress`

- [ ] Light Protocol (Solana-native shielded TX)
- [ ] On-chain circuit registry (ZK versioning)
- [x] Agent discovery & marketplace
- [ ] Private semantic memory search (ZK + embeddings)

**What this means:** The long-term vision. Light Protocol brings native shielded transactions to Solana, an on-chain circuit registry enables versioned ZK program management, a marketplace lets agents discover and hire each other, and private semantic search combines ZK proofs with embeddings for encrypted-yet-queryable agent memory.
