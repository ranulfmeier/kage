# Kage Deployment Guide

Checklist for deploying the full Kage stack — API server, prover service, and
Solana program — to devnet or mainnet.

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 20 | API + SDK runtime |
| pnpm | ≥ 9 | workspace package manager |
| Rust | stable (1.82+) | Solana program + prover service |
| Anchor CLI | 0.32.0 | program build + deploy |
| Solana CLI | 1.18+ | keygen, airdrop, program deploy |
| SP1 toolchain | 6.0.2 | ZK circuit build (`cargo prove`) |

```bash
pnpm install
cargo build --release --manifest-path packages/prover-service/Cargo.toml
anchor build
```

## 2. Environment variables

Copy `.env.example` to `.env` and fill in. For mainnet, every `<...>` must be
replaced with a real value.

### Core

| Variable | Required | Notes |
|----------|----------|-------|
| `SOLANA_RPC_URL` | ✓ | `https://api.devnet.solana.com` or a mainnet RPC |
| `SOLANA_PRIVATE_KEY` | ✓ | base64-encoded keypair (64 bytes) |
| `KAGE_PROGRAM_ID` |   | defaults to devnet program ID |
| `ANTHROPIC_API_KEY` | ✓ (if LLM=claude) | server-side only, never ship to client |
| `OPENAI_API_KEY` | ✓ (if LLM=openai) | same |
| `LLM_PROVIDER` |   | `claude` (default) \| `openai` \| `ollama` |
| `STORAGE_BACKEND` |   | `memory` (default) \| `arweave` |
| `IRYS_PRIVATE_KEY` | ✓ (if arweave) | funds Arweave uploads |

### Prover service

| Variable | Required | Notes |
|----------|----------|-------|
| `PROVER_API_KEY` | ✓ (prod) | shared secret the API sends as `x-api-key` |
| `PROVER_ENFORCE_AUTH` | ✓ (prod) | set to `true` — the service refuses to start in `network` mode or when this flag is set if `PROVER_API_KEY` is missing |
| `NETWORK_PRIVATE_KEY` | ✓ (network mode) | Succinct Network signing key |
| `PROVER_RATE_PER_SECOND` |   | default `10` — sustained req/sec per IP |
| `PROVER_RATE_BURST` |   | default `30` — burst capacity |
| `ELF_DIR` |   | override path to SP1 ELF binaries |
| `PROVER_PORT` |   | default `3080` |

### API server

| Variable | Required | Notes |
|----------|----------|-------|
| `PORT` |   | default `3002` |
| `PROVER_SERVICE_URL` |   | default `http://localhost:3080` |
| `PROVER_API_KEY` |   | must match the prover service |
| `KAGE_API_TEST_MODE` |   | `1` disables all bootstrapping — tests only |

## 3. Solana program deploy

Devnet:

```bash
solana config set --url devnet
solana airdrop 2
anchor build
anchor deploy --provider.cluster devnet
```

Mainnet: **never** deploy without an audited program ID.

```bash
solana config set --url mainnet-beta
# Use a hardware wallet for the upgrade authority.
anchor deploy --provider.cluster mainnet --provider.wallet ~/ledger/upgrade.json
```

After a successful deploy, update `KAGE_PROGRAM_ID` in every environment.

## 4. ZK circuits & prover service

1. Build the SP1 ELF binaries once per circuit release:

   ```bash
   cd packages/zk-circuits/program && cargo prove build
   ```

   This writes ELFs to `packages/zk-circuits/program/elf/{reputation,memory,task}`.

2. Start the prover service. For mainnet, you must set both `PROVER_API_KEY`
   and `PROVER_ENFORCE_AUTH=true`:

   ```bash
   PROVER_API_KEY=$(openssl rand -hex 32) \
   PROVER_ENFORCE_AUTH=true \
   NETWORK_PRIVATE_KEY=<succinct-network-key> \
   ./target/release/kage-prover-service
   ```

3. Verify auth + rate limiting:

   ```bash
   curl -i http://localhost:3080/prove/reputation -d '{}' \
     -H 'content-type: application/json'           # → 401
   curl -i http://localhost:3080/prove/reputation -d '{}' \
     -H 'content-type: application/json' \
     -H "x-api-key: $PROVER_API_KEY"                # → 400 (malformed body, auth passes)
   ```

## 5. API server deploy

```bash
pnpm -C packages/api build
PROVER_API_KEY=<same-as-prover> \
ANTHROPIC_API_KEY=<...> \
SOLANA_PRIVATE_KEY=<...> \
PROVER_SERVICE_URL=https://prover.kage.internal \
node packages/api/dist/index.js
```

Health check:

```bash
curl https://api.kage.internal/health
```

The response must contain `zk.proverConnected: true` before accepting
production traffic.

## 6. Mainnet hardening checklist

Before flipping DNS to mainnet:

- [ ] Program deployed with the upgrade authority held by a hardware wallet
- [ ] `PROVER_ENFORCE_AUTH=true` on the prover service
- [ ] `PROVER_API_KEY` rotated from any dev value, stored in secrets manager
- [ ] Rate limits tuned for expected peak load (default 10 rps / 30 burst)
- [ ] TLS termination in front of both API and prover (CloudFront, nginx, …)
- [ ] Firewall: prover service only reachable from the API host
- [ ] `SOLANA_PRIVATE_KEY` for the API agent is a *separate* keypair from
      any personal wallet
- [ ] Arweave funding wallet balance ≥ 1 month runway (if `STORAGE_BACKEND=arweave`)
- [ ] Health checks + uptime alerts wired to `/health`
- [ ] Regular `anchor test` + `pnpm -r test` run against the deploy target

## 7. Rollback

Anchor programs with `--upgrade-authority` can be rolled back by redeploying
the previous build:

```bash
anchor deploy --provider.cluster mainnet \
  --program-name kage \
  --program-keypair target/deploy/kage-keypair.json \
  target/deploy/kage-previous.so
```

Off-chain services: keep the previous container image tagged
(`kage-api:v0.1.0`) and redeploy via `docker pull && docker run`.
