# Kage Operations Runbook

Hands-on procedures for running Kage in production: key rotation, secret
revocation, incident response, and rate-limit tuning. If the deployment
topology changes, update this document first.

See also:
- [docs/DEPLOYMENT.md](DEPLOYMENT.md) — initial bring-up and mainnet checklist
- [docs/SECURITY.md](SECURITY.md) — threat model and trust boundaries
- [docs/MODULE-REALITY.md](MODULE-REALITY.md) — what each SDK module actually enforces

---

## Key inventory

Before any rotation, know which key you are rotating and what else depends
on it. Kage uses seven distinct key types.

| Key | Holder | What it signs / unlocks | Rotation cost |
|-----|--------|------------------------|---------------|
| **Program upgrade authority** | Deployer (hardware wallet / multisig) | Redeploys of `programs/kage` | Extreme — requires coordinated migration |
| **Agent Solana keypair** (`SOLANA_PRIVATE_KEY`) | API host secrets | Writes to vault PDAs (store_memory, grant_access, revoke_access), credential commits, ZK verifications | Medium — new vault PDAs, memories re-encrypted under new master |
| **Agent master encryption key** (derived client-side from agent Solana keypair) | — derived, not stored | AES-256-GCM memory blobs | Follows the Solana keypair — you cannot rotate one without the other |
| **DID signing key** (= Solana keypair) | Same as above | Ed25519 credential envelopes verified by `verify_credential` | Same as agent Solana keypair |
| **Prover API key** (`PROVER_API_KEY`) | API operator → prover operator | `x-api-key` header on prover HTTP calls | Low — rotate any time, all callers must redeploy with new value |
| **Succinct Network key** (`NETWORK_PRIVATE_KEY`) | Prover operator | Submits proof requests to the Succinct Network | Low-to-medium — fund a new wallet, retire the old one |
| **LLM provider API key** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) | API operator | Upstream LLM calls | Low — rotate at the provider dashboard, redeploy |

**Never commit any of these to git.** `.gitignore` excludes `.env`,
`agent-keypair.json`, and `devnet-new-wallet.json` — verify with `git status`
before every push.

---

## Prover API key rotation

Scenario: you suspect `PROVER_API_KEY` has leaked, or you are rotating on a
regular schedule (recommended quarterly).

**Blast radius.** Each distinct `x-api-key` gets its own rate-limit bucket
in the prover service (see [packages/prover-service/src/main.rs](../packages/prover-service/src/main.rs)).
Rotating the key resets the bucket, so an attacker using the old key loses
their state immediately.

### Procedure

1. **Generate the new key** on a trusted machine. Use something
   unpredictable and long:

   ```bash
   NEW_KEY=$(openssl rand -hex 32)
   echo "$NEW_KEY"  # copy this, you'll need it in three places
   ```

2. **Roll the prover service first.** The service refuses to start in
   network mode or when `PROVER_ENFORCE_AUTH=true` without an API key, so
   you must set it *before* starting:

   ```bash
   export PROVER_API_KEY=$NEW_KEY
   export PROVER_ENFORCE_AUTH=true
   systemctl restart kage-prover   # or your runner equivalent
   ```

   Confirm it is up:

   ```bash
   curl -fsS https://prover.kage.internal/health | jq
   ```

3. **Roll the API server.** The API reads `PROVER_API_KEY` at startup and
   forwards it on every prover call via [packages/sdk/src/zk.ts](../packages/sdk/src/zk.ts)
   (`ProverClient` constructor). Update the secret and restart:

   ```bash
   export PROVER_API_KEY=$NEW_KEY
   systemctl restart kage-api
   ```

   Smoke test a commitment end-to-end:

   ```bash
   curl -fsS https://api.kage.internal/zk/commit/reputation \
     -H 'content-type: application/json' \
     -d '{"agentDID":"did:sol:YourAgent","events":[],"claimedScore":100}'
   ```

4. **Invalidate the old key.** If the prover is behind a load balancer or
   secret manager, remove the old value. Wait 5 minutes and verify the old
   key returns `401`:

   ```bash
   curl -i https://prover.kage.internal/prove/reputation \
     -H "x-api-key: $OLD_KEY" -d '{}'   # expect 401
   ```

5. **Audit logs.** Check `tower_http::trace` output for requests tagged
   with the old key in the last hour. If an unknown IP was still using it,
   escalate to incident response.

---

## Agent Solana keypair rotation

Scenario: the agent keypair has leaked (private key exposed in logs, a
developer's laptop was compromised, the airdrop wallet was reused for
something sensitive).

**Blast radius — very high.** The Solana keypair is the agent's identity,
its DID signing key, and the source of its vault encryption master. An
attacker with this key can impersonate the agent, decrypt every memory
stored under the old master, and sign credentials on its behalf. Treat
this as a P0 incident.

### Procedure

1. **Generate a new keypair** offline:

   ```bash
   solana-keygen new --outfile new-agent-keypair.json --no-bip39-passphrase
   NEW_PUBKEY=$(solana-keygen pubkey new-agent-keypair.json)
   ```

2. **Revoke all on-chain access grants** from the old vault. For each PDA
   at `[b"access", old_vault, grantee]`, call `revoke_access` signed by the
   old keypair while it is still valid:

   ```bash
   # Not a one-liner — use a short TypeScript script with @kage/sdk
   # that iterates known grantees and calls revokeAccess on each.
   ```

3. **Revoke issued credentials.** Any credential that the old keypair
   signed can be poisoned by the leaked key. Call `revoke_credential` for
   each credential ID the old agent issued. The revocation PDA is
   permanent — once written, downstream consumers will reject the
   credential regardless of whether an attacker replays the old signature.

4. **Deploy the new keypair** as the API secret:

   ```bash
   # Upload new-agent-keypair.json to the API host's secret store, then:
   export SOLANA_PRIVATE_KEY=$(cat new-agent-keypair.json | jq -c .)
   systemctl restart kage-api
   ```

   The API will auto-create a new vault at `[b"vault", NEW_PUBKEY]` on the
   first `initialize_vault` call.

5. **Memory migration.** Memories encrypted under the old master are
   effectively lost to the new agent instance. Options:
   - **Accept loss.** Simplest; the agent starts fresh. Appropriate if the
     memories were low-value or recoverable from other sources.
   - **Re-encrypt.** If you still have access to the old private key in a
     secure offline environment, decrypt each memory and re-store it under
     the new keypair via `vault.storeMemory(...)`. **Never re-import the
     compromised key into the running API host.** Do the re-encryption
     offline on a one-shot air-gapped machine and feed the new ciphertexts
     to the API as if they were fresh memories.

6. **Announce the rotation** to any downstream consumers (partner agents,
   human operators, the marketplace entry) so they update their DID
   allowlists. The new DID is `did:sol:$NEW_PUBKEY`.

7. **Post-incident.** Rotate every secret that *could* have been accessed
   from the compromised host: `PROVER_API_KEY`, `ANTHROPIC_API_KEY`,
   whatever else was exported in the shell session.

---

## Program upgrade authority rotation

Scenario: the keypair holding upgrade authority over the
`ASK5m43oRE67ipfwuBbagVaiMQpFKYRTZNsvZXUfBtRp` program is being rotated
(scheduled maintenance, or the original holder has left the team).

**Blast radius — program-wide.** Whoever holds this keypair can deploy
arbitrary replacement bytecode to the program and control every vault,
credential, and ZK verification on the network. Plan the rotation with at
least two people present.

### Procedure

1. **Preparation**
   - Generate the new authority keypair **on a hardware wallet** (Ledger,
     Trezor). Never create it as a plain JSON keypair on a laptop.
   - If moving to multisig, set up a Squads or Jito-style program-upgrade
     multisig and record its address.
   - Back up the current authority keypair to a second secure location
     (you will need to sign *one* transaction with it — the handoff).

2. **Perform the handoff** with the old keypair:

   ```bash
   solana program set-upgrade-authority \
     ASK5m43oRE67ipfwuBbagVaiMQpFKYRTZNsvZXUfBtRp \
     --new-upgrade-authority <NEW_AUTHORITY_PUBKEY> \
     --keypair <OLD_AUTHORITY_KEYPAIR>
   ```

3. **Verify on-chain**:

   ```bash
   solana program show ASK5m43oRE67ipfwuBbagVaiMQpFKYRTZNsvZXUfBtRp
   # The "Authority" field must equal the new pubkey.
   ```

4. **Destroy the old keypair** only after you have verified the new one
   can sign an upgrade (optional sanity check: `solana program deploy`
   with the same `.so` file).

5. **Document the new authority** in your internal secret inventory and
   in this runbook's [Key inventory](#key-inventory) section. Note who
   holds it and how they will be contacted during an incident.

**Do NOT**:
- Set the upgrade authority to a plain keypair on a cloud server.
- Use the same authority for devnet and mainnet — keep them separate.
- Delete the old keypair before verifying the new one works.

---

## Incident response

### 1. Suspected API key compromise

**Symptom.** Unusual traffic on prover service logs from an unknown IP,
or someone reports finding your key in a public repo.

**Action.**
1. Rotate `PROVER_API_KEY` immediately ([procedure](#prover-api-key-rotation)).
2. Grep GitHub, Slack, logs for any reference to the leaked value.
3. Review prover service traces for the last 24 hours for any requests
   tagged with the leaked key. File a post-mortem if you see actual
   abuse.

### 2. Prover service outage

**Symptom.** API `/health` shows `zk.proverConnected: false`. Commitments
succeed but don't produce proofs.

**Action.**
1. Check prover service logs: `journalctl -u kage-prover -f`
2. Is the Succinct Network reachable? Try `curl https://rpc.succinct.xyz`
3. Is `NETWORK_PRIVATE_KEY` still funded?
4. If the service itself is crashed, restart it. The API will reconnect
   on its next `commitReputation` call.
5. **Do NOT** fall back to hash-only mode silently in production; alert
   the operator and let them decide whether to degrade gracefully.

### 3. Rate-limit storm

**Symptom.** Prover service returns many `429` responses, or legitimate
clients complain of being throttled.

**Action.**
1. Identify the offending key(s) from `tower_http::trace` logs. Look for
   bursts of requests with the same `x-api-key`.
2. If the traffic is from a legitimate but misbehaving client, raise
   their limit temporarily via `PROVER_RATE_PER_SECOND` /
   `PROVER_RATE_BURST` on a per-deployment basis, OR coordinate a client
   fix to back off.
3. If the traffic is malicious, rotate the affected key and block at the
   firewall / load balancer.
4. Tune defaults: 10 rps / 30 burst is a conservative starting point.
   Scale up proportionally with your infrastructure's observed ceiling.

### 4. On-chain exploit (program bug)

**Symptom.** A security researcher or user reports that an unauthorized
pubkey was able to mutate someone else's vault, or a credential signature
does not match.

**Action.**
1. **Halt writes.** Set the API to a read-only mode (emergency deploy of
   a build that disables mutation routes, or remove all routes except
   `/health` and `/tier`).
2. **Diagnose** using recent tx logs. If the exploit is a program bug,
   reproduce it on devnet first.
3. **Coordinate a program upgrade** with the upgrade authority holder.
   Deploy a patched `.so`.
4. **Disclose** to users who had vaults on the affected program. Rotate
   any keypair that signed suspicious transactions during the exposure
   window.

### 5. Exposed wallet in a git commit

**Symptom.** `git log` shows a commit adding a `wallet.json` or `.env`
file with real private-key bytes.

**Action.**
1. Treat the key as **already compromised**, even if the commit was
   reverted. Rotate it immediately ([procedure](#agent-solana-keypair-rotation)
   if it was an agent key).
2. Force-push does NOT help — GitHub caches and third parties may have
   cloned the commit. The key is burned.
3. File a post-mortem and tighten `.gitignore` + pre-commit hooks so the
   class of mistake cannot recur.

---

## Rate-limit tuning

The prover service rate-limits by `x-api-key` (see
[packages/prover-service/src/main.rs](../packages/prover-service/src/main.rs)).
Defaults are set low because SP1 proof generation is the expensive
downstream operation — the limit is there to protect the prover, not to
protect the user.

| Variable | Default | Meaning |
|----------|---------|---------|
| `PROVER_RATE_PER_SECOND` | 10 | Sustained req/sec per API key |
| `PROVER_RATE_BURST` | 30 | Burst allowance before throttling |

### When to raise

- You have multiple production API instances fanning out to one prover,
  and your peak legitimate traffic exceeds the default. Measure first.
- You have a batch job that bursts many commitments at once (e.g. a
  nightly reputation snapshot for every agent).

### When to lower

- The prover is saturated (CPU mode runs out of worker threads; network
  mode hits Succinct's own rate limit).
- You are under a rate-limit storm and want to reject faster.

### How

Restart the prover with the new values. No other change needed — the
key extractor picks them up at bucket creation time.

---

## Day-2 checklists

### Weekly

- [ ] `git log` on every host for any commits touching `.env` or
      `agent-keypair.json` paths.
- [ ] Verify `/health` on API and prover.
- [ ] Check Succinct Network wallet balance if running network mode.
- [ ] Skim prover rate-limit 429 counts — spikes indicate a key is
      exceeding its ceiling.

### Monthly

- [ ] Review the `Key inventory` table for accuracy.
- [ ] Rotate the prover API key.
- [ ] Run `pnpm -r test` against the current HEAD on each deployment
      target.
- [ ] Re-verify the DEPLOYMENT.md checklist still matches reality.

### Quarterly

- [ ] Rotate `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.
- [ ] Dry-run an agent keypair rotation on devnet and time it.
- [ ] Review dependency CVEs (`pnpm audit`, `cargo audit`).

### Yearly

- [ ] Consider rotating the program upgrade authority.
- [ ] Schedule an external security review.
