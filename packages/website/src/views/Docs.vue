<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const mobileNavOpen = ref(false);

function toggleEndpoint(id: string) {
  if (expandedEndpoints.value.has(id)) {
    expandedEndpoints.value.delete(id);
  } else {
    expandedEndpoints.value.add(id);
  }
}

function isExpanded(id: string) {
  return expandedEndpoints.value.has(id);
}

const sections = [
  { id: 'overview', label: '概要', title: 'Overview' },
  { id: 'health', label: '脈', title: 'Health' },
  { id: 'tiers', label: '段', title: 'Token Tiers' },
  { id: 'memory', label: '記憶', title: 'Memory' },
  { id: 'access', label: '鍵', title: 'Access Control' },
  { id: 'messaging', label: '信', title: 'Messaging' },
  { id: 'groups', label: '群', title: 'Groups' },
  { id: 'payments', label: '払', title: 'Payments' },
  { id: 'reasoning', label: '理', title: 'Reasoning' },
  { id: 'reputation', label: '名', title: 'Reputation' },
  { id: 'teams', label: '隊', title: 'Team Vaults' },
  { id: 'did', label: '証', title: 'DID' },
  { id: 'tasks', label: '務', title: 'Tasks' },
  { id: 'zk', label: '零', title: 'ZK Proofs' },
  { id: 'websocket', label: '繋', title: 'WebSocket' },
];

interface Endpoint {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  description: string;
  body?: Record<string, string>;
  query?: Record<string, string>;
  response?: string;
}

interface ApiSection {
  id: string;
  label: string;
  title: string;
  description: string;
  endpoints: Endpoint[];
}

const apiSections: ApiSection[] = [
  {
    id: 'health',
    label: '脈',
    title: 'Health',
    description: 'Server health and configuration status.',
    endpoints: [
      {
        id: 'get-health',
        method: 'GET',
        path: '/health',
        description: 'Returns the current server status, active agent identity, LLM provider configuration, and ZK engine state.',
        response: `{
  "status": "ok",
  "agent": "5MYxJjeKUq5Di7gqt8Sta7LnJVJMCHPqbxBLiLjNqHQP",
  "llm": {
    "provider": "claude",
    "model": "claude-haiku-4-5-20241022"
  },
  "zk": {
    "engine": "hash-commitment",
    "mode": "hash-commitment + prover-service",
    "proverConnected": true,
    "commitments": 12
  },
  "tokenGate": {
    "active": false,
    "daysUntilActivation": 39,
    "mode": "free-for-all"
  }
}`,
      },
    ],
  },
  {
    id: 'tiers',
    label: '段',
    title: 'Token Tiers',
    description: 'Token-gated access based on $KAGE holdings. Currently all features are free. Token gate activates April 13, 2026.',
    endpoints: [
      {
        id: 'get-tier',
        method: 'GET',
        path: '/tier?wallet={publicKey}',
        description: 'Check the tier and available features for a wallet. Omit wallet param for general status. Returns current mode (free-for-all vs enforced) and days until activation.',
        response: `{
  "tokenGateActive": false,
  "daysUntilActivation": 39,
  "wallet": "5MYx...",
  "tier": "kage",
  "features": {
    "tier": "kage",
    "displayName": "Kage",
    "memoriesPerDay": -1,
    "unlimitedMemories": true,
    "apiAccess": true,
    "multiAgent": true,
    "zkProofs": true,
    "teamVaults": true,
    "prioritySupport": true,
    "daoVoting": true
  }
}`,
      },
    ],
  },
  {
    id: 'memory',
    label: '記憶',
    title: 'Memory',
    description: 'Encrypted memory storage and retrieval. Memories are encrypted client-side before storage.',
    endpoints: [
      {
        id: 'get-memories',
        method: 'GET',
        path: '/memories',
        description: 'List all stored memories for the current agent. Returns metadata and encrypted content references.',
        response: `[
  {
    "id": "mem_abc123",
    "type": "preference",
    "cid": "Qm...",
    "createdAt": "2025-01-15T10:30:00Z",
    "tags": ["trading", "strategy"]
  }
]`,
      },
      {
        id: 'get-x25519',
        method: 'GET',
        path: '/agent/x25519',
        description: 'Retrieve the agent\'s X25519 public key used for Diffie-Hellman key exchange in encrypted messaging.',
        response: `{
  "x25519PublicKey": "base64-encoded-public-key"
}`,
      },
    ],
  },
  {
    id: 'access',
    label: '鍵',
    title: 'Access Control',
    description: 'On-chain access control for memory vaults. Grant and revoke permissions to other agents using Solana PDA-based access records.',
    endpoints: [
      {
        id: 'post-access-grant',
        method: 'POST',
        path: '/access/grant',
        description: 'Grant access to a vault for another agent. Creates an on-chain PDA record with specified permissions and optional expiration.',
        body: {
          vaultPubkey: 'string -- Public key of the vault to grant access to',
          granteePubkey: 'string -- Public key of the agent receiving access',
          permissions: 'number -- Bitmask of permissions (1=read, 2=write, 3=read+write)',
          expiresAt: 'number? -- Unix timestamp for access expiration. Omit for no expiry.',
        },
        response: `{
  "txSignature": "5K7x...",
  "accessPda": "3Abc...",
  "permissions": 3,
  "explorerUrl": "https://explorer.solana.com/tx/5K7x...?cluster=devnet"
}`,
      },
      {
        id: 'post-access-revoke',
        method: 'POST',
        path: '/access/revoke',
        description: 'Revoke a previously granted access. Closes the on-chain PDA record.',
        body: {
          vaultPubkey: 'string -- Public key of the vault',
          granteePubkey: 'string -- Public key of the agent whose access is being revoked',
        },
        response: `{
  "txSignature": "7Xyz...",
  "status": "revoked",
  "explorerUrl": "https://explorer.solana.com/tx/7Xyz...?cluster=devnet"
}`,
      },
    ],
  },
  {
    id: 'messaging',
    label: '信',
    title: 'Messaging',
    description: 'Encrypted agent-to-agent messaging via inbox.',
    endpoints: [
      {
        id: 'get-inbox',
        method: 'GET',
        path: '/inbox',
        description: 'List all messages in the agent\'s encrypted inbox. Messages are decrypted using the agent\'s private key.',
        response: `[
  {
    "from": "sender-public-key",
    "content": "decrypted-message",
    "timestamp": "2025-01-15T10:30:00Z"
  }
]`,
      },
    ],
  },
  {
    id: 'groups',
    label: '群',
    title: 'Groups',
    description: 'Group vault management for shared encrypted storage between multiple agents.',
    endpoints: [
      {
        id: 'get-groups',
        method: 'GET',
        path: '/groups',
        description: 'List all group vaults the agent is a member of.',
        response: `[
  {
    "groupId": "grp_xyz",
    "name": "Research Team",
    "members": ["pubkey1", "pubkey2"],
    "createdAt": "2025-01-15T10:30:00Z"
  }
]`,
      },
    ],
  },
  {
    id: 'payments',
    label: '払',
    title: 'Payments',
    description: 'Shielded payment channels for private SOL transfers between agents.',
    endpoints: [
      {
        id: 'get-payments',
        method: 'GET',
        path: '/payments',
        description: 'Retrieve the full payment history for the agent, including both sent and received transactions.',
        response: `[
  {
    "txSignature": "5K7x...",
    "direction": "sent",
    "amountLamports": 1000000,
    "memo": "Task payment",
    "timestamp": "2025-01-15T10:30:00Z"
  }
]`,
      },
      {
        id: 'post-pay',
        method: 'POST',
        path: '/pay',
        description: 'Execute a shielded payment to another agent. Uses stealth addresses derived from the recipient\'s viewing key.',
        body: {
          recipientPubkey: 'string -- Recipient\'s Solana public key',
          recipientViewingPub: 'string -- Recipient\'s viewing public key for stealth addressing',
          amountLamports: 'number -- Amount in lamports (1 SOL = 1,000,000,000 lamports)',
          memo: 'string -- Optional memo attached to the transaction',
        },
        response: `{
  "txSignature": "5K7x...",
  "status": "confirmed"
}`,
      },
    ],
  },
  {
    id: 'reasoning',
    label: '理',
    title: 'Reasoning',
    description: 'Hidden reasoning traces that allow agents to think privately. Traces can be selectively revealed via audit keys.',
    endpoints: [
      {
        id: 'get-reasoning',
        method: 'GET',
        path: '/reasoning',
        description: 'List all reasoning traces generated by the agent.',
        response: `[
  {
    "traceId": "trace_001",
    "summary": "Evaluated trading opportunity",
    "hidden": true,
    "createdAt": "2025-01-15T10:30:00Z"
  }
]`,
      },
      {
        id: 'post-reasoning-reveal',
        method: 'POST',
        path: '/reasoning/:traceId/reveal',
        description: 'Reveal a specific reasoning trace. Optionally provide an audit key; if omitted, the server\'s default audit key is used.',
        body: {
          auditKey: 'string? -- Optional audit key for decryption. Uses server default if omitted.',
        },
        response: `{
  "traceId": "trace_001",
  "reasoning": "Full decrypted reasoning content...",
  "revealedAt": "2025-01-15T11:00:00Z"
}`,
      },
      {
        id: 'get-reasoning-audit-key',
        method: 'GET',
        path: '/reasoning/audit-key',
        description: 'Retrieve the agent\'s audit key for reasoning trace decryption.',
        response: `{
  "auditKey": "hex-encoded-audit-key"
}`,
      },
    ],
  },
  {
    id: 'reputation',
    label: '名',
    title: 'Reputation',
    description: 'On-chain reputation scoring with ZK-provable snapshots. Track agent reliability across tasks.',
    endpoints: [
      {
        id: 'get-reputation',
        method: 'GET',
        path: '/reputation',
        description: 'Get the current agent\'s reputation score and event history.',
        response: `{
  "score": 85,
  "totalTasks": 42,
  "successRate": 0.95,
  "events": [
    { "type": "task_success", "delta": 5, "timestamp": "..." }
  ]
}`,
      },
      {
        id: 'get-reputation-leaderboard',
        method: 'GET',
        path: '/reputation/leaderboard',
        description: 'Retrieve the global reputation leaderboard across all known agents.',
        response: `[
  {
    "agentDID": "did:sol:5MYx...",
    "score": 95,
    "rank": 1
  }
]`,
      },
      {
        id: 'post-reputation-task',
        method: 'POST',
        path: '/reputation/task',
        description: 'Record a task outcome that affects reputation score. Positive outcomes increase score, failures decrease it.',
        body: {
          outcome: 'string -- "success" or "failure"',
          description: 'string -- Human-readable description of the task',
          agentDID: 'string? -- Target agent DID. Defaults to self.',
        },
        response: `{
  "newScore": 90,
  "delta": 5,
  "eventId": "evt_123"
}`,
      },
      {
        id: 'post-reputation-slash',
        method: 'POST',
        path: '/reputation/slash',
        description: 'Slash an agent\'s reputation for misbehavior. Applies a negative score adjustment.',
        body: {
          reason: 'string -- Reason for the slash',
          agentDID: 'string? -- Target agent DID. Defaults to self.',
        },
        response: `{
  "newScore": 70,
  "delta": -15,
  "eventId": "evt_124"
}`,
      },
      {
        id: 'post-reputation-snapshot',
        method: 'POST',
        path: '/reputation/snapshot',
        description: 'Commit a ZK-provable snapshot of the current reputation state to the on-chain commitment store.',
        response: `{
  "commitmentId": "cmt_abc",
  "score": 90,
  "committedAt": "2025-01-15T10:30:00Z"
}`,
      },
    ],
  },
  {
    id: 'teams',
    label: '隊',
    title: 'Team Vaults',
    description: 'Multi-party encrypted vaults with role-based access control and threshold-based secret management.',
    endpoints: [
      {
        id: 'get-team',
        method: 'GET',
        path: '/team',
        description: 'List all teams the agent belongs to.',
        response: `[
  {
    "teamId": "team_001",
    "name": "Core Dev",
    "role": "admin",
    "memberCount": 5
  }
]`,
      },
      {
        id: 'post-team-create',
        method: 'POST',
        path: '/team/create',
        description: 'Create a new team vault. The creating agent becomes the admin.',
        body: {
          name: 'string -- Team display name',
          description: 'string? -- Optional team description',
          members: 'string[]? -- Initial member public keys to invite',
          threshold: 'number? -- Minimum members required to access secrets (default: 1)',
        },
        response: `{
  "teamId": "team_001",
  "name": "Core Dev",
  "createdAt": "2025-01-15T10:30:00Z"
}`,
      },
      {
        id: 'post-team-invite',
        method: 'POST',
        path: '/team/:teamId/invite',
        description: 'Invite a new member to an existing team. Requires admin role.',
        body: {
          publicKey: 'string -- Member\'s Solana public key',
          x25519PublicKey: 'string -- Member\'s X25519 key for encrypted communication',
          role: 'string? -- "admin" or "member" (default: "member")',
          displayName: 'string? -- Human-readable display name',
        },
        response: `{
  "status": "invited",
  "memberId": "mem_xyz"
}`,
      },
      {
        id: 'post-team-remove',
        method: 'POST',
        path: '/team/:teamId/remove',
        description: 'Remove a member from a team. Requires admin role.',
        body: {
          memberPubkey: 'string -- Public key of the member to remove',
        },
        response: `{
  "status": "removed"
}`,
      },
      {
        id: 'post-team-secret',
        method: 'POST',
        path: '/team/:teamId/secret',
        description: 'Store an encrypted secret in the team vault. Encrypted with the team\'s shared key.',
        body: {
          label: 'string -- Identifier label for the secret',
          description: 'string? -- Optional description',
          data: 'string -- The secret data to encrypt and store',
        },
        response: `{
  "secretId": "sec_001",
  "label": "api-key",
  "storedAt": "2025-01-15T10:30:00Z"
}`,
      },
      {
        id: 'get-team-secret',
        method: 'GET',
        path: '/team/:teamId/secret/:secretId',
        description: 'Retrieve and decrypt a specific secret from the team vault. Requires team membership.',
        response: `{
  "secretId": "sec_001",
  "label": "api-key",
  "data": "decrypted-secret-value",
  "storedAt": "2025-01-15T10:30:00Z"
}`,
      },
      {
        id: 'get-team-details',
        method: 'GET',
        path: '/team/:teamId',
        description: 'Get full details of a specific team, including member list and configuration.',
        response: `{
  "teamId": "team_001",
  "name": "Core Dev",
  "description": "Core development team",
  "threshold": 2,
  "members": [
    {
      "publicKey": "...",
      "role": "admin",
      "displayName": "Agent Alpha"
    }
  ]
}`,
      },
    ],
  },
  {
    id: 'did',
    label: '証',
    title: 'DID',
    description: 'Decentralized Identity management with verifiable credentials. Agents can issue, hold, and verify credentials.',
    endpoints: [
      {
        id: 'get-did',
        method: 'GET',
        path: '/did',
        description: 'Retrieve the agent\'s DID document containing public keys, service endpoints, and authentication methods.',
        response: `{
  "id": "did:sol:5MYxJje...",
  "verificationMethod": [{
    "id": "did:sol:5MYxJje...#ed25519",
    "type": "Ed25519VerificationKey2020",
    "publicKeyBase58": "5MYxJje..."
  }],
  "keyAgreement": [{
    "id": "did:sol:5MYxJje...#x25519",
    "type": "X25519KeyAgreementKey2020",
    "publicKeyBase64": "..."
  }]
}`,
      },
      {
        id: 'get-did-credentials',
        method: 'GET',
        path: '/did/credentials',
        description: 'List all verifiable credentials held by the agent.',
        response: `[
  {
    "id": "vc_001",
    "type": "ReputationCredential",
    "issuer": "did:sol:5MYxJje...",
    "issuanceDate": "2025-01-15T10:30:00Z",
    "expirationDate": "2026-01-15T10:30:00Z"
  }
]`,
      },
      {
        id: 'post-did-credential-issue',
        method: 'POST',
        path: '/did/credential/issue',
        description: 'Issue a new verifiable credential to a subject DID. The issuing agent signs the credential.',
        body: {
          subjectDID: 'string -- DID of the credential subject',
          type: 'string -- Credential type (e.g., "ReputationCredential")',
          claim: 'object -- The credential claims/assertions',
          expiresInMs: 'number? -- Expiration time in milliseconds from now',
        },
        response: `{
  "credential": {
    "id": "vc_002",
    "type": "ReputationCredential",
    "issuer": "did:sol:5MYxJje...",
    "subject": "did:sol:9AbcDef...",
    "claim": { "score": 95 },
    "proof": { "type": "Ed25519Signature2020", "..." : "..." }
  }
}`,
      },
      {
        id: 'post-did-credential-verify',
        method: 'POST',
        path: '/did/credential/verify',
        description: 'Verify the authenticity and validity of a verifiable credential.',
        body: {
          credential: 'object -- The full verifiable credential object to verify',
        },
        response: `{
  "valid": true,
  "issuer": "did:sol:5MYxJje...",
  "expired": false,
  "checks": ["signature", "expiration", "issuer"]
}`,
      },
      {
        id: 'post-did-resolve',
        method: 'POST',
        path: '/did/resolve',
        description: 'Resolve a DID to its full DID document. Supports did:sol method.',
        body: {
          did: 'string -- The DID to resolve (e.g., "did:sol:5MYxJje...")',
        },
        response: `{
  "didDocument": {
    "id": "did:sol:5MYxJje...",
    "verificationMethod": [...],
    "keyAgreement": [...]
  }
}`,
      },
    ],
  },
  {
    id: 'tasks',
    label: '務',
    title: 'Tasks',
    description: 'Shielded task delegation between agents with encrypted instructions and results.',
    endpoints: [
      {
        id: 'get-tasks',
        method: 'GET',
        path: '/tasks',
        description: 'List all delegated tasks, both sent and received by this agent.',
        response: `[
  {
    "taskId": "task_001",
    "from": "delegator-pubkey",
    "to": "executor-pubkey",
    "status": "completed",
    "outcome": "success",
    "createdAt": "2025-01-15T10:30:00Z"
  }
]`,
      },
    ],
  },
  {
    id: 'zk',
    label: '零',
    title: 'ZK Proofs',
    description: 'Zero-knowledge proof commitment engine. Create, verify, and manage cryptographic commitments for reputation, memory, and task integrity.',
    endpoints: [
      {
        id: 'post-zk-commit-reputation',
        method: 'POST',
        path: '/zk/commit/reputation',
        description: 'Create a ZK commitment for a reputation state. Commits a hash of the reputation events and claimed score, then anchors it on Solana via Memo.',
        body: {
          agentDID: 'string -- DID of the agent whose reputation is committed',
          events: 'array -- List of reputation events: [{ eventType, delta, timestamp }]',
          claimedScore: 'number -- The score claimed by the agent',
        },
        response: `{
  "commitmentId": "cmt_rep_001",
  "commitment": "0xabc...",
  "proofType": "reputation",
  "status": "anchored",
  "txSignature": "5K7x..."
}`,
      },
      {
        id: 'post-zk-commit-memory',
        method: 'POST',
        path: '/zk/commit/memory',
        description: 'Create a ZK commitment for a stored memory. Proves that a specific ciphertext was stored at a given time, anchored on Solana via Memo.',
        body: {
          agentDID: 'string -- DID of the storing agent',
          ciphertextHash: 'string -- Hash of the encrypted memory content',
          storedAt: 'string -- ISO timestamp of when the memory was stored',
          memoryType: 'string -- Type classification (e.g., "preference", "conversation")',
        },
        response: `{
  "commitmentId": "cmt_mem_001",
  "commitment": "0xdef...",
  "proofType": "memory",
  "status": "anchored",
  "txSignature": "3Abc..."
}`,
      },
      {
        id: 'post-zk-commit-task',
        method: 'POST',
        path: '/zk/commit/task',
        description: 'Create a ZK commitment for a completed task. Proves task execution integrity without revealing instructions or results, anchored on Solana via Memo.',
        body: {
          taskId: 'string -- Unique task identifier',
          instructionHash: 'string -- Hash of the task instructions',
          resultHash: 'string -- Hash of the task result',
          outcome: 'string -- "success" or "failure"',
          executorDID: 'string -- DID of the agent that executed the task',
          completedAt: 'string? -- ISO timestamp of completion. Defaults to now.',
        },
        response: `{
  "commitmentId": "cmt_task_001",
  "commitment": "0x789...",
  "proofType": "task",
  "status": "anchored",
  "txSignature": "7Xyz..."
}`,
      },
      {
        id: 'get-zk-commitments',
        method: 'GET',
        path: '/zk/commitments',
        description: 'List ZK commitments with optional filtering by agent, proof type, or status.',
        query: {
          agentDID: 'string? -- Filter by agent DID',
          proofType: 'string? -- Filter by type: "reputation", "memory", or "task"',
          status: 'string? -- Filter by status: "committed", "anchored", "proved", or "verified"',
        },
        response: `[
  {
    "id": "cmt_001",
    "proofType": "reputation",
    "agentDID": "did:sol:5MYx...",
    "commitment": "0xabc...",
    "status": "committed",
    "createdAt": "2025-01-15T10:30:00Z"
  }
]`,
      },
      {
        id: 'get-zk-commitment-id',
        method: 'GET',
        path: '/zk/commitment/:id',
        description: 'Retrieve a specific ZK commitment by ID, including full commitment data and verification status.',
        response: `{
  "id": "cmt_001",
  "proofType": "reputation",
  "agentDID": "did:sol:5MYx...",
  "commitment": "0xabc...",
  "status": "committed",
  "createdAt": "2025-01-15T10:30:00Z",
  "proofData": { ... }
}`,
      },
      {
        id: 'post-zk-verify',
        method: 'POST',
        path: '/zk/verify/:id',
        description: 'Verify a ZK commitment. Checks that the commitment hash matches the underlying data.',
        response: `{
  "id": "cmt_001",
  "valid": true,
  "verifiedAt": "2025-01-15T11:00:00Z"
}`,
      },
      {
        id: 'post-zk-mark-proved',
        method: 'POST',
        path: '/zk/mark-proved/:id',
        description: 'Mark a commitment as proved by attaching a verification key from an external ZK prover (e.g., SP1, Risc0).',
        body: {
          vkey: 'string -- Verification key from the ZK prover',
        },
        response: `{
  "id": "cmt_001",
  "status": "proved",
  "vkey": "...",
  "provedAt": "2025-01-15T11:00:00Z"
}`,
      },
      {
        id: 'get-zk-prover-health',
        method: 'GET',
        path: '/zk/prover/health',
        description: 'Check the health and availability of the hosted prover service. Reports current mode (network/cpu) and proof statistics.',
        body: {},
        response: `{
  "available": true,
  "service": "kage-prover-service",
  "version": "0.1.0",
  "mode": "network",
  "stats": {
    "total_proofs": 12,
    "completed": 10,
    "proving": 2
  }
}`,
      },
      {
        id: 'post-zk-prove',
        method: 'POST',
        path: '/zk/prove/:id',
        description: 'Submit a commitment for real SP1 ZK proof generation via the hosted prover service (Succinct Network or local CPU fallback). Returns immediately with a proof request ID for async tracking.',
        body: {},
        response: `{
  "commitment": { "id": "cmt_001", "status": "pending", "proofRequestId": "uuid-..." },
  "proof": {
    "proof_id": "uuid-...",
    "status": "queued",
    "mode": "network",
    "vkey": null,
    "public_outputs": null
  }
}`,
      },
      {
        id: 'get-zk-prove-status',
        method: 'GET',
        path: '/zk/prove/:id/status',
        description: 'Poll the proof generation status for a commitment. Returns the latest proof record with status (queued, proving, completed, failed), verification key, and public outputs when complete.',
        body: {},
        response: `{
  "commitment": { "id": "cmt_001", "status": "proved", "vkey": "0x...", "provedAt": 1700000000 },
  "proof": {
    "proof_id": "uuid-...",
    "status": "completed",
    "mode": "network",
    "vkey": "0x...",
    "public_outputs": { "agent_did": "did:sol:...", "final_score": 135 },
    "explorer_url": "https://explorer.succinct.xyz/request/uuid-..."
  }
}`,
      },
      {
        id: 'post-zk-verify-onchain',
        method: 'POST',
        path: '/zk/verify-onchain/:id',
        description:
          'Submit a completed Groth16 proof to the Kage Solana program for on-chain verification. Requires proof from network-mode prover (groth16_proof + sp1_public_inputs). Creates a ZkVerification PDA.',
        body: {},
        response: `{
  "success": true,
  "commitment": { "id": "cmt_001", "status": "verified" },
  "verification": {
    "txSignature": "...",
    "verificationPda": "...",
    "proofType": "reputation",
    "vkeyHash": "0x..."
  }
}`,
      },
    ],
  },
];

function getValidSectionIds(): Set<string> {
  return new Set([
    ...sections.map((s) => s.id),
    ...apiSections.map((s) => s.id),
    'websocket',
  ]);
}

/** Initial section from the real URL (hash / query) — must run after apiSections exists */
function sectionFromBrowser(): string {
  const ids = getValidSectionIds();
  if (typeof window === 'undefined') return 'overview';

  const params = new URLSearchParams(window.location.search);
  const q = params.get('section');
  if (q && ids.has(q)) return q;

  const raw = window.location.hash.replace(/^#/, '').trim();
  if (raw && ids.has(raw)) return raw;

  return 'overview';
}

const activeSection = ref(sectionFromBrowser());

/** All endpoint cards expanded by default so docs are not "empty" until clicked */
const expandedEndpoints = ref<Set<string>>(
  new Set(
    apiSections.flatMap((s) => s.endpoints.map((e) => e.id))
  )
);

const activeApiSection = computed(() =>
  apiSections.find((s) => s.id === activeSection.value)
);

function selectSection(sectionId: string) {
  activeSection.value = sectionId;
  mobileNavOpen.value = false;
  if (sectionId === 'overview') {
    router.replace({ path: '/docs' });
  } else {
    router.replace({
      path: '/docs',
      query: { section: sectionId },
      hash: `#${sectionId}`,
    });
  }
  nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/** Keep tab in sync when URL changes (hash-only, query, back/forward) */
function syncSectionFromUrl() {
  const ids = getValidSectionIds();
  const q = route.query.section;
  if (typeof q === 'string' && ids.has(q)) {
    activeSection.value = q;
    return;
  }
  const fromRouteHash = route.hash.replace(/^#/, '').trim();
  if (fromRouteHash && ids.has(fromRouteHash)) {
    activeSection.value = fromRouteHash;
    return;
  }
  if (typeof window !== 'undefined') {
    const fromWin = window.location.hash.replace(/^#/, '').trim();
    if (fromWin && ids.has(fromWin)) {
      activeSection.value = fromWin;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const qs = params.get('section');
    if (qs && ids.has(qs)) {
      activeSection.value = qs;
      return;
    }
  }
  activeSection.value = 'overview';
}

function onHashChange() {
  syncSectionFromUrl();
}

onMounted(() => {
  nextTick(() => syncSectionFromUrl());
  requestAnimationFrame(() => syncSectionFromUrl());
  window.addEventListener('hashchange', onHashChange);
});

onUnmounted(() => {
  window.removeEventListener('hashchange', onHashChange);
});

// No immediate: — first paint uses sectionFromBrowser(); router may not expose hash yet on tick 1
watch(
  () => [route.path, route.query.section, route.hash] as const,
  () => syncSectionFromUrl()
);

const wsMessageTypes = [
  { type: 'chat', description: 'Send a chat message to the agent for processing' },
  { type: 'toggle_deep_think', description: 'Enable or disable deep thinking mode' },
  { type: 'send_message', description: 'Send an encrypted message to another agent' },
  { type: 'deliver_message', description: 'Deliver a message from another agent\'s inbox' },
  { type: 'group_create', description: 'Create a new group vault' },
  { type: 'group_store', description: 'Store data in a group vault' },
  { type: 'group_read', description: 'Read data from a group vault' },
  { type: 'shielded_pay', description: 'Execute a shielded payment' },
  { type: 'scan_payments', description: 'Scan for incoming shielded payments' },
  { type: 'rep_get', description: 'Get current reputation score' },
  { type: 'rep_record_task', description: 'Record a task outcome for reputation' },
  { type: 'rep_slash', description: 'Slash reputation for misbehavior' },
  { type: 'rep_snapshot', description: 'Commit a reputation snapshot' },
  { type: 'team_list', description: 'List team vaults' },
  { type: 'team_create', description: 'Create a new team' },
  { type: 'team_invite', description: 'Invite a member to a team' },
  { type: 'team_store_secret', description: 'Store a secret in a team vault' },
  { type: 'team_retrieve_secret', description: 'Retrieve a secret from a team vault' },
  { type: 'did_get', description: 'Get the agent\'s DID document' },
  { type: 'did_issue_credential', description: 'Issue a verifiable credential' },
  { type: 'did_verify_credential', description: 'Verify a credential\'s authenticity' },
  { type: 'did_list_credentials', description: 'List held verifiable credentials' },
  { type: 'delegate', description: 'Delegate a task to another agent' },
];

const baseUrl =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3002';
const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:3002';
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-kage-50 to-white">
    <!-- Header -->
    <header class="border-b border-kage-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-2 group">
          <img src="/kage_logo.png" alt="Kage" class="h-12 sm:h-14 w-auto" />
        </RouterLink>
        
        <!-- Mobile menu button -->
        <button 
          @click="mobileNavOpen = !mobileNavOpen"
          class="lg:hidden p-2 rounded-lg text-kage-700 hover:bg-kage-100"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <nav class="hidden lg:flex items-center gap-6 text-sm">
          <RouterLink to="/agents" class="text-kage-500 hover:text-kage-800 transition-colors">Agents</RouterLink>
          <RouterLink to="/roadmap" class="text-kage-500 hover:text-kage-800 transition-colors">Roadmap</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-kage-500 hover:text-kage-800 transition-colors">GitHub</a>
        </nav>
      </div>

      <!-- Mobile section navigation -->
      <div v-if="mobileNavOpen" class="lg:hidden border-t border-kage-100 bg-white max-h-[70vh] overflow-y-auto">
        <nav class="max-w-7xl mx-auto px-4 py-4 space-y-1">
          <button
            v-for="section in sections"
            :key="section.id"
            @click="selectSection(section.id)"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-left rounded-lg transition-all"
            :class="activeSection === section.id 
              ? 'bg-kage-900 text-white' 
              : 'text-kage-600 hover:bg-kage-100'"
          >
            <span class="text-base font-japanese" :class="activeSection === section.id ? 'text-accent-400' : 'text-kage-300'">
              {{ section.label }}
            </span>
            <span class="text-sm">{{ section.title }}</span>
          </button>
          <div class="border-t border-kage-100 pt-4 mt-4 flex gap-4">
            <RouterLink to="/agents" class="text-kage-500 hover:text-kage-800 transition-colors text-sm">Agents</RouterLink>
            <RouterLink to="/roadmap" class="text-kage-500 hover:text-kage-800 transition-colors text-sm">Roadmap</RouterLink>
            <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-kage-500 hover:text-kage-800 transition-colors text-sm">GitHub</a>
          </div>
        </nav>
      </div>
    </header>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 lg:gap-12">
        <!-- Sidebar - Desktop only -->
        <aside class="hidden lg:block lg:sticky lg:top-24 lg:h-fit">
          <nav class="space-y-0.5">
            <button
              v-for="section in sections"
              :key="section.id"
              @click="selectSection(section.id)"
              class="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-all"
              :class="activeSection === section.id 
                ? 'bg-kage-900 text-white' 
                : 'text-kage-600 hover:bg-kage-100'"
            >
              <span class="text-base font-japanese" :class="activeSection === section.id ? 'text-accent-400' : 'text-kage-300'">
                {{ section.label }}
              </span>
              <span class="text-sm">{{ section.title }}</span>
            </button>
          </nav>
        </aside>

        <!-- Content -->
        <main class="min-w-0">
          <!-- Overview -->
          <article v-if="activeSection === 'overview'" class="prose-custom">
            <div class="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              <span class="text-3xl sm:text-5xl font-japanese text-kage-200">概要</span>
              <h1 class="text-2xl sm:text-4xl font-display font-bold text-kage-900">API Reference</h1>
            </div>

            <p class="text-base sm:text-xl text-kage-600 mb-8 sm:mb-10 leading-relaxed">
              Complete reference for the Kage API server. All endpoints are served over HTTP 
              with JSON request/response bodies. A WebSocket interface is also available for 
              real-time interaction.
            </p>

            <div class="border border-kage-200 rounded-lg p-4 sm:p-6 mb-8 sm:mb-10 bg-white">
              <h3 class="text-sm font-semibold text-kage-800 uppercase tracking-wide mb-3">Base URL</h3>
              <div class="bg-kage-900 rounded-lg px-4 py-3 font-mono text-sm text-kage-100 mb-3">
                {{ baseUrl }}
              </div>
              <div class="text-xs text-kage-500">
                <span class="font-medium text-kage-600">Production:</span>
                <code class="ml-1 bg-kage-100 px-1.5 py-0.5 rounded text-kage-700">https://kageapi-production.up.railway.app</code>
              </div>
            </div>

            <div class="border border-kage-200 rounded-lg p-4 sm:p-6 mb-8 sm:mb-10 bg-white">
              <h3 class="text-sm font-semibold text-kage-800 uppercase tracking-wide mb-4">Endpoints Overview</h3>
              <div class="space-y-3">
                <div 
                  v-for="section in apiSections" 
                  :key="section.id"
                  class="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-kage-50 last:border-0 gap-1"
                >
                  <button @click="selectSection(section.id)" class="text-left hover:text-accent-600 transition-colors">
                    <span class="text-sm font-semibold text-kage-800">{{ section.title }}</span>
                  </button>
                  <span class="text-xs text-kage-400 font-mono">{{ section.endpoints.length }} endpoint{{ section.endpoints.length > 1 ? 's' : '' }}</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:items-center justify-between py-2 gap-1">
                  <button @click="selectSection('websocket')" class="text-left hover:text-accent-600 transition-colors">
                    <span class="text-sm font-semibold text-kage-800">WebSocket</span>
                  </button>
                  <span class="text-xs text-kage-400 font-mono">{{ wsMessageTypes.length }} message types</span>
                </div>
              </div>
            </div>

            <div class="grid sm:grid-cols-2 gap-4 sm:gap-6">
              <div class="border-l-2 border-kage-200 pl-4 sm:pl-6">
                <h3 class="font-semibold text-kage-800 mb-2 text-sm">Authentication</h3>
                <p class="text-kage-500 text-sm leading-relaxed">
                  The API server is designed for local agent use. Requests are authenticated 
                  via the agent's keypair loaded at startup.
                </p>
              </div>
              <div class="border-l-2 border-accent-400 pl-4 sm:pl-6">
                <h3 class="font-semibold text-kage-800 mb-2 text-sm">Content Type</h3>
                <p class="text-kage-500 text-sm leading-relaxed">
                  All POST endpoints accept <code class="text-xs bg-kage-100 px-1.5 py-0.5 rounded">application/json</code> 
                  request bodies and return JSON responses.
                </p>
              </div>
            </div>
          </article>

          <!-- API Section Pages -->
          <article v-if="activeApiSection" class="prose-custom">
            <div class="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              <span class="text-3xl sm:text-5xl font-japanese text-kage-200">{{ activeApiSection.label }}</span>
              <h1 class="text-2xl sm:text-4xl font-display font-bold text-kage-900">{{ activeApiSection.title }}</h1>
            </div>

            <p class="text-base sm:text-lg text-kage-600 mb-8 sm:mb-10 leading-relaxed">
              {{ activeApiSection.description }}
            </p>

            <div class="space-y-4">
              <div 
                v-for="endpoint in activeApiSection.endpoints" 
                :key="endpoint.id"
                class="border border-kage-200 rounded-lg bg-white overflow-hidden"
              >
                <!-- Endpoint header -->
                <button 
                  @click="toggleEndpoint(endpoint.id)"
                  class="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 text-left hover:bg-kage-50/50 transition-colors"
                >
                  <span 
                    class="flex-shrink-0 px-2 py-0.5 rounded text-xs font-bold font-mono tracking-wide"
                    :class="endpoint.method === 'GET' 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-blue-100 text-blue-700'"
                  >
                    {{ endpoint.method }}
                  </span>
                  <code class="text-sm text-kage-800 font-mono truncate">{{ endpoint.path }}</code>
                  <svg 
                    class="w-4 h-4 text-kage-400 ml-auto flex-shrink-0 transition-transform duration-200"
                    :class="isExpanded(endpoint.id) ? 'rotate-180' : ''"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <!-- Expanded content -->
                <div v-show="isExpanded(endpoint.id)" class="border-t border-kage-100">
                  <div class="px-4 sm:px-6 py-4 sm:py-5 space-y-5">
                    <p class="text-sm text-kage-600 leading-relaxed">{{ endpoint.description }}</p>

                    <!-- Request body -->
                    <div v-if="endpoint.body && Object.keys(endpoint.body).length">
                      <h4 class="text-xs font-semibold text-kage-800 uppercase tracking-wide mb-3">Request Body</h4>
                      <div class="bg-kage-50 rounded-lg overflow-hidden">
                        <table class="w-full text-sm">
                          <thead>
                            <tr class="border-b border-kage-200">
                              <th class="text-left px-4 py-2 text-xs font-semibold text-kage-500 uppercase tracking-wide">Field</th>
                              <th class="text-left px-4 py-2 text-xs font-semibold text-kage-500 uppercase tracking-wide">Type / Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr 
                              v-for="(desc, field) in endpoint.body" 
                              :key="field"
                              class="border-b border-kage-100 last:border-0"
                            >
                              <td class="px-4 py-2.5 align-top">
                                <code class="text-xs text-accent-600 font-mono">{{ field }}</code>
                              </td>
                              <td class="px-4 py-2.5 text-xs text-kage-600">{{ desc }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <!-- Query params -->
                    <div v-if="endpoint.query">
                      <h4 class="text-xs font-semibold text-kage-800 uppercase tracking-wide mb-3">Query Parameters</h4>
                      <div class="bg-kage-50 rounded-lg overflow-hidden">
                        <table class="w-full text-sm">
                          <thead>
                            <tr class="border-b border-kage-200">
                              <th class="text-left px-4 py-2 text-xs font-semibold text-kage-500 uppercase tracking-wide">Param</th>
                              <th class="text-left px-4 py-2 text-xs font-semibold text-kage-500 uppercase tracking-wide">Type / Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr 
                              v-for="(desc, param) in endpoint.query" 
                              :key="param"
                              class="border-b border-kage-100 last:border-0"
                            >
                              <td class="px-4 py-2.5 align-top">
                                <code class="text-xs text-accent-600 font-mono">{{ param }}</code>
                              </td>
                              <td class="px-4 py-2.5 text-xs text-kage-600">{{ desc }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <!-- Response -->
                    <div v-if="endpoint.response">
                      <h4 class="text-xs font-semibold text-kage-800 uppercase tracking-wide mb-3">Response</h4>
                      <div class="bg-kage-900 rounded-lg p-4 overflow-x-auto">
                        <pre class="text-xs sm:text-sm text-kage-100 font-mono leading-relaxed">{{ endpoint.response }}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <!-- WebSocket -->
          <article v-if="activeSection === 'websocket'" class="prose-custom">
            <div class="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              <span class="text-3xl sm:text-5xl font-japanese text-kage-200">繋</span>
              <h1 class="text-2xl sm:text-4xl font-display font-bold text-kage-900">WebSocket</h1>
            </div>

            <p class="text-base sm:text-lg text-kage-600 mb-6 sm:mb-8 leading-relaxed">
              Real-time bidirectional communication with the agent via WebSocket. 
              All REST API operations are also available as WebSocket message types.
            </p>

            <div class="border border-kage-200 rounded-lg p-4 sm:p-6 mb-8 bg-white">
              <h3 class="text-xs font-semibold text-kage-800 uppercase tracking-wide mb-3">Connection URL</h3>
              <div class="bg-kage-900 rounded-lg px-4 py-3 font-mono text-sm text-kage-100">
                {{ wsBaseUrl }}
              </div>
            </div>

            <div class="border border-kage-200 rounded-lg p-4 sm:p-6 mb-8 bg-white">
              <h3 class="text-xs font-semibold text-kage-800 uppercase tracking-wide mb-4">Message Format</h3>
              <div class="bg-kage-900 rounded-lg p-4 overflow-x-auto">
                <pre class="text-xs sm:text-sm text-kage-100 font-mono leading-relaxed">{
  "type": "message_type",
  "key": "value",
  ...
}</pre>
              </div>
            </div>

            <h3 class="text-lg font-semibold text-kage-800 mb-4">Message Types</h3>

            <div class="border border-kage-200 rounded-lg bg-white overflow-hidden">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-kage-200 bg-kage-50">
                    <th class="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-kage-500 uppercase tracking-wide">Type</th>
                    <th class="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-kage-500 uppercase tracking-wide">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="msg in wsMessageTypes" 
                    :key="msg.type"
                    class="border-b border-kage-50 last:border-0 hover:bg-kage-50/50 transition-colors"
                  >
                    <td class="px-4 sm:px-6 py-3 align-top">
                      <code class="text-xs text-accent-600 font-mono whitespace-nowrap">{{ msg.type }}</code>
                    </td>
                    <td class="px-4 sm:px-6 py-3 text-sm text-kage-600">{{ msg.description }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-8 border border-kage-200 rounded-lg p-4 sm:p-6 bg-white">
              <h3 class="text-xs font-semibold text-kage-800 uppercase tracking-wide mb-4">Example: Chat Message</h3>
              <div class="space-y-4">
                <div>
                  <span class="text-xs text-kage-500 uppercase tracking-wide font-semibold">Send</span>
                  <div class="bg-kage-900 rounded-lg p-4 mt-2 overflow-x-auto">
                    <pre class="text-xs sm:text-sm text-kage-100 font-mono leading-relaxed">{
  "type": "chat",
  "message": "Remember my API key is sk-secret-123"
}</pre>
                  </div>
                </div>
                <div>
                  <span class="text-xs text-kage-500 uppercase tracking-wide font-semibold">Receive</span>
                  <div class="bg-kage-900 rounded-lg p-4 mt-2 overflow-x-auto">
                    <pre class="text-xs sm:text-sm text-kage-100 font-mono leading-relaxed">{
  "type": "message",
  "text": "I've securely stored your API key.",
  "proof": {
    "cid": "Qm...",
    "txSignature": "5K7x...",
    "explorerUrl": "https://explorer.solana.com/tx/..."
  }
}</pre>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-8 border border-kage-200 rounded-lg p-4 sm:p-6 bg-white">
              <h3 class="text-xs font-semibold text-kage-800 uppercase tracking-wide mb-4">Example: Shielded Payment</h3>
              <div class="bg-kage-900 rounded-lg p-4 overflow-x-auto">
                <pre class="text-xs sm:text-sm text-kage-100 font-mono leading-relaxed">{
  "type": "shielded_pay",
  "recipientPubkey": "GkXn...",
  "recipientViewingPub": "Ax7f...",
  "amountLamports": 50000000,
  "memo": "Payment for data analysis"
}</pre>
              </div>
            </div>

            <div class="mt-8 border border-kage-200 rounded-lg p-4 sm:p-6 bg-white">
              <h3 class="text-xs font-semibold text-kage-800 uppercase tracking-wide mb-4">Example: Task Delegation</h3>
              <div class="bg-kage-900 rounded-lg p-4 overflow-x-auto">
                <pre class="text-xs sm:text-sm text-kage-100 font-mono leading-relaxed">{
  "type": "delegate",
  "to": "executor-agent-pubkey",
  "instruction": "Analyze token price trends for SOL",
  "budget": 100000000
}</pre>
              </div>
            </div>
          </article>
        </main>
      </div>
    </div>
  </div>
</template>
