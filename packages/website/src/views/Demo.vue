<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { RouterLink } from 'vue-router';

const WS_URL = import.meta.env.VITE_API_WS_URL || 'ws://localhost:3002';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

type ActiveTab = 'chat' | 'delegation' | 'messaging' | 'groups' | 'payments' | 'did' | 'reputation' | 'teams' | 'zk';

interface StoreProof {
  cid?: string;
  txSignature?: string;
  explorerUrl?: string;
  umbraProof?: string;
  taskId?: string;
  delegatedTo?: string;
}

interface ReasoningProof {
  traceId: string;
  charCount: number;
  contentHash: string;
  txSignature?: string;
  explorerUrl?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  time: string;
  proof?: StoreProof | null;
  reasoning?: ReasoningProof | null;
}

interface Memory {
  index: number;
  id: string;
  type: string;
  time: string;
}

interface DelegationTaskUI {
  taskId: string;
  from: string;
  to: string;
  status: string;
  txSignature?: string;
  explorerUrl?: string;
  createdAt: number;
}

const activeTab = ref<ActiveTab>('chat');
const messages = ref<ChatMessage[]>([]);
const input = ref('');
const isConnected = ref(false);
const isTyping = ref(false);
const agentId = ref('');
const llmProvider = ref(''); // e.g. "claude / claude-haiku-4-5"
const memories = ref<Memory[]>([]);
const showMemories = ref(false);
const messagesEl = ref<HTMLElement | null>(null);
const mobileMenuOpen = ref(false);

// Delegation state
const delegTasks = ref<DelegationTaskUI[]>([]);
const delegRecipient = ref('');
const delegInstruction = ref('');
const isDelegating = ref(false);

// Group Vault state
interface GroupUI {
  groupId: string;
  creator: string;
  threshold: number;
  totalMembers: number;
  entryCount: number;
  hasKey: boolean;
  explorerUrl?: string;
  createdAt: string;
}
interface GroupMemberInput {
  solanaPubkey: string;
  x25519Pubkey: string;
}
const groups = ref<GroupUI[]>([]);
const groupMembers = ref<GroupMemberInput[]>([
  { solanaPubkey: '', x25519Pubkey: '' },
  { solanaPubkey: '', x25519Pubkey: '' },
]);
const groupThreshold = ref(2);
const isCreatingGroup = ref(false);
const activeGroupId = ref('');
const groupContent = ref('');
const isStoringEntry = ref(false);
const groupEntries = ref<unknown[]>([]);
const lastCreatedGroup = ref<unknown>(null);

// Messaging state
interface InboxMessage {
  messageId: string;
  from: string;
  sentAt: string;
  read: boolean;
  explorerUrl?: string;
}
const agentX25519Pub = ref('');
const msgRecipientPubkey = ref('');
const msgRecipientX25519 = ref('');
const msgText = ref('');
const isSendingMsg = ref(false);
const inbox = ref<InboxMessage[]>([]);
const sentMessages = ref<{ messageId: string; to: string; explorerUrl?: string }[]>([]);

// Reputation state
interface RepEvent {
  eventId: string;
  type: string;
  outcome: string;
  delta: number;
  description: string;
  txSignature?: string;
  explorerUrl?: string;
  timestamp: number;
}
interface AgentRep {
  agentDID: string;
  score: number;
  tier: string;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  slashCount: number;
  events: RepEvent[];
  lastUpdated: number;
  lastTxSignature?: string;
}
const selfRep = ref<AgentRep | null>(null);
const repSuccessRate = ref(0);
const repLeaderboard = ref<AgentRep[]>([]);
const isLoadingRep = ref(false);
const repTaskOutcome = ref<'success' | 'partial' | 'failure'>('success');
const repTaskDesc = ref('');
const isRecordingTask = ref(false);
const repSlashReason = ref('');
const isSlashing = ref(false);
const lastRepSnapshot = ref<{ score: number; tier: string; explorerUrl?: string } | null>(null);
const isCommittingSnapshot = ref(false);

// DID state
interface DIDDocument {
  id: string;
  controller: string;
  verificationMethod: { id: string; type: string; publicKeyBase58?: string; publicKeyMultibase?: string }[];
  service: { id: string; type: string; serviceEndpoint: string }[];
  created: string;
  updated: string;
  kage: { agentType: string; capabilities: string[]; x25519ViewingPub: string; reasoningEnabled: boolean; network: string };
}
interface DIDCredential {
  credentialId: string;
  issuer: string;
  subject: string;
  type: string;
  claim: Record<string, unknown>;
  claimHash: string;
  signature: string;
  txSignature?: string;
  explorerUrl?: string;
  issuedAt: number;
  expiresAt?: number;
}
const selfDID = ref('');
const didDocument = ref<DIDDocument | null>(null);
const didCredentials = ref<DIDCredential[]>([]);
const isLoadingDID = ref(false);
const credSubjectDID = ref('');
const credType = ref('AgentCapability');
const credClaim = ref('{"capability":"trading-analysis","level":"trusted"}');
const isIssuingCred = ref(false);
const lastIssuedCred = ref<DIDCredential | null>(null);
const verifyCredJson = ref('');
const verifyResult = ref<{ valid: boolean; reason?: string } | null>(null);

// Team Vault state
interface TeamMemberUI {
  publicKey: string;
  x25519PublicKey: string;
  role: 'owner' | 'admin' | 'member';
  displayName?: string;
  addedAt: number;
  addedBy: string;
}
interface TeamSecretUI {
  id: string;
  label: string;
  description?: string;
  createdBy: string;
  createdAt: number;
  onChainTx?: string;
  explorerUrl?: string;
}
interface TeamEventUI {
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  timestamp: number;
  onChainTx?: string;
}
interface TeamUI {
  id: string;
  name: string;
  description?: string;
  threshold: number;
  members: TeamMemberUI[];
  secrets: TeamSecretUI[];
  eventLog: TeamEventUI[];
  createdBy: string;
  createdAt: number;
  onChainTx?: string;
  explorerUrl?: string;
}
const teams = ref<TeamUI[]>([]);
const selectedTeam = ref<TeamUI | null>(null);
const isCreatingTeam = ref(false);
const isStoringSecret = ref(false);
const teamName = ref('');
const teamDescription = ref('');
const teamThreshold = ref(1);
const secretLabel = ref('');
const secretDescription = ref('');
const secretData = ref('');
const retrievedSecret = ref<{ label: string; data: unknown } | null>(null);
const agentX25519ForTeams = ref('');
const lastTeamTx = ref('');

// ZK State
interface ZKCommitmentUI {
  id: string;
  proofType: string;
  agentDID: string;
  inputHash: string;
  outputHash: string;
  publicOutputs: Record<string, unknown>;
  status: string;
  txSignature?: string;
  vkey?: string;
  proofRequestId?: string;
  explorerUrl?: string;
  createdAt: number;
  provedAt?: number;
}

interface ProofRecordUI {
  proof_id: string;
  proof_type: string;
  status: string;
  mode: string;
  vkey: string | null;
  public_outputs: Record<string, unknown> | null;
  groth16_proof: string | null;
  sp1_public_inputs: string | null;
  error: string | null;
  explorer_url: string | null;
  created_at: number;
  completed_at: number | null;
}

interface OnChainVerificationUI {
  txSignature: string;
  verificationPda: string;
  proofType: string;
  vkeyHash: string;
}

const zkCommitments = ref<ZKCommitmentUI[]>([]);
const zkCommitType = ref<'reputation' | 'memory' | 'task'>('reputation');
const isCreatingCommitment = ref(false);
const zkVerifyResult = ref<{ valid: boolean; reason?: string } | null>(null);
const isProvingCommitment = ref<string | null>(null);
const isVerifyingOnChain = ref<string | null>(null);
const onChainVerifications = ref<Record<string, OnChainVerificationUI>>({});
const proofStatusMap = ref<Record<string, ProofRecordUI>>({});
const proverServiceAvailable = ref(false);
const proverServiceMode = ref('');

const zkRepEvents = ref([
  { eventType: 'task_complete', delta: 25, timestamp: Date.now() },
]);
const zkRepScore = ref(125);

const zkMemCiphertextHash = ref('');
const zkMemType = ref<'episodic' | 'semantic' | 'procedural'>('episodic');

const zkTaskId = ref('');
const zkTaskOutcome = ref<'success' | 'partial' | 'failure'>('success');

async function fetchZKCommitments() {
  try {
    const res = await fetch(`${API_URL}/zk/commitments`);
    const data = await res.json();
    zkCommitments.value = data.commitments ?? [];
  } catch (err) {
    console.error('Failed to fetch ZK commitments:', err);
  }
}

async function createZKCommitment() {
  isCreatingCommitment.value = true;
  try {
    let url = '';
    let body: Record<string, unknown> = {};

    if (zkCommitType.value === 'reputation') {
      url = `${API_URL}/zk/commit/reputation`;
      body = {
        agentDID: agentId.value ? `did:sol:${agentId.value}` : 'did:sol:demo',
        events: zkRepEvents.value,
        claimedScore: zkRepScore.value,
      };
    } else if (zkCommitType.value === 'memory') {
      url = `${API_URL}/zk/commit/memory`;
      body = {
        agentDID: agentId.value ? `did:sol:${agentId.value}` : 'did:sol:demo',
        ciphertextHash: zkMemCiphertextHash.value || 'a'.repeat(64),
        storedAt: Date.now(),
        memoryType: zkMemType.value,
      };
    } else {
      url = `${API_URL}/zk/commit/task`;
      body = {
        agentDID: agentId.value ? `did:sol:${agentId.value}` : 'did:sol:demo',
        taskId: zkTaskId.value || `task-${Date.now()}`,
        instructionHash: 'a'.repeat(64),
        resultHash: 'b'.repeat(64),
        outcome: zkTaskOutcome.value,
        executorDID: agentId.value ? `did:sol:${agentId.value}` : 'did:sol:demo',
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.commitment) {
      zkCommitments.value.unshift(data.commitment);
    }
  } catch (err) {
    console.error('ZK commit failed:', err);
  } finally {
    isCreatingCommitment.value = false;
  }
}

async function verifyZKCommitment(id: string) {
  try {
    const res = await fetch(`${API_URL}/zk/verify/${id}`, { method: 'POST' });
    zkVerifyResult.value = await res.json();
  } catch (err) {
    console.error('ZK verify failed:', err);
  }
}

async function checkProverHealth() {
  try {
    const res = await fetch(`${API_URL}/zk/prover/health`);
    const data = await res.json();
    proverServiceAvailable.value = data.available ?? false;
    proverServiceMode.value = data.mode ?? '';
  } catch {
    proverServiceAvailable.value = false;
  }
}

async function requestProof(commitmentId: string) {
  isProvingCommitment.value = commitmentId;
  try {
    const res = await fetch(`${API_URL}/zk/prove/${commitmentId}`, { method: 'POST' });
    const data = await res.json();
    if (data.proof) {
      proofStatusMap.value[commitmentId] = data.proof;
    }
    if (data.commitment) {
      const idx = zkCommitments.value.findIndex(c => c.id === commitmentId);
      if (idx >= 0) zkCommitments.value[idx] = data.commitment;
    }
    pollProofStatus(commitmentId);
  } catch (err) {
    console.error('Proof request failed:', err);
    isProvingCommitment.value = null;
  }
}

async function pollProofStatus(commitmentId: string) {
  const maxAttempts = 60;
  let interval = 2000;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, interval));
    try {
      const res = await fetch(`${API_URL}/zk/prove/${commitmentId}/status`);
      const data = await res.json();
      if (data.proof) {
        proofStatusMap.value[commitmentId] = data.proof;
      }
      if (data.commitment) {
        const idx = zkCommitments.value.findIndex(c => c.id === commitmentId);
        if (idx >= 0) zkCommitments.value[idx] = data.commitment;
      }
      if (data.proof?.status === 'completed' || data.proof?.status === 'failed') {
        break;
      }
    } catch {
      break;
    }
    interval = Math.min(interval * 1.3, 10000);
  }
  isProvingCommitment.value = null;
}

async function verifyOnChain(commitmentId: string) {
  isVerifyingOnChain.value = commitmentId;
  try {
    const res = await fetch(`${API_URL}/zk/verify-onchain/${commitmentId}`, { method: 'POST' });
    const data = await res.json();
    if (data.success && data.verification) {
      onChainVerifications.value[commitmentId] = data.verification;
      const idx = zkCommitments.value.findIndex(c => c.id === commitmentId);
      if (idx >= 0 && data.commitment) zkCommitments.value[idx] = data.commitment;
    } else {
      console.error('On-chain verification failed:', data.error);
    }
  } catch (err) {
    console.error('On-chain verification error:', err);
  } finally {
    isVerifyingOnChain.value = null;
  }
}

// Deep Think & reasoning step state
const deepThinkEnabled = ref(false);
const liveReasoningSteps = ref<string[]>([]);

let ws: WebSocket | null = null;

function now() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  });
}

function connect() {
  if (ws) ws.close();

  messages.value = [];
  isConnected.value = false;
  agentId.value = '';

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    isConnected.value = true;
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'connected') {
      agentId.value = msg.agentId;
      deepThinkEnabled.value = msg.deepThink ?? false;
      messages.value.push({
        role: 'system',
        text: `Agent connected. ID: ${msg.agentId.slice(0, 12)}…`,
        time: now(),
      });
      scrollToBottom();
    } else if (msg.type === 'typing') {
      liveReasoningSteps.value = [];
      isTyping.value = true;
      scrollToBottom();
    } else if (msg.type === 'reasoning_step') {
      liveReasoningSteps.value.push(msg.content);
      scrollToBottom();
    } else if (msg.type === 'deep_think_status') {
      deepThinkEnabled.value = msg.enabled;
    } else if (msg.type === 'message') {
      isTyping.value = false;
      liveReasoningSteps.value = [];
      messages.value.push({
        role: 'assistant',
        text: msg.text,
        time: now(),
        proof: msg.proof ?? null,
        reasoning: msg.reasoning ?? null,
      });
      scrollToBottom();
    } else if (msg.type === 'memories') {
      memories.value = msg.memories;
      showMemories.value = true;
    } else if (msg.type === 'task_created') {
      isDelegating.value = false;
      delegTasks.value.unshift(msg.task as DelegationTaskUI);
    } else if (msg.type === 'group_created') {
      isCreatingGroup.value = false;
      lastCreatedGroup.value = msg.group;
      activeGroupId.value = msg.group.groupId;
      fetchGroups();
    } else if (msg.type === 'group_entry_stored') {
      isStoringEntry.value = false;
      groupContent.value = '';
      fetchGroups();
      if (activeGroupId.value) sendReadEntries(activeGroupId.value);
    } else if (msg.type === 'group_entries') {
      groupEntries.value = msg.entries ?? [];
    } else if (msg.type === 'message_sent') {
      isSendingMsg.value = false;
      sentMessages.value.unshift(msg.message);
      msgText.value = '';
    } else if (msg.type === 'message_received') {
      fetchInbox();
    } else if (msg.type === 'payment_sent') {
      isSendingPayment.value = false;
      lastPayment.value = msg.payment;
      payAmount.value = '';
      payMemo.value = '';
      fetchPayments();
    } else if (msg.type === 'scan_results') {
      isScanning.value = false;
      fetchPayments();
    } else if (msg.type === 'reputation') {
      selfRep.value = msg.reputation;
      repSuccessRate.value = msg.successRate ?? 0;
      repLeaderboard.value = msg.leaderboard ?? [];
      isLoadingRep.value = false;
    } else if (msg.type === 'reputation_updated') {
      selfRep.value = msg.reputation;
      isRecordingTask.value = false;
      isSlashing.value = false;
      repTaskDesc.value = '';
      repSlashReason.value = '';
    } else if (msg.type === 'reputation_snapshot') {
      isCommittingSnapshot.value = false;
      lastRepSnapshot.value = msg.snapshot ?? null;
      fetchReputation();
    } else if (msg.type === 'did_document') {
      selfDID.value = msg.did ?? '';
      didDocument.value = msg.document ?? null;
      isLoadingDID.value = false;
    } else if (msg.type === 'credential_issued') {
      isIssuingCred.value = false;
      lastIssuedCred.value = msg.credential;
      fetchDIDCredentials();
    } else if (msg.type === 'credential_verified') {
      verifyResult.value = { valid: msg.valid, reason: msg.reason };
    } else if (msg.type === 'credentials_list') {
      didCredentials.value = msg.credentials ?? [];
    } else if (msg.type === 'team_list') {
      teams.value = msg.teams ?? [];
    } else if (msg.type === 'team_created') {
      isCreatingTeam.value = false;
      teams.value.push(msg.team);
      selectedTeam.value = msg.team;
      lastTeamTx.value = msg.team.onChainTx ?? '';
      teamName.value = '';
      teamDescription.value = '';
    } else if (msg.type === 'team_updated') {
      const idx = teams.value.findIndex(t => t.id === msg.team.id);
      if (idx >= 0) teams.value[idx] = msg.team;
      if (selectedTeam.value?.id === msg.team.id) selectedTeam.value = msg.team;
    } else if (msg.type === 'team_secret_stored') {
      isStoringSecret.value = false;
      secretLabel.value = '';
      secretDescription.value = '';
      secretData.value = '';
      lastTeamTx.value = msg.secret.onChainTx ?? '';
      if (selectedTeam.value) {
        if (!selectedTeam.value.secrets) selectedTeam.value.secrets = [];
        selectedTeam.value.secrets.push(msg.secret);
      }
    } else if (msg.type === 'team_secret_retrieved') {
      retrievedSecret.value = { label: msg.label, data: msg.data };
    } else if (msg.type === 'error') {
      isSendingPayment.value = false;
      isScanning.value = false;
      isDelegating.value = false;
      isSendingMsg.value = false;
      isIssuingCred.value = false;
      isCreatingTeam.value = false;
      isStoringSecret.value = false;
      isTyping.value = false;
      messages.value.push({
        role: 'system',
        text: `Error: ${msg.message}`,
        time: now(),
      });
      scrollToBottom();
    }
  };

  ws.onclose = () => {
    isConnected.value = false;
    agentId.value = '';
    messages.value.push({
      role: 'system',
      text: 'Connection closed.',
      time: now(),
    });
    scrollToBottom();
  };

  ws.onerror = () => {
    messages.value.push({
      role: 'system',
      text: 'Could not connect to Kage agent. Make sure the API server is running.',
      time: now(),
    });
    scrollToBottom();
  };
}

function fetchReputation() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  isLoadingRep.value = true;
  ws.send(JSON.stringify({ type: 'rep_get' }));
}

function recordTask() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  isRecordingTask.value = true;
  ws.send(JSON.stringify({
    type: 'rep_record_task',
    outcome: repTaskOutcome.value,
    description: repTaskDesc.value || undefined,
  }));
}

function slashSelf() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !repSlashReason.value.trim()) return;
  isSlashing.value = true;
  ws.send(JSON.stringify({ type: 'rep_slash', reason: repSlashReason.value }));
}

function commitSnapshot() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  isCommittingSnapshot.value = true;
  ws.send(JSON.stringify({ type: 'rep_snapshot' }));
}

function tierColor(tier: string) {
  return {
    elite: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    verified: 'text-violet-600 bg-violet-50 border-violet-200',
    trusted: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    newcomer: 'text-blue-600 bg-blue-50 border-blue-200',
    unknown: 'text-stone-500 bg-stone-50 border-stone-200',
  }[tier] ?? 'text-stone-500 bg-stone-50 border-stone-200';
}

function scoreBarWidth(score: number) {
  return Math.min(100, Math.max(0, score / 10)) + '%';
}

// ─── Tab context info ────────────────────────────────────────────────────────

const tabInfo: Record<string, { name: string; description: string; badges: string[] }> = {
  chat: {
    name: 'Memory Vault',
    description: 'Chat with the agent and ask it to remember facts. Every memory is AES-256-GCM encrypted on-device before leaving your browser, then anchored on Solana.',
    badges: ['AES-256-GCM', 'Solana PDA', 'Viewing Key'],
  },
  delegation: {
    name: 'Task Delegation',
    description: 'Delegate tasks to other agents over an encrypted channel. The task payload is never exposed on-chain — only a SHA-256 commitment is written to Solana Memo.',
    badges: ['X25519 DH', 'Solana Memo', 'Encrypted payload'],
  },
  messaging: {
    name: 'Encrypted Messaging',
    description: 'Send end-to-end encrypted messages to any agent using their X25519 public key. Messages are AES-256-GCM encrypted via Diffie-Hellman key agreement.',
    badges: ['X25519 DH', 'AES-256-GCM', 'Solana Memo'],
  },
  groups: {
    name: 'Group Vaults',
    description: 'Create m-of-n threshold vaults where any m members can reconstruct the group key and decrypt shared secrets. Built on Shamir\'s Secret Sharing over GF(256).',
    badges: ['Shamir SSS', 'GF(256)', 'AES-256-GCM'],
  },
  teams: {
    name: 'Team Vaults',
    description: 'Role-based (owner / admin / member) team secret management built on top of Group Vaults. Invite members, store named secrets, and audit every event on-chain.',
    badges: ['Role-based', 'Shamir SSS', 'On-chain audit'],
  },
  payments: {
    name: 'Shielded Payments',
    description: 'Send SOL to a one-time stealth address derived from the recipient\'s viewing key. The on-chain link between sender and recipient\'s identity is broken.',
    badges: ['Stealth address', 'X25519 DH', 'Umbra-style'],
  },
  did: {
    name: 'Decentralized Identity',
    description: 'Each agent has a W3C-compatible did:sol:<pubkey> document. Agents can issue and verify signed Verifiable Credentials committed on-chain.',
    badges: ['W3C DID', 'Ed25519', 'Verifiable Credentials'],
  },
  reputation: {
    name: 'Reputation System',
    description: 'On-chain reputation scoring (0–1000) across four tiers: Newcomer → Trusted → Verified → Elite. Every task outcome and slash event is written to Solana Memo.',
    badges: ['0–1000 score', 'Solana Memo', 'Tamper-proof'],
  },
  zk: {
    name: 'ZK Proofs',
    description: 'Create and verify zero-knowledge commitments for reputation, memory integrity, and task completion. Groth16 proofs are generated via Succinct Network and verified on-chain by the Kage Solana program.',
    badges: ['SP1 zkVM', 'Groth16', 'On-chain verifier', 'Zero-knowledge'],
  },
};

// ─── Team Vault functions ───────────────────────────────────────────────────

function fetchTeams() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'team_list' }));
}

function createTeam() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !teamName.value.trim()) return;
  isCreatingTeam.value = true;
  ws.send(JSON.stringify({
    type: 'team_create',
    name: teamName.value.trim(),
    description: teamDescription.value.trim() || undefined,
    threshold: teamThreshold.value,
  }));
}

function selectTeam(team: TeamUI) {
  selectedTeam.value = team;
  retrievedSecret.value = null;
}

function storeSecret() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !selectedTeam.value || !secretLabel.value.trim()) return;
  isStoringSecret.value = true;
  let data: unknown;
  try {
    data = JSON.parse(secretData.value);
  } catch {
    data = secretData.value;
  }
  ws.send(JSON.stringify({
    type: 'team_store_secret',
    teamId: selectedTeam.value.id,
    label: secretLabel.value.trim(),
    description: secretDescription.value.trim() || undefined,
    data,
  }));
}

function retrieveSecret(secretId: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !selectedTeam.value) return;
  retrievedSecret.value = null;
  ws.send(JSON.stringify({ type: 'team_retrieve_secret', teamId: selectedTeam.value.id, secretId }));
}

function roleLabel(role: string) {
  return { owner: 'Owner', admin: 'Admin', member: 'Member' }[role] ?? role;
}

function roleBadge(role: string) {
  return {
    owner: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    admin: 'bg-violet-100 text-violet-800 border border-violet-200',
    member: 'bg-stone-100 text-stone-600 border border-stone-200',
  }[role] ?? 'bg-stone-100 text-stone-600';
}

function fetchDID() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  isLoadingDID.value = true;
  ws.send(JSON.stringify({ type: 'did_get' }));
}

function fetchDIDCredentials() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'did_list_credentials' }));
}

function issueCredential() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  let claim: Record<string, unknown>;
  try {
    claim = JSON.parse(credClaim.value);
  } catch {
    alert('Claim JSON geçersiz');
    return;
  }
  isIssuingCred.value = true;
  lastIssuedCred.value = null;
  ws.send(JSON.stringify({
    type: 'did_issue_credential',
    subjectDID: credSubjectDID.value || selfDID.value,
    credType: credType.value,
    claim,
  }));
}

function verifyCred() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const credential = JSON.parse(verifyCredJson.value);
    verifyResult.value = null;
    ws.send(JSON.stringify({ type: 'did_verify_credential', credential }));
  } catch {
    alert('Credential JSON geçersiz');
  }
}

function fillLastCredForVerify() {
  if (lastIssuedCred.value) {
    verifyCredJson.value = JSON.stringify(lastIssuedCred.value, null, 2);
  }
}

function toggleDeepThink() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const next = !deepThinkEnabled.value;
  ws.send(JSON.stringify({ type: 'toggle_deep_think', enabled: next }));
  deepThinkEnabled.value = next;
}

function send() {
  if (!input.value.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

  const text = input.value.trim();

  if (text === '/memories') {
    ws.send(JSON.stringify({ type: 'chat', text }));
    input.value = '';
    return;
  }

  messages.value.push({
    role: 'user',
    text,
    time: now(),
  });
  scrollToBottom();

  ws.send(JSON.stringify({ type: 'chat', text }));
  input.value = '';
}

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

const suggestions = [
  'Store my trading strategy: buy BTC below $60k',
  'Remember that I prefer dark mode in apps',
  'Remember my risk tolerance is medium',
  '/memories',
];

async function fetchMemories() {
  showMemories.value = true;
  try {
    const res = await fetch(`${API_URL}/memories`);
    const data = await res.json();
    memories.value = data.memories || [];
  } catch {
    memories.value = [];
  }
}

function useSuggestion(s: string) {
  input.value = s;
  send();
}

async function fetchTasks() {
  try {
    const res = await fetch(`${API_URL}/tasks`);
    const data = await res.json();
    delegTasks.value = data.tasks || [];
  } catch {
    delegTasks.value = [];
  }
}

function sendDelegate() {
  if (!delegRecipient.value.trim() || !delegInstruction.value.trim()) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  isDelegating.value = true;
  ws.send(JSON.stringify({
    type: 'delegate',
    recipientPubkey: delegRecipient.value.trim(),
    instruction: delegInstruction.value.trim(),
  }));
}

async function fetchGroups() {
  try {
    const res = await fetch(`${API_URL}/groups`);
    const data = await res.json();
    groups.value = data.groups ?? [];
  } catch {
    groups.value = [];
  }
}

function addMember() {
  groupMembers.value.push({ solanaPubkey: '', x25519Pubkey: '' });
}

function removeMember(idx: number) {
  if (groupMembers.value.length > 2) groupMembers.value.splice(idx, 1);
}

function sendCreateGroup() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const validMembers = groupMembers.value.filter(m => m.solanaPubkey.trim() && m.x25519Pubkey.trim());
  if (validMembers.length < 2) return;
  if (groupThreshold.value < 1 || groupThreshold.value > validMembers.length) return;
  isCreatingGroup.value = true;
  ws.send(JSON.stringify({
    type: 'group_create',
    members: validMembers.map(m => ({ solanaPubkey: m.solanaPubkey.trim(), x25519Pubkey: m.x25519Pubkey.trim() })),
    threshold: groupThreshold.value,
  }));
}

function sendStoreEntry() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !activeGroupId.value || !groupContent.value.trim()) return;
  isStoringEntry.value = true;
  ws.send(JSON.stringify({ type: 'group_store', groupId: activeGroupId.value, content: groupContent.value.trim() }));
}

function sendReadEntries(groupId: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'group_read', groupId }));
}

function fillSelfAsMember() {
  if (!agentId.value || !agentX25519Pub.value) return;
  groupMembers.value[0] = { solanaPubkey: agentId.value, x25519Pubkey: agentX25519Pub.value };
}

async function fetchAgentX25519() {
  try {
    const res = await fetch(`${API_URL}/agent/x25519`);
    const data = await res.json();
    agentX25519Pub.value = data.x25519PublicKey ?? '';
  } catch {
    agentX25519Pub.value = '';
  }
}

async function fetchLLMInfo() {
  try {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    if (data.llm) {
      llmProvider.value = `${data.llm.provider} / ${data.llm.model}`;
    }
  } catch { /* ignore */ }
}

async function fetchInbox() {
  try {
    const res = await fetch(`${API_URL}/inbox`);
    const data = await res.json();
    inbox.value = data.messages ?? [];
  } catch {
    inbox.value = [];
  }
}

function sendEncryptedMessage() {
  if (!msgRecipientPubkey.value.trim() || !msgRecipientX25519.value.trim() || !msgText.value.trim()) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  isSendingMsg.value = true;
  ws.send(JSON.stringify({
    type: 'send_message',
    recipientPubkey: msgRecipientPubkey.value.trim(),
    recipientX25519Pub: msgRecipientX25519.value.trim(),
    text: msgText.value.trim(),
  }));
}

// ─── Payment state ────────────────────────────────────────────────────────────
interface PaymentUI {
  paymentId: string;
  direction: 'sent' | 'received';
  stealthAddress: string;
  amountLamports: number;
  amountSol: string;
  explorerUrl?: string;
  createdAt: string;
}

const payViewingKey = ref('');
const payRecipientSolana = ref('');
const payRecipientViewing = ref('');
const payAmount = ref('');
const payMemo = ref('');
const isSendingPayment = ref(false);
const isScanning = ref(false);
const payments = ref<PaymentUI[]>([]);
const lastPayment = ref<{ stealthAddress: string; ephemeralPub: string; explorerUrl?: string } | null>(null);

async function fetchPayments() {
  try {
    const res = await fetch(`${API_URL}/payments`);
    const data = await res.json();
    payViewingKey.value = data.viewingPublicKey ?? '';
    payments.value = data.payments ?? [];
  } catch {
    payments.value = [];
  }
}

function sendShieldedPay() {
  if (!payRecipientSolana.value.trim() || !payRecipientViewing.value.trim() || !payAmount.value) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const lamports = Math.round(parseFloat(payAmount.value) * 1e9);
  if (isNaN(lamports) || lamports <= 0) return;
  isSendingPayment.value = true;
  ws.send(JSON.stringify({
    type: 'shielded_pay',
    recipientPubkey: payRecipientSolana.value.trim(),
    recipientViewingPub: payRecipientViewing.value.trim(),
    amountLamports: lamports,
    memo: payMemo.value.trim() || undefined,
  }));
}

function sendScanPayments() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  isScanning.value = true;
  ws.send(JSON.stringify({ type: 'scan_payments' }));
}

function fillSelfAsRecipient() {
  if (!agentId.value || !payViewingKey.value) return;
  payRecipientSolana.value = agentId.value;
  payRecipientViewing.value = payViewingKey.value;
}

// ─── Reasoning audit state ───────────────────────────────────────────────────
const auditKey = ref('');
const auditTraceId = ref('');
const auditResult = ref<{ reasoning: string; charCount: number; contentHash: string; verified: boolean } | null>(null);
const isRevealing = ref(false);
const auditError = ref('');

async function revealReasoning(traceId: string) {
  auditTraceId.value = traceId;
  auditResult.value = null;
  auditError.value = '';
  isRevealing.value = true;
  try {
    const body: Record<string, string> = {};
    if (auditKey.value.trim()) body.auditKey = auditKey.value.trim();
    const res = await fetch(`${API_URL}/reasoning/${traceId}/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) { auditError.value = data.error; }
    else { auditResult.value = data; }
  } catch (e) {
    auditError.value = String(e);
  } finally {
    isRevealing.value = false;
  }
}

function closeAudit() {
  auditResult.value = null;
  auditError.value = '';
  auditTraceId.value = '';
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function statusColor(status: string) {
  return status === 'completed' ? 'text-emerald-600'
    : status === 'accepted' ? 'text-sky-600'
    : status === 'failed' ? 'text-red-500'
    : 'text-amber-600';
}

onMounted(() => {
  connect();
  fetchAgentX25519();
  fetchPayments();
  fetchLLMInfo();
});

onUnmounted(() => {
  ws?.close();
});
</script>

<template>
  <div class="h-screen overflow-hidden flex flex-col bg-[#F5F0E8]" style="font-family: 'Shippori Mincho', serif;">

    <!-- Header -->
    <header class="shrink-0 border-b border-stone-200 bg-[#F5F0E8]/95 backdrop-blur-sm z-50">
      <div class="px-4 sm:px-6 py-3 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-3">
          <img src="/kage_logo.png" alt="Kage" class="h-9 w-auto" />
        </RouterLink>
        <nav class="hidden sm:flex items-center gap-6 text-xs tracking-widest uppercase">
          <RouterLink to="/docs" class="text-stone-500 hover:text-stone-900 transition-colors">Docs</RouterLink>
          <RouterLink to="/roadmap" class="text-stone-500 hover:text-stone-900 transition-colors">Roadmap</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-stone-500 hover:text-stone-900 transition-colors">GitHub</a>
        </nav>
        <button class="sm:hidden text-stone-600" @click="mobileMenuOpen = !mobileMenuOpen">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
      </div>
      <div v-if="mobileMenuOpen" class="sm:hidden border-t border-stone-200 px-6 py-4 flex flex-col gap-3 text-xs tracking-widest uppercase text-stone-600">
        <RouterLink to="/docs" @click="mobileMenuOpen = false">Docs</RouterLink>
        <RouterLink to="/roadmap" @click="mobileMenuOpen = false">Roadmap</RouterLink>
        <a href="https://github.com/ranulfmeier/kage" target="_blank">GitHub</a>
      </div>
    </header>

    <!-- Body = Sidebar + Content -->
    <div class="flex flex-1 min-h-0">

      <!-- ── Sidebar (desktop) ── -->
      <aside class="w-52 shrink-0 hidden sm:flex flex-col border-r border-stone-200 bg-stone-50/70 overflow-y-auto">

        <!-- Agent Status -->
        <div class="px-4 py-3.5 border-b border-stone-200">
          <div class="flex items-center gap-2 mb-1">
            <div class="w-1.5 h-1.5 rounded-full shrink-0 transition-colors" :class="isConnected ? 'bg-emerald-500' : 'bg-stone-300'"></div>
            <span class="text-xs text-stone-600">{{ isConnected ? 'Connected' : 'Disconnected' }}</span>
          </div>
          <p v-if="agentId" class="text-[10px] font-mono text-stone-400 truncate leading-tight">{{ agentId.slice(0,18) }}…</p>
          <p v-if="llmProvider" class="text-[9px] text-stone-400 truncate leading-tight mt-0.5">{{ llmProvider }}</p>
          <button @click="connect" class="mt-1.5 text-[10px] tracking-widest uppercase text-stone-400 hover:text-stone-700 transition-colors">
            {{ isConnected ? 'Restart' : 'Connect' }}
          </button>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 px-2 py-3 space-y-4 text-xs">

          <div>
            <p class="text-[9px] font-medium tracking-[0.18em] uppercase text-stone-400 px-2 mb-1">Memory</p>
            <button @click="activeTab = 'chat'"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors text-left"
              :class="activeTab === 'chat' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-200'">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
              </svg>
              Memory Vault
            </button>
          </div>

          <div>
            <p class="text-[9px] font-medium tracking-[0.18em] uppercase text-stone-400 px-2 mb-1">Multi-Agent</p>
            <button @click="activeTab = 'delegation'; fetchTasks()"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors text-left"
              :class="activeTab === 'delegation' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-200'">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
              Delegation
            </button>
            <button @click="activeTab = 'messaging'; fetchAgentX25519(); fetchInbox()"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors text-left"
              :class="activeTab === 'messaging' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-200'">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              Messaging
            </button>
            <button @click="activeTab = 'groups'; fetchGroups(); fetchAgentX25519()"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors text-left"
              :class="activeTab === 'groups' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-200'">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              Group Vaults
            </button>
            <button @click="activeTab = 'teams'; fetchTeams()"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors text-left"
              :class="activeTab === 'teams' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-200'">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              Team Vaults
            </button>
          </div>

          <div>
            <p class="text-[9px] font-medium tracking-[0.18em] uppercase text-stone-400 px-2 mb-1">Privacy</p>
            <button @click="activeTab = 'payments'; fetchPayments()"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors text-left"
              :class="activeTab === 'payments' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-200'">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
              Payments
            </button>
          </div>

          <div>
            <p class="text-[9px] font-medium tracking-[0.18em] uppercase text-stone-400 px-2 mb-1">Identity</p>
            <button @click="activeTab = 'did'; fetchDID(); fetchDIDCredentials()"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors text-left"
              :class="activeTab === 'did' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-200'">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"/>
              </svg>
              DID
            </button>
            <button @click="activeTab = 'reputation'; fetchReputation()"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors text-left"
              :class="activeTab === 'reputation' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-200'">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
              </svg>
              Reputation
            </button>
          </div>

          <div>
            <p class="text-[9px] font-medium tracking-[0.18em] uppercase text-stone-400 px-2 mb-1">Verification</p>
            <button @click="activeTab = 'zk'; fetchZKCommitments(); checkProverHealth()"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors text-left"
              :class="activeTab === 'zk' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-200'">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
              ZK Proofs
            </button>
          </div>

        </nav>

        <!-- Sidebar footer: agent info -->
        <div class="px-4 py-3 border-t border-stone-200 space-y-2">
          <div class="flex justify-between items-center text-[10px]">
            <span class="text-stone-400">Network</span>
            <span class="text-stone-600 font-medium">Solana Devnet</span>
          </div>
          <div class="flex justify-between items-center text-[10px]">
            <span class="text-stone-400">Model</span>
            <span class="text-stone-600 font-medium">{{ deepThinkEnabled ? 'Sonnet 3.7' : 'Haiku' }}</span>
          </div>
          <div class="flex justify-between items-center text-[10px]">
            <span class="text-stone-400">Privacy</span>
            <span class="text-stone-600 font-medium">Umbra</span>
          </div>
          <button v-if="isConnected" @click="fetchMemories"
            class="block text-[10px] text-stone-400 hover:text-stone-600 transition-colors underline underline-offset-2">
            View vault →
          </button>
        </div>

      </aside>

      <!-- ── Mobile bottom tab bar ── -->
      <div class="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#F5F0E8]/95 backdrop-blur-sm border-t border-stone-200 grid grid-cols-8">
        <button v-for="tab in [
          { id: 'chat',       label: 'Memory' },
          { id: 'delegation', label: 'Delegate' },
          { id: 'messaging',  label: 'Messages' },
          { id: 'groups',     label: 'Groups' },
          { id: 'teams',      label: 'Teams' },
          { id: 'payments',   label: 'Payments' },
          { id: 'did',        label: 'DID' },
          { id: 'reputation', label: 'Rep' },
          { id: 'zk',         label: 'ZK' },
        ]" :key="tab.id"
          @click="activeTab = tab.id as ActiveTab; if(tab.id==='delegation') fetchTasks(); if(tab.id==='messaging'){fetchAgentX25519();fetchInbox();} if(tab.id==='groups'){fetchGroups();fetchAgentX25519();} if(tab.id==='payments') fetchPayments(); if(tab.id==='did'){fetchDID();fetchDIDCredentials();} if(tab.id==='reputation') fetchReputation(); if(tab.id==='teams') fetchTeams(); if(tab.id==='zk') fetchZKCommitments();"
          class="py-2.5 text-[9px] tracking-widest uppercase transition-colors"
          :class="activeTab === tab.id ? 'bg-stone-200 text-stone-800 font-medium' : 'text-stone-400'"
        >{{ tab.label }}</button>
      </div>

      <!-- ── Main content area ── -->
      <main class="flex-1 min-h-0 overflow-y-auto pb-16 sm:pb-0">
        <div class="max-w-3xl mx-auto px-4 sm:px-6 py-5">

      <!-- ── Context bar ── -->
      <div class="mb-5 pb-4 border-b border-stone-200">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="text-base font-medium text-stone-800 tracking-wide">{{ tabInfo[activeTab]?.name }}</h2>
            <p class="text-xs text-stone-400 mt-1 leading-relaxed max-w-xl">{{ tabInfo[activeTab]?.description }}</p>
          </div>
          <div class="flex gap-1.5 flex-wrap justify-end shrink-0 pt-0.5">
            <span
              v-for="badge in tabInfo[activeTab]?.badges"
              :key="badge"
              class="text-[9px] tracking-widest uppercase px-2 py-0.5 bg-stone-100 text-stone-500 border border-stone-200 whitespace-nowrap"
            >{{ badge }}</span>
          </div>
        </div>
      </div>

      <!-- Memory Panel -->
      <div
        v-if="showMemories && activeTab === 'chat'"
        class="mb-4 border border-stone-200 bg-white/60 rounded-sm p-4"
      >
        <p class="text-xs tracking-widest uppercase text-stone-400 mb-3">Encrypted Vault</p>
        <div v-if="memories.length === 0" class="text-sm text-stone-400 italic">
          No memories stored yet.
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="m in memories"
            :key="m.index"
            class="flex items-center justify-between text-sm"
          >
            <span class="text-stone-600 font-mono text-xs">{{ m.id }}</span>
            <span class="text-stone-400 text-xs">{{ m.type }} · {{ m.time }}</span>
          </div>
        </div>
      </div>

      <!-- ── CHAT TAB ── -->
      <div v-if="activeTab === 'chat'" class="border border-stone-200 bg-white/70 rounded-sm overflow-hidden">

        <!-- Messages -->
        <div
          ref="messagesEl"
          class="h-[500px] sm:h-[560px] overflow-y-auto p-5 sm:p-6 space-y-5 scroll-smooth"
          style="scrollbar-width: thin; scrollbar-color: #d6d3d1 transparent;"
        >
          <!-- Empty state -->
          <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center gap-6">
            <div class="text-6xl opacity-20" style="font-family: serif;">影</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              <button
                v-for="s in suggestions"
                :key="s"
                @click="useSuggestion(s)"
                class="text-left px-4 py-3 border border-stone-200 text-xs text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-all leading-relaxed"
              >
                {{ s }}
              </button>
            </div>
          </div>

          <!-- Messages list -->
          <template v-for="(msg, i) in messages" :key="i">
            <!-- System message -->
            <div v-if="msg.role === 'system'" class="text-center">
              <span class="text-xs text-stone-400 bg-stone-100 px-3 py-1 rounded-full">{{ msg.text }}</span>
            </div>

            <!-- User message -->
            <div v-else-if="msg.role === 'user'" class="flex justify-end">
              <div class="max-w-[75%]">
                <div class="bg-stone-800 text-stone-100 px-4 py-3 text-sm leading-relaxed rounded-sm">
                  {{ msg.text }}
                </div>
                <p class="text-right text-xs text-stone-400 mt-1">{{ msg.time }}</p>
              </div>
            </div>

            <!-- Assistant message -->
            <div v-else class="flex justify-start">
              <div class="max-w-[80%]">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs text-stone-400 tracking-widest uppercase">Kage</span>
                </div>
                <div class="bg-stone-50 border border-stone-200 px-4 py-3 text-sm text-stone-700 leading-relaxed rounded-sm whitespace-pre-wrap">
                  {{ msg.text }}
                </div>
                <!-- Hidden Reasoning badge -->
                <div v-if="msg.reasoning" class="mt-2 border border-stone-200 bg-stone-50/80 px-3 py-2.5 text-xs space-y-1.5">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                      <span class="text-stone-400 font-mono">—</span>
                      <span class="text-stone-500 tracking-widest uppercase text-[10px] font-medium">Reasoning Hidden</span>
                      <span class="text-stone-400 font-mono text-[10px]">{{ msg.reasoning.charCount }} chars encrypted</span>
                    </div>
                    <button
                      @click="revealReasoning(msg.reasoning!.traceId)"
                      class="text-[10px] tracking-widest uppercase text-stone-400 hover:text-stone-700 underline underline-offset-2 transition-colors"
                    >Reveal</button>
                  </div>
                  <div class="flex items-center gap-2 text-stone-400">
                    <span class="flex-shrink-0">Hash</span>
                    <span class="font-mono truncate text-[10px]">{{ msg.reasoning.contentHash.slice(0, 32) }}…</span>
                  </div>
                  <a v-if="msg.reasoning.explorerUrl" :href="msg.reasoning.explorerUrl" target="_blank"
                    class="flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-700 transition-colors">
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    Verify commitment on Solscan
                  </a>
                </div>

                <!-- Proof panel -->
                <div v-if="msg.proof && (msg.proof.explorerUrl || msg.proof.umbraProof || msg.proof.cid)" class="mt-2 border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs space-y-1.5">
                  <p class="text-emerald-700 font-medium tracking-wide uppercase text-[10px]">On-chain Proof</p>
                  <div v-if="msg.proof.cid" class="flex items-center gap-2 text-stone-500">
                    <span class="text-stone-400 w-16 flex-shrink-0">CID</span>
                    <span class="font-mono truncate">{{ msg.proof.cid }}</span>
                  </div>
                  <div v-if="msg.proof.umbraProof" class="flex items-center gap-2 text-stone-500">
                    <span class="text-stone-400 w-16 flex-shrink-0">Umbra</span>
                    <span class="font-mono truncate">{{ msg.proof.umbraProof.slice(0, 32) }}…</span>
                  </div>
                  <div v-if="msg.proof.txSignature && !msg.proof.explorerUrl" class="flex items-center gap-2 text-stone-500">
                    <span class="text-stone-400 w-16 flex-shrink-0">TX</span>
                    <span class="font-mono truncate">{{ msg.proof.txSignature.slice(0, 24) }}…</span>
                  </div>
                  <a v-if="msg.proof.explorerUrl" :href="msg.proof.explorerUrl" target="_blank"
                    class="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 transition-colors font-medium">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    Verify on Solscan
                  </a>
                </div>
                <p class="text-xs text-stone-400 mt-1">{{ msg.time }}</p>
              </div>
            </div>
          </template>

          <!-- Typing / reasoning steps indicator -->
          <div v-if="isTyping" class="flex justify-start">
            <div class="bg-stone-50 border border-stone-200 px-4 py-3 rounded-sm max-w-[85%] space-y-2">
              <!-- Header -->
              <div class="flex gap-1.5 items-center">
                <div class="w-1.5 h-1.5 rounded-full animate-bounce"
                  :class="deepThinkEnabled ? 'bg-violet-500' : 'bg-stone-400'"
                  style="animation-delay: 0ms"></div>
                <div class="w-1.5 h-1.5 rounded-full animate-bounce"
                  :class="deepThinkEnabled ? 'bg-violet-500' : 'bg-stone-400'"
                  style="animation-delay: 150ms"></div>
                <div class="w-1.5 h-1.5 rounded-full animate-bounce"
                  :class="deepThinkEnabled ? 'bg-violet-500' : 'bg-stone-400'"
                  style="animation-delay: 300ms"></div>
                <span class="text-xs ml-1" :class="deepThinkEnabled ? 'text-violet-500' : 'text-stone-400'">
                  {{ deepThinkEnabled ? 'Deep thinking…' : 'Thinking…' }}
                </span>
              </div>
              <!-- Live reasoning steps -->
              <transition-group
                v-if="liveReasoningSteps.length > 0"
                name="step-fade"
                tag="ol"
                class="space-y-1 list-none pl-0"
              >
                <li
                  v-for="(step, i) in liveReasoningSteps"
                  :key="i"
                  class="text-xs text-stone-500 font-mono leading-relaxed flex gap-2"
                >
                  <span class="text-stone-300 select-none">{{ i + 1 }}.</span>
                  <span>{{ step.replace(/^\d+[\.\)]\s*/, '') }}</span>
                </li>
              </transition-group>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="border-t border-stone-200 p-4 bg-white/80">
          <div class="flex gap-3 items-end">
            <textarea
              v-model="input"
              @keydown="handleKey"
              :disabled="!isConnected"
              placeholder="Tell Kage something to remember…"
              rows="2"
              class="flex-1 resize-none bg-transparent text-sm text-stone-800 placeholder-stone-300 outline-none leading-relaxed"
              style="font-family: inherit;"
            ></textarea>
            <!-- Deep Think toggle -->
            <button
              @click="toggleDeepThink"
              :disabled="!isConnected"
              :title="deepThinkEnabled ? 'Deep Think ON — click to disable' : 'Enable Deep Think (Extended Thinking)'"
              class="px-3 py-2.5 text-xs tracking-widest uppercase border transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              :class="deepThinkEnabled
                ? 'bg-violet-800 text-violet-100 border-violet-800 hover:bg-violet-900'
                : 'bg-transparent text-stone-400 border-stone-200 hover:border-stone-400 hover:text-stone-600'"
            >
              {{ deepThinkEnabled ? 'Deep ON' : 'Deep' }}
            </button>
            <button
              @click="send"
              :disabled="!isConnected || !input.trim()"
              class="px-5 py-2.5 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              Send
            </button>
          </div>
          <p class="text-xs text-stone-400 mt-2">
            Try <span class="font-mono text-stone-500">/memories</span> · or: <span class="font-mono text-stone-500">delegate &lt;task&gt; to &lt;pubkey&gt;</span>
            · <span :class="deepThinkEnabled ? 'text-violet-500 font-medium' : 'text-stone-400'">Deep Think {{ deepThinkEnabled ? 'ON' : 'OFF' }}</span>
          </p>
        </div>
      </div>

      <!-- ── DELEGATION TAB ── -->
      <div v-if="activeTab === 'delegation'" class="space-y-4">

        <!-- Compose form -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <p class="text-xs tracking-widest uppercase text-stone-400">New Shielded Task</p>

          <div class="space-y-1">
            <label class="text-xs text-stone-500 tracking-wide">Recipient Agent Pubkey</label>
            <input
              v-model="delegRecipient"
              placeholder="Solana public key…"
              class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-mono text-stone-700 outline-none focus:border-stone-400 transition-colors"
              :disabled="!isConnected"
            />
          </div>

          <div class="space-y-1">
            <label class="text-xs text-stone-500 tracking-wide">Task Instruction</label>
            <textarea
              v-model="delegInstruction"
              placeholder="Analyze portfolio and suggest rebalancing…"
              rows="3"
              class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-sm text-stone-700 outline-none focus:border-stone-400 transition-colors resize-none"
              :disabled="!isConnected"
              style="font-family: inherit;"
            ></textarea>
          </div>

          <div class="flex items-center gap-3">
            <button
              @click="sendDelegate"
              :disabled="!isConnected || !delegRecipient.trim() || !delegInstruction.trim() || isDelegating"
              class="px-6 py-2.5 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {{ isDelegating ? 'Delegating…' : 'Delegate Task' }}
            </button>
            <p class="text-xs text-stone-400">Payload encrypted before transmission</p>
          </div>
        </div>

        <!-- Task list -->
        <div class="border border-stone-200 bg-white/70 p-5">
          <div class="flex items-center justify-between mb-4">
            <p class="text-xs tracking-widest uppercase text-stone-400">Active Tasks</p>
            <button @click="fetchTasks" class="text-xs text-stone-400 hover:text-stone-700 uppercase tracking-widest transition-colors">Refresh</button>
          </div>

          <div v-if="delegTasks.length === 0" class="text-sm text-stone-400 italic text-center py-8">
            No tasks delegated yet.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="t in delegTasks"
              :key="t.taskId"
              class="border border-stone-100 p-3 space-y-2"
            >
              <div class="flex items-start justify-between gap-2">
                <span class="font-mono text-xs text-stone-600">{{ t.taskId.slice(0, 24) }}…</span>
                <span class="text-xs font-medium" :class="statusColor(t.status)">{{ t.status }}</span>
              </div>
              <div class="flex gap-4 text-xs text-stone-400">
                <span>From: <span class="font-mono text-stone-600">{{ t.from }}</span></span>
                <span>→ To: <span class="font-mono text-stone-600">{{ t.to }}</span></span>
              </div>
              <a
                v-if="t.explorerUrl"
                :href="t.explorerUrl"
                target="_blank"
                class="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 transition-colors font-medium w-fit"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
                Verify on Solscan
              </a>
            </div>
          </div>
        </div>

        <!-- How it works -->
        <div class="border border-stone-100 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">How Shielded Delegation Works</p>
          <ol class="space-y-2 text-xs text-stone-500 list-decimal list-inside leading-relaxed">
            <li>Task payload is encrypted with a shared secret derived from both agents' keypairs</li>
            <li>Only the payload hash is committed on-chain (Solana Memo program)</li>
            <li>Recipient agent decrypts and executes the task off-chain</li>
            <li>Result is encrypted back — neither payload nor result is visible on-chain</li>
          </ol>
        </div>
      </div>

      <!-- ── MESSAGING TAB ── -->
      <div v-if="activeTab === 'messaging'" class="space-y-4">

        <!-- Agent identity card -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">Your Agent Identity</p>
          <div class="space-y-2">
            <div>
              <p class="text-xs text-stone-400 mb-1">Solana Address</p>
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs text-stone-600 break-all">{{ agentId || '—' }}</span>
                <button v-if="agentId" @click="copyToClipboard(agentId)" class="text-stone-400 hover:text-stone-700 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <p class="text-xs text-stone-400 mb-1">X25519 Public Key <span class="text-stone-300">(share for encrypted messaging)</span></p>
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs text-stone-600 break-all">{{ agentX25519Pub || '—' }}</span>
                <button v-if="agentX25519Pub" @click="copyToClipboard(agentX25519Pub)" class="text-stone-400 hover:text-stone-700 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Compose form -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <p class="text-xs tracking-widest uppercase text-stone-400">Send Encrypted Message</p>

          <div class="space-y-1">
            <label class="text-xs text-stone-500 tracking-wide">Recipient Solana Address</label>
            <input
              v-model="msgRecipientPubkey"
              placeholder="Solana public key…"
              class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-mono text-stone-700 outline-none focus:border-stone-400 transition-colors"
              :disabled="!isConnected"
            />
          </div>

          <div class="space-y-1">
            <label class="text-xs text-stone-500 tracking-wide">Recipient X25519 Public Key</label>
            <input
              v-model="msgRecipientX25519"
              placeholder="Base64 X25519 key (from /agent/x25519 endpoint)…"
              class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-mono text-stone-700 outline-none focus:border-stone-400 transition-colors"
              :disabled="!isConnected"
            />
          </div>

          <div class="space-y-1">
            <label class="text-xs text-stone-500 tracking-wide">Message</label>
            <textarea
              v-model="msgText"
              placeholder="Type a message — encrypted before sending…"
              rows="3"
              class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-sm text-stone-700 outline-none focus:border-stone-400 transition-colors resize-none"
              :disabled="!isConnected"
              style="font-family: inherit;"
            ></textarea>
          </div>

          <div class="flex items-center gap-3">
            <button
              @click="sendEncryptedMessage"
              :disabled="!isConnected || !msgRecipientPubkey.trim() || !msgRecipientX25519.trim() || !msgText.trim() || isSendingMsg"
              class="px-6 py-2.5 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {{ isSendingMsg ? 'Sending…' : 'Send Encrypted' }}
            </button>
            <p class="text-xs text-stone-400">AES-256-GCM · X25519 DH</p>
          </div>
        </div>

        <!-- Sent messages -->
        <div v-if="sentMessages.length > 0" class="border border-stone-200 bg-white/70 p-5">
          <p class="text-xs tracking-widest uppercase text-stone-400 mb-4">Sent</p>
          <div class="space-y-3">
            <div v-for="m in sentMessages" :key="m.messageId" class="border border-stone-100 p-3 space-y-1">
              <div class="flex items-start justify-between gap-2">
                <span class="font-mono text-xs text-stone-600">{{ m.messageId.slice(0, 28) }}…</span>
                <span class="text-xs text-emerald-600 font-medium">sent</span>
              </div>
              <p class="text-xs text-stone-400">To: <span class="font-mono">{{ m.to.slice(0, 12) }}…</span></p>
              <a v-if="m.explorerUrl" :href="m.explorerUrl" target="_blank"
                class="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 transition-colors font-medium w-fit">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
                Verify on Solscan
              </a>
            </div>
          </div>
        </div>

        <!-- Inbox -->
        <div class="border border-stone-200 bg-white/70 p-5">
          <div class="flex items-center justify-between mb-4">
            <p class="text-xs tracking-widest uppercase text-stone-400">
              Inbox
              <span v-if="inbox.filter(m => !m.read).length > 0" class="ml-2 bg-stone-800 text-stone-100 px-1.5 py-0.5 text-[10px] rounded-full">
                {{ inbox.filter(m => !m.read).length }}
              </span>
            </p>
            <button @click="fetchInbox" class="text-xs text-stone-400 hover:text-stone-700 uppercase tracking-widest transition-colors">Refresh</button>
          </div>
          <div v-if="inbox.length === 0" class="text-sm text-stone-400 italic text-center py-6">No messages yet.</div>
          <div v-else class="space-y-2">
            <div v-for="m in inbox" :key="m.messageId" class="border border-stone-100 p-3 space-y-1">
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-xs text-stone-600">{{ m.messageId.slice(0, 24) }}…</span>
                <span class="text-[10px]" :class="m.read ? 'text-stone-400' : 'text-sky-600 font-semibold'">{{ m.read ? 'read' : 'unread' }}</span>
              </div>
              <p class="text-xs text-stone-400">From: <span class="font-mono">{{ m.from }}</span> · {{ m.sentAt }}</p>
            </div>
          </div>
        </div>

        <!-- How it works -->
        <div class="border border-stone-100 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">How Encrypted Messaging Works</p>
          <ol class="space-y-2 text-xs text-stone-500 list-decimal list-inside leading-relaxed">
            <li>Each agent derives an X25519 keypair from their Ed25519 (Solana) seed</li>
            <li>Sender performs X25519 DH with recipient's X25519 pub → shared secret</li>
            <li>Message is encrypted with AES-256-GCM using that shared secret</li>
            <li>Only ciphertext + content hash are transmitted — hash anchored on Solana</li>
            <li>Recipient decrypts using their own X25519 key + sender's X25519 pub</li>
          </ol>
        </div>
      </div>

      <!-- ── GROUP VAULTS TAB ── -->
      <div v-if="activeTab === 'groups'" class="space-y-4">

        <!-- Self-fill hint -->
        <div class="border border-stone-100 bg-stone-50 px-4 py-3 flex items-center justify-between gap-4">
          <div class="text-xs text-stone-500">
            <span class="font-mono text-stone-600">{{ agentId ? agentId.slice(0,16) + '…' : '—' }}</span>
            <span class="text-stone-400 ml-2">X25519: {{ agentX25519Pub ? agentX25519Pub.slice(0,16) + '…' : '—' }}</span>
          </div>
          <button @click="fillSelfAsMember" class="text-xs text-stone-500 hover:text-stone-800 tracking-widest uppercase transition-colors border border-stone-200 px-3 py-1 whitespace-nowrap">
            Use My Keys ↓
          </button>
        </div>

        <!-- Create group form -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-xs tracking-widest uppercase text-stone-400">Create Group Vault</p>
            <div class="flex items-center gap-2 text-xs text-stone-500">
              <span>Threshold:</span>
              <input
                v-model.number="groupThreshold"
                type="number"
                min="1"
                :max="groupMembers.length"
                class="w-12 bg-stone-50 border border-stone-200 px-2 py-1 text-center text-stone-700 outline-none focus:border-stone-400"
              />
              <span>of {{ groupMembers.length }}</span>
            </div>
          </div>

          <div class="space-y-3">
            <div v-for="(m, idx) in groupMembers" :key="idx" class="flex gap-2 items-start">
              <div class="flex-1 space-y-1">
                <input
                  v-model="m.solanaPubkey"
                  :placeholder="`Member ${idx + 1} Solana address`"
                  class="w-full bg-stone-50 border border-stone-200 px-3 py-1.5 text-xs font-mono text-stone-700 outline-none focus:border-stone-400 transition-colors"
                />
                <input
                  v-model="m.x25519Pubkey"
                  :placeholder="`Member ${idx + 1} X25519 public key`"
                  class="w-full bg-stone-50 border border-stone-200 px-3 py-1.5 text-xs font-mono text-stone-700 outline-none focus:border-stone-400 transition-colors"
                />
              </div>
              <button v-if="groupMembers.length > 2" @click="removeMember(idx)" class="text-stone-300 hover:text-red-400 transition-colors mt-1 text-lg leading-none">×</button>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              @click="sendCreateGroup"
              :disabled="!isConnected || isCreatingGroup"
              class="px-5 py-2 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {{ isCreatingGroup ? 'Creating…' : 'Create Vault' }}
            </button>
            <button @click="addMember" class="px-4 py-2 border border-stone-200 text-xs text-stone-500 hover:border-stone-400 transition-colors">
              + Add Member
            </button>
            <p class="text-xs text-stone-400">Shamir {{ groupThreshold }}-of-{{ groupMembers.length }}</p>
          </div>
        </div>

        <!-- Active groups list -->
        <div v-if="groups.length > 0" class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs tracking-widest uppercase text-stone-400">Active Groups</p>
            <button @click="fetchGroups" class="text-xs text-stone-400 hover:text-stone-700 uppercase tracking-widest transition-colors">Refresh</button>
          </div>
          <div v-for="g in groups" :key="g.groupId"
            class="border p-3 space-y-2 cursor-pointer transition-colors"
            :class="activeGroupId === g.groupId ? 'border-stone-400 bg-stone-50' : 'border-stone-100 hover:border-stone-300'"
            @click="activeGroupId = g.groupId; sendReadEntries(g.groupId)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-xs text-stone-600">{{ g.groupId.slice(0, 28) }}…</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded"
                :class="g.hasKey ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">
                {{ g.hasKey ? 'key ready' : 'locked' }}
              </span>
            </div>
            <div class="flex gap-4 text-xs text-stone-400">
              <span>{{ g.threshold }}-of-{{ g.totalMembers }} threshold</span>
              <span>{{ g.entryCount }} entries</span>
              <span>{{ g.createdAt }}</span>
            </div>
            <a v-if="g.explorerUrl" :href="g.explorerUrl" target="_blank" @click.stop
              class="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors w-fit">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
              Verify on Solscan
            </a>
          </div>
        </div>

        <!-- Write to active vault -->
        <div v-if="activeGroupId" class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">
            Write to Vault
            <span class="font-mono normal-case ml-2 text-stone-500">{{ activeGroupId.slice(0,20) }}…</span>
          </p>
          <textarea
            v-model="groupContent"
            placeholder="Secret intel, trading signal, shared context…"
            rows="3"
            class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-sm text-stone-700 outline-none focus:border-stone-400 resize-none"
            style="font-family: inherit;"
          ></textarea>
          <button
            @click="sendStoreEntry"
            :disabled="!isConnected || !groupContent.trim() || isStoringEntry"
            class="px-5 py-2 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {{ isStoringEntry ? 'Encrypting…' : 'Store Encrypted' }}
          </button>
        </div>

        <!-- Vault entries -->
        <div v-if="groupEntries.length > 0" class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">Decrypted Entries</p>
          <div v-for="(e, idx) in groupEntries" :key="idx" class="border border-stone-100 p-3 space-y-1">
            <div class="flex items-center justify-between text-xs text-stone-400">
              <span class="font-mono">{{ (e as any).entryId?.slice(0,24) }}…</span>
              <span>{{ (e as any).addedBy?.slice(0,8) }}… · {{ new Date((e as any).addedAt).toLocaleTimeString() }}</span>
            </div>
            <p class="text-sm text-stone-700 mt-1">{{ typeof (e as any).content === 'string' ? (e as any).content : JSON.stringify((e as any).content) }}</p>
          </div>
        </div>

        <!-- How it works -->
        <div class="border border-stone-100 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">How Group Vaults Work</p>
          <ol class="space-y-2 text-xs text-stone-500 list-decimal list-inside leading-relaxed">
            <li>A random <span class="font-mono text-stone-600">groupKey</span> is generated and split into <em>n</em> shares via Shamir's Secret Sharing (GF256)</li>
            <li>Each member receives their share encrypted with their X25519 public key</li>
            <li>Vault content is encrypted with AES-256-GCM using the <span class="font-mono text-stone-600">groupKey</span></li>
            <li>To read: collect <em>m</em> member shares → reconstruct groupKey → decrypt</li>
            <li>Group membership hash is committed on Solana — verifiable without revealing members</li>
          </ol>
        </div>
      </div>

      <!-- ─── Payments Tab ─────────────────────────────────────────────────── -->
      <div v-if="activeTab === 'payments'" class="space-y-4">

        <!-- Agent viewing key -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">Agent Stealth Viewing Key</p>
          <p class="text-xs text-stone-400 leading-relaxed">Share this key with senders so they can derive one-time stealth addresses for you. Only you can scan and claim funds sent to those addresses.</p>
          <div v-if="payViewingKey" class="space-y-2">
            <div class="flex items-center gap-2">
              <code class="text-xs font-mono text-stone-600 bg-stone-50 border border-stone-200 px-3 py-2 flex-1 break-all">{{ payViewingKey }}</code>
              <button @click="copyToClipboard(payViewingKey)" class="px-3 py-2 border border-stone-200 text-xs text-stone-500 hover:text-stone-800 hover:border-stone-400 transition-colors flex-shrink-0">Copy</button>
            </div>
          </div>
          <div v-else class="text-xs text-stone-400">Connecting…</div>
        </div>

        <!-- Send shielded payment -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-xs tracking-widest uppercase text-stone-400">Send Shielded SOL</p>
            <button
              @click="fillSelfAsRecipient"
              class="text-xs text-stone-400 hover:text-stone-700 underline underline-offset-2 transition-colors"
            >Use My Keys (self-test)</button>
          </div>

          <div class="grid grid-cols-1 gap-3">
            <div>
              <label class="text-xs text-stone-400 tracking-wide block mb-1">Recipient Solana Pubkey</label>
              <input
                v-model="payRecipientSolana"
                placeholder="Base58 address…"
                class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-sm text-stone-700 font-mono outline-none focus:border-stone-400"
                style="font-family: 'JetBrains Mono', monospace;"
              />
            </div>
            <div>
              <label class="text-xs text-stone-400 tracking-wide block mb-1">Recipient Viewing Key (X25519, base64)</label>
              <input
                v-model="payRecipientViewing"
                placeholder="Base64 X25519 public key…"
                class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-sm text-stone-700 font-mono outline-none focus:border-stone-400"
                style="font-family: 'JetBrains Mono', monospace;"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-stone-400 tracking-wide block mb-1">Amount (SOL)</label>
                <input
                  v-model="payAmount"
                  type="number"
                  step="0.001"
                  min="0.001"
                  placeholder="0.01"
                  class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-sm text-stone-700 outline-none focus:border-stone-400"
                />
              </div>
              <div>
                <label class="text-xs text-stone-400 tracking-wide block mb-1">Memo (optional)</label>
                <input
                  v-model="payMemo"
                  placeholder="trading fee, bounty…"
                  class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-sm text-stone-700 outline-none focus:border-stone-400"
                />
              </div>
            </div>
          </div>

          <div class="flex gap-3">
            <button
              @click="sendShieldedPay"
              :disabled="!isConnected || !payRecipientSolana.trim() || !payRecipientViewing.trim() || !payAmount || isSendingPayment"
              class="flex-1 py-2 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {{ isSendingPayment ? 'Sending…' : 'Send Shielded Payment' }}
            </button>
            <button
              @click="sendScanPayments"
              :disabled="!isConnected || isScanning"
              class="px-4 py-2 border border-stone-300 text-stone-600 text-xs tracking-widest uppercase hover:border-stone-500 hover:text-stone-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {{ isScanning ? 'Scanning…' : 'Scan Inbox' }}
            </button>
          </div>
        </div>

        <!-- Last payment result -->
        <div v-if="lastPayment" class="border border-emerald-200 bg-emerald-50/60 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-emerald-600">Payment Sent</p>
          <div class="space-y-2 text-xs">
            <div>
              <span class="text-stone-400">Stealth address:</span>
              <code class="font-mono text-stone-700 ml-2 break-all">{{ lastPayment.stealthAddress }}</code>
            </div>
            <div>
              <span class="text-stone-400">Ephemeral pub:</span>
              <code class="font-mono text-stone-600 ml-2 break-all text-xs">{{ lastPayment.ephemeralPub }}</code>
            </div>
            <p class="text-stone-400 italic">Only the recipient can derive this address from their viewing key.</p>
          </div>
          <a v-if="lastPayment.explorerUrl" :href="lastPayment.explorerUrl" target="_blank"
            class="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors w-fit">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            Verify on Solscan
          </a>
        </div>

        <!-- Payment history -->
        <div v-if="payments.length > 0" class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">Payment History</p>
          <div class="space-y-2">
            <div v-for="p in payments" :key="p.paymentId" class="border border-stone-100 p-3 flex items-center justify-between gap-3">
              <div class="space-y-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs px-2 py-0.5 rounded-full" :class="p.direction === 'sent' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'">
                    {{ p.direction === 'sent' ? '↑ Sent' : '↓ Received' }}
                  </span>
                  <span class="text-xs font-semibold text-stone-700">{{ p.amountSol }} SOL</span>
                  <span class="text-xs text-stone-400">{{ p.createdAt }}</span>
                </div>
                <code class="text-xs font-mono text-stone-500 truncate block">{{ p.stealthAddress }}</code>
              </div>
              <a v-if="p.explorerUrl" :href="p.explorerUrl" target="_blank"
                class="flex-shrink-0 text-xs text-emerald-600 hover:text-emerald-700 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        <!-- How it works -->
        <div class="border border-stone-100 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">How Shielded Payments Work</p>
          <ol class="space-y-2 text-xs text-stone-500 list-decimal list-inside leading-relaxed">
            <li>Sender generates a fresh <span class="font-mono text-stone-600">ephemeralKeypair</span></li>
            <li>Shared secret = <span class="font-mono text-stone-600">X25519(ephemeral_priv, recipient_view_pub)</span></li>
            <li>One-time stealth address = <span class="font-mono text-stone-600">Ed25519(SHA-256(shared))</span></li>
            <li>SOL is sent to stealth address — on-chain link to recipient's identity is broken</li>
            <li>Recipient scans with viewing key: <span class="font-mono text-stone-600">X25519(view_priv, ephemeral_pub)</span> → derives same address</li>
            <li>Recipient claims by signing a sweep transaction from the stealth keypair</li>
          </ol>
        </div>
      </div>

      <!-- ─── Reasoning Audit Modal ────────────────────────────────────────── -->
      <div v-if="auditTraceId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div class="bg-[#F5F0E8] border border-stone-300 w-full max-w-lg p-6 space-y-4" style="font-family: 'Shippori Mincho', serif;">
          <div class="flex items-center justify-between">
            <p class="text-xs tracking-widest uppercase text-stone-500">Reveal Hidden Reasoning</p>
            <button @click="closeAudit" class="text-stone-400 hover:text-stone-700">✕</button>
          </div>

          <div class="space-y-1 text-xs text-stone-400">
            <p>Trace ID: <span class="font-mono text-stone-600">{{ auditTraceId.slice(0, 32) }}…</span></p>
          </div>

          <div class="space-y-2">
            <label class="text-xs text-stone-400 tracking-wide block">Audit Key (optional — leave empty to reveal as agent)</label>
            <div class="flex gap-2">
              <input
                v-model="auditKey"
                placeholder="Base64 audit key… or leave empty"
                class="flex-1 bg-white border border-stone-200 px-3 py-2 text-xs font-mono text-stone-700 outline-none focus:border-stone-400"
              />
              <button
                @click="revealReasoning(auditTraceId)"
                :disabled="isRevealing"
                class="px-4 py-2 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-50 transition-colors flex-shrink-0"
              >{{ isRevealing ? 'Decrypting…' : 'Reveal' }}</button>
            </div>
          </div>

          <!-- Error -->
          <div v-if="auditError" class="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {{ auditError }}
          </div>

          <!-- Result -->
          <div v-if="auditResult" class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-xs px-2 py-0.5 rounded-full" :class="auditResult.verified ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'">
                {{ auditResult.verified ? '✓ Hash verified' : '✗ Hash mismatch' }}
              </span>
              <span class="text-xs text-stone-400">{{ auditResult.charCount }} chars</span>
            </div>
            <div class="bg-white border border-stone-200 p-3 text-xs text-stone-700 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap font-mono">
              {{ auditResult.reasoning }}
            </div>
          </div>
        </div>
      </div>

      <!-- ── REPUTATION TAB ── -->
      <div v-if="activeTab === 'reputation'" class="space-y-4">

        <!-- Score Card -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-xs tracking-widest uppercase text-stone-400">Agent Reputation Score</p>
            <button
              @click="fetchReputation"
              :disabled="!isConnected || isLoadingRep"
              class="px-3 py-1 text-xs tracking-widest uppercase border border-stone-200 text-stone-500 hover:border-stone-400 disabled:opacity-30 transition-colors"
            >{{ isLoadingRep ? 'Loading…' : 'Refresh' }}</button>
          </div>

          <div v-if="selfRep" class="space-y-4">
            <!-- Score + tier -->
            <div class="flex items-end gap-4">
              <div>
                <p class="text-6xl font-bold text-stone-800 leading-none">{{ selfRep.score }}</p>
                <p class="text-xs text-stone-400 mt-1">/ 1000</p>
              </div>
              <div>
                <span class="text-xs px-2 py-1 border rounded-full font-medium" :class="tierColor(selfRep.tier)">
                  {{ selfRep.tier.toUpperCase() }}
                </span>
                <p class="text-xs text-stone-400 mt-1">Success rate: {{ repSuccessRate }}%</p>
              </div>
            </div>

            <!-- Score bar -->
            <div class="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-700"
                :class="selfRep.score >= 800 ? 'bg-yellow-400' : selfRep.score >= 600 ? 'bg-violet-500' : selfRep.score >= 350 ? 'bg-emerald-500' : 'bg-blue-400'"
                :style="{ width: scoreBarWidth(selfRep.score) }"
              ></div>
            </div>

            <!-- Stats grid -->
            <div class="grid grid-cols-4 gap-2 text-center">
              <div class="bg-stone-50 border border-stone-100 p-2 rounded-sm">
                <p class="text-lg font-semibold text-stone-800">{{ selfRep.totalTasks }}</p>
                <p class="text-xs text-stone-400">Total Tasks</p>
              </div>
              <div class="bg-emerald-50 border border-emerald-100 p-2 rounded-sm">
                <p class="text-lg font-semibold text-emerald-700">{{ selfRep.successfulTasks }}</p>
                <p class="text-xs text-stone-400">Success</p>
              </div>
              <div class="bg-red-50 border border-red-100 p-2 rounded-sm">
                <p class="text-lg font-semibold text-red-600">{{ selfRep.failedTasks }}</p>
                <p class="text-xs text-stone-400">Failed</p>
              </div>
              <div class="bg-orange-50 border border-orange-100 p-2 rounded-sm">
                <p class="text-lg font-semibold text-orange-600">{{ selfRep.slashCount }}</p>
                <p class="text-xs text-stone-400">Slashed</p>
              </div>
            </div>

            <!-- On-chain anchor -->
            <div v-if="selfRep.lastTxSignature" class="flex items-center gap-2 text-xs text-stone-400">
              <span>On-chain:</span>
              <a :href="`https://solscan.io/tx/${selfRep.lastTxSignature}?cluster=devnet`"
                 target="_blank" class="underline hover:text-stone-600 font-mono">
                {{ selfRep.lastTxSignature.slice(0,16) }}…
              </a>
            </div>
          </div>
          <p v-else class="text-xs text-stone-400">Click Refresh to load reputation…</p>
        </div>

        <!-- Record Task -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <p class="text-xs tracking-widest uppercase text-stone-400">Record Task Outcome</p>

          <div class="flex gap-2">
            <button
              v-for="o in ['success', 'partial', 'failure']"
              :key="o"
              @click="repTaskOutcome = o as 'success' | 'partial' | 'failure'"
              class="flex-1 py-2 text-xs tracking-widest uppercase border transition-colors"
              :class="repTaskOutcome === o
                ? (o === 'success' ? 'bg-emerald-700 text-white border-emerald-700' : o === 'partial' ? 'bg-amber-600 text-white border-amber-600' : 'bg-red-700 text-white border-red-700')
                : 'text-stone-400 border-stone-200 hover:border-stone-400'"
            >
              {{ o === 'success' ? '+25' : o === 'partial' ? '+8' : '-15' }} {{ o }}
            </button>
          </div>

          <input
            v-model="repTaskDesc"
            placeholder="Task description (optional)…"
            class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs text-stone-700 outline-none focus:border-stone-400 transition-colors"
            :disabled="!isConnected"
          />

          <button
            @click="recordTask"
            :disabled="!isConnected || isRecordingTask"
            class="px-6 py-2.5 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 transition-colors"
          >{{ isRecordingTask ? 'Recording…' : 'Record Task' }}</button>
        </div>

        <!-- Slash -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">Slash (−80 pts)</p>
          <div class="flex gap-2">
            <input
              v-model="repSlashReason"
              placeholder="Reason for slash…"
              class="flex-1 bg-stone-50 border border-stone-200 px-3 py-2 text-xs text-stone-700 outline-none focus:border-stone-400 transition-colors"
              :disabled="!isConnected"
            />
            <button
              @click="slashSelf"
              :disabled="!isConnected || !repSlashReason.trim() || isSlashing"
              class="px-4 py-2 bg-red-700 text-white text-xs tracking-widest uppercase hover:bg-red-800 disabled:opacity-30 transition-colors"
            >{{ isSlashing ? 'Slashing…' : 'Slash' }}</button>
          </div>
        </div>

        <!-- Commit Snapshot -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs tracking-widest uppercase text-stone-400">Anchor Score On-Chain</p>
            <button
              @click="commitSnapshot"
              :disabled="!isConnected || isCommittingSnapshot"
              class="px-4 py-2 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 transition-colors"
            >{{ isCommittingSnapshot ? 'Committing…' : 'Commit Snapshot' }}</button>
          </div>
          <div v-if="lastRepSnapshot" class="bg-emerald-50 border border-emerald-200 p-3 rounded-sm space-y-1">
            <p class="text-xs text-emerald-700">✓ Snapshot committed — score={{ lastRepSnapshot.score }} tier={{ lastRepSnapshot.tier }}</p>
            <a v-if="lastRepSnapshot.explorerUrl" :href="lastRepSnapshot.explorerUrl" target="_blank"
               class="text-xs text-stone-500 underline">View on Solscan ↗</a>
          </div>
        </div>

        <!-- Event log -->
        <div v-if="selfRep && selfRep.events.length > 0" class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">Event Log ({{ selfRep.events.length }})</p>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            <div
              v-for="evt in [...selfRep.events].reverse()"
              :key="evt.eventId"
              class="flex items-start gap-3 text-xs border-b border-stone-100 pb-2"
            >
              <span
                class="font-mono font-semibold flex-shrink-0 w-10 text-right"
                :class="evt.delta > 0 ? 'text-emerald-600' : 'text-red-600'"
              >{{ evt.delta > 0 ? '+' : '' }}{{ evt.delta }}</span>
              <div class="flex-1">
                <p class="text-stone-700">{{ evt.description }}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="text-stone-400">{{ new Date(evt.timestamp).toLocaleTimeString() }}</span>
                  <a v-if="evt.explorerUrl" :href="evt.explorerUrl" target="_blank"
                     class="text-stone-400 underline hover:text-stone-600">Solscan ↗</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- How it works -->
        <div class="border border-stone-200 bg-white/70 p-5">
          <p class="text-xs tracking-widest uppercase text-stone-400 mb-3">Scoring System</p>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="flex items-center gap-2"><span class="text-emerald-600 font-mono w-8">+25</span><span class="text-stone-600">Task success</span></div>
            <div class="flex items-center gap-2"><span class="text-amber-600 font-mono w-8">+8</span><span class="text-stone-600">Partial completion</span></div>
            <div class="flex items-center gap-2"><span class="text-red-600 font-mono w-8">-15</span><span class="text-stone-600">Task failure</span></div>
            <div class="flex items-center gap-2"><span class="text-red-700 font-mono w-8">-80</span><span class="text-stone-600">Slash (malicious)</span></div>
            <div class="flex items-center gap-2"><span class="text-emerald-600 font-mono w-8">+10</span><span class="text-stone-600">Credential issued</span></div>
          </div>
          <div class="mt-3 space-y-1 text-xs text-stone-500">
            <p>Tiers: <span class="text-blue-500">Newcomer</span> (100+) → <span class="text-emerald-600">Trusted</span> (350+) → <span class="text-violet-600">Verified</span> (600+) → <span class="text-yellow-600">Elite</span> (800+)</p>
            <p>Each event is committed on-chain via Solana Memo — tamper-proof audit trail.</p>
          </div>
        </div>

      </div>

      <!-- ── TEAMS TAB ── -->
      <div v-if="activeTab === 'teams'" class="space-y-4">

        <!-- Create Team -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <p class="text-xs tracking-widest uppercase text-stone-400">Create Team Vault</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-stone-400 mb-1 block">Team Name</label>
              <input
                v-model="teamName"
                placeholder="e.g. Trading Alpha Squad"
                class="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 focus:outline-none focus:border-stone-400"
              />
            </div>
            <div>
              <label class="text-xs text-stone-400 mb-1 block">Threshold (m-of-1)</label>
              <input
                v-model.number="teamThreshold"
                type="number"
                min="1"
                class="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 focus:outline-none focus:border-stone-400"
              />
            </div>
          </div>
          <div>
            <label class="text-xs text-stone-400 mb-1 block">Description (optional)</label>
            <input
              v-model="teamDescription"
              placeholder="Describe this team vault…"
              class="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 focus:outline-none focus:border-stone-400"
            />
          </div>
          <button
            @click="createTeam"
            :disabled="!isConnected || isCreatingTeam || !teamName.trim()"
            class="w-full py-2 text-xs tracking-widest uppercase border border-stone-800 bg-stone-800 text-stone-100 hover:bg-stone-700 disabled:opacity-30 transition-colors"
          >
            {{ isCreatingTeam ? 'Creating…' : '+ Create Team Vault' }}
          </button>
          <div v-if="lastTeamTx && teams.length > 0" class="text-xs text-stone-400">
            Last tx:
            <a :href="`https://solscan.io/tx/${lastTeamTx}?cluster=devnet`" target="_blank" class="text-emerald-600 font-mono hover:underline">
              {{ lastTeamTx.slice(0, 20) }}…
            </a>
          </div>
        </div>

        <!-- Teams List -->
        <div v-if="teams.length > 0" class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">Your Teams</p>
          <div
            v-for="team in teams"
            :key="team.id"
            @click="selectTeam(team)"
            class="p-3 border cursor-pointer transition-colors"
            :class="selectedTeam?.id === team.id ? 'border-stone-800 bg-stone-800/5' : 'border-stone-100 hover:border-stone-300'"
          >
            <div class="flex items-center justify-between mb-1">
              <p class="text-sm font-medium text-stone-800">{{ team.name }}</p>
              <span class="text-xs text-stone-400">{{ team.members.length }} members · {{ team.threshold }}-of-{{ team.members.length }}</span>
            </div>
            <p v-if="team.description" class="text-xs text-stone-500">{{ team.description }}</p>
            <div class="flex items-center gap-2 mt-2 flex-wrap">
              <span
                v-for="m in team.members"
                :key="m.publicKey"
                class="px-2 py-0.5 text-xs rounded"
                :class="roleBadge(m.role)"
              >
                {{ m.displayName || m.publicKey.slice(0, 6) + '…' }} · {{ roleLabel(m.role) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Selected Team: Secrets -->
        <div v-if="selectedTeam" class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <p class="text-xs tracking-widest uppercase text-stone-400">Secrets — {{ selectedTeam.name }}</p>

          <!-- Store Secret Form -->
          <div class="space-y-2 pb-4 border-b border-stone-100">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                v-model="secretLabel"
                placeholder="Label (e.g. API Key)"
                class="px-3 py-2 text-sm bg-stone-50 border border-stone-200 focus:outline-none focus:border-stone-400"
              />
              <input
                v-model="secretDescription"
                placeholder="Description (optional)"
                class="px-3 py-2 text-sm bg-stone-50 border border-stone-200 focus:outline-none focus:border-stone-400"
              />
            </div>
            <textarea
              v-model="secretData"
              placeholder='Secret data — plain text or JSON (e.g. {"key":"sk-...","tier":"pro"})'
              rows="2"
              class="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 focus:outline-none focus:border-stone-400 resize-none font-mono"
            />
            <button
              @click="storeSecret"
              :disabled="!isConnected || isStoringSecret || !secretLabel.trim() || !secretData.trim()"
              class="w-full py-2 text-xs tracking-widest uppercase border border-stone-800 bg-stone-800 text-stone-100 hover:bg-stone-700 disabled:opacity-30 transition-colors"
            >
              {{ isStoringSecret ? 'Encrypting + Storing…' : 'Store Secret (AES-256-GCM)' }}
            </button>
          </div>

          <!-- Secrets List -->
          <div v-if="selectedTeam.secrets && selectedTeam.secrets.length > 0" class="space-y-2">
            <div
              v-for="secret in selectedTeam.secrets"
              :key="secret.id"
              class="flex items-center justify-between p-3 bg-stone-50 border border-stone-100"
            >
              <div>
                <p class="text-sm font-medium text-stone-700">{{ secret.label }}</p>
                <p v-if="secret.description" class="text-xs text-stone-400">{{ secret.description }}</p>
                <a
                  v-if="secret.explorerUrl"
                  :href="secret.explorerUrl"
                  target="_blank"
                  class="text-xs text-emerald-600 hover:underline font-mono"
                >
                  ↗ on-chain
                </a>
              </div>
              <button
                @click="retrieveSecret(secret.id)"
                :disabled="!isConnected"
                class="px-3 py-1 text-xs border border-stone-300 text-stone-600 hover:border-stone-600 disabled:opacity-30 transition-colors"
              >
                Decrypt
              </button>
            </div>
          </div>
          <p v-else class="text-xs text-stone-400 italic">No secrets stored yet.</p>

          <!-- Retrieved Secret -->
          <div v-if="retrievedSecret" class="bg-emerald-50 border border-emerald-200 p-4 space-y-1">
            <p class="text-xs tracking-widest uppercase text-emerald-500">Decrypted Secret</p>
            <p class="text-sm font-medium text-stone-700">{{ retrievedSecret.label }}</p>
            <pre class="text-xs text-stone-600 bg-white border border-emerald-100 p-2 rounded overflow-auto">{{ JSON.stringify(retrievedSecret.data, null, 2) }}</pre>
          </div>

          <!-- Event Log -->
          <div v-if="selectedTeam.eventLog && selectedTeam.eventLog.length > 0" class="space-y-1">
            <p class="text-xs tracking-widest uppercase text-stone-400 mb-2">Event Log</p>
            <div
              v-for="(ev, i) in [...selectedTeam.eventLog].reverse().slice(0, 5)"
              :key="i"
              class="flex items-start gap-2 text-xs text-stone-500"
            >
              <span class="text-stone-300 shrink-0 font-mono">{{ new Date(ev.timestamp).toLocaleTimeString() }}</span>
              <span class="font-medium text-stone-600">{{ ev.type.replace(/_/g, ' ') }}</span>
              <a v-if="ev.onChainTx" :href="`https://solscan.io/tx/${ev.onChainTx}?cluster=devnet`" target="_blank" class="text-emerald-600 hover:underline shrink-0">↗</a>
            </div>
          </div>
        </div>

        <!-- Info Box -->
        <div class="border border-stone-100 p-4 text-xs text-stone-500 space-y-1 leading-relaxed">
          <p class="text-xs tracking-widest uppercase text-stone-400 mb-2">How Team Vaults Work</p>
          <p>Team Vaults add organizational management (roles, invites, named secrets) on top of the cryptographic Group Vault primitive.</p>
          <p>Secrets are encrypted with <span class="font-mono text-stone-700">AES-256-GCM</span> using a team key distributed via <span class="font-mono text-stone-700">Shamir's Secret Sharing (m-of-n SSS)</span> over GF(256).</p>
          <p>Every event — team creation, member invite, secret store — is committed on-chain via Solana Memo. Tamper-proof audit trail.</p>
          <p>Roles: <span class="font-medium text-yellow-700">Owner</span> (full control), <span class="font-medium text-violet-700">Admin</span> (manage members/secrets), <span class="font-medium text-stone-700">Member</span> (read secrets).</p>
        </div>

      </div>

      <!-- ── IDENTITY (DID) TAB ── -->
      <div v-if="activeTab === 'did'" class="space-y-4">

        <!-- Self DID Card -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-xs tracking-widest uppercase text-stone-400">Agent Identity (DID)</p>
            <button
              @click="fetchDID"
              :disabled="!isConnected || isLoadingDID"
              class="px-3 py-1 text-xs tracking-widest uppercase border border-stone-200 text-stone-500 hover:border-stone-400 disabled:opacity-30 transition-colors"
            >
              {{ isLoadingDID ? 'Loading…' : 'Refresh' }}
            </button>
          </div>

          <div v-if="selfDID" class="space-y-3">
            <!-- DID -->
            <div class="bg-stone-50 border border-stone-200 p-3 rounded-sm">
              <p class="text-xs text-stone-400 mb-1">DID</p>
              <p class="font-mono text-xs text-stone-700 break-all">{{ selfDID }}</p>
            </div>

            <!-- Document summary -->
            <div v-if="didDocument" class="grid grid-cols-2 gap-3">
              <div class="bg-stone-50 border border-stone-100 p-3 rounded-sm">
                <p class="text-xs text-stone-400 mb-1">Agent Type</p>
                <p class="text-sm text-stone-700">{{ didDocument.kage?.agentType }}</p>
              </div>
              <div class="bg-stone-50 border border-stone-100 p-3 rounded-sm">
                <p class="text-xs text-stone-400 mb-1">Network</p>
                <p class="text-sm text-stone-700">{{ didDocument.kage?.network }}</p>
              </div>
              <div class="bg-stone-50 border border-stone-100 p-3 rounded-sm col-span-2">
                <p class="text-xs text-stone-400 mb-1">Capabilities</p>
                <div class="flex flex-wrap gap-1 mt-1">
                  <span
                    v-for="cap in didDocument.kage?.capabilities"
                    :key="cap"
                    class="text-xs px-2 py-0.5 bg-stone-200 text-stone-600 rounded-full font-mono"
                  >{{ cap }}</span>
                </div>
              </div>
              <div class="bg-stone-50 border border-stone-100 p-3 rounded-sm col-span-2">
                <p class="text-xs text-stone-400 mb-1">X25519 Viewing Key</p>
                <p class="font-mono text-xs text-stone-600 break-all">{{ didDocument.kage?.x25519ViewingPub }}</p>
              </div>
              <div class="bg-stone-50 border border-stone-100 p-3 rounded-sm">
                <p class="text-xs text-stone-400 mb-1">Reasoning</p>
                <span class="text-xs" :class="didDocument.kage?.reasoningEnabled ? 'text-emerald-600' : 'text-stone-400'">
                  {{ didDocument.kage?.reasoningEnabled ? '✓ Enabled' : '✗ Disabled' }}
                </span>
              </div>
              <div class="bg-stone-50 border border-stone-100 p-3 rounded-sm">
                <p class="text-xs text-stone-400 mb-1">Verification Methods</p>
                <p class="text-sm text-stone-700">{{ didDocument.verificationMethod?.length ?? 0 }}</p>
              </div>
            </div>

            <!-- Full document toggle -->
            <details class="text-xs">
              <summary class="cursor-pointer text-stone-400 hover:text-stone-600 select-none">View full DID Document JSON</summary>
              <pre class="mt-2 bg-stone-950 text-stone-100 p-3 rounded-sm overflow-x-auto text-xs leading-relaxed">{{ JSON.stringify(didDocument, null, 2) }}</pre>
            </details>
          </div>
          <p v-else class="text-xs text-stone-400">Click Refresh to load DID document…</p>
        </div>

        <!-- Issue Credential -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <p class="text-xs tracking-widest uppercase text-stone-400">Issue Verifiable Credential</p>

          <div class="space-y-1">
            <label class="text-xs text-stone-500 tracking-wide">Subject DID</label>
            <input
              v-model="credSubjectDID"
              :placeholder="selfDID || 'did:sol:…'"
              class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-mono text-stone-700 outline-none focus:border-stone-400 transition-colors"
              :disabled="!isConnected"
            />
            <p class="text-xs text-stone-400">Leave empty to issue to self</p>
          </div>

          <div class="space-y-1">
            <label class="text-xs text-stone-500 tracking-wide">Credential Type</label>
            <select
              v-model="credType"
              class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs text-stone-700 outline-none focus:border-stone-400 transition-colors"
              :disabled="!isConnected"
            >
              <option>AgentCapability</option>
              <option>TradingPermission</option>
              <option>AuditClearance</option>
              <option>GroupMembership</option>
              <option>ReasoningAccess</option>
            </select>
          </div>

          <div class="space-y-1">
            <label class="text-xs text-stone-500 tracking-wide">Claim (JSON)</label>
            <textarea
              v-model="credClaim"
              rows="3"
              class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-mono text-stone-700 outline-none focus:border-stone-400 transition-colors resize-none"
              :disabled="!isConnected"
            ></textarea>
          </div>

          <button
            @click="issueCredential"
            :disabled="!isConnected || !credClaim.trim() || isIssuingCred"
            class="px-6 py-2.5 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {{ isIssuingCred ? 'Issuing…' : 'Issue Credential' }}
          </button>

          <!-- Last issued -->
          <div v-if="lastIssuedCred" class="bg-emerald-50 border border-emerald-200 p-3 rounded-sm space-y-2">
            <p class="text-xs text-emerald-700 font-medium">✓ Credential issued</p>
            <p class="text-xs text-stone-500 font-mono">ID: {{ lastIssuedCred.credentialId }}</p>
            <p class="text-xs text-stone-500">Type: {{ lastIssuedCred.type }}</p>
            <a v-if="lastIssuedCred.explorerUrl" :href="lastIssuedCred.explorerUrl" target="_blank"
               class="text-xs text-stone-500 underline block">View on Solscan ↗</a>
            <button
              @click="fillLastCredForVerify"
              class="text-xs text-stone-500 underline hover:text-stone-700"
            >Copy to verifier →</button>
          </div>
        </div>

        <!-- Verify Credential -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <p class="text-xs tracking-widest uppercase text-stone-400">Verify Credential</p>

          <div class="space-y-1">
            <label class="text-xs text-stone-500 tracking-wide">Credential JSON</label>
            <textarea
              v-model="verifyCredJson"
              rows="5"
              placeholder='Paste credential JSON here…'
              class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-mono text-stone-700 outline-none focus:border-stone-400 transition-colors resize-none"
              :disabled="!isConnected"
            ></textarea>
          </div>

          <button
            @click="verifyCred"
            :disabled="!isConnected || !verifyCredJson.trim()"
            class="px-6 py-2.5 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Verify
          </button>

          <div v-if="verifyResult" class="flex items-center gap-2 p-3 rounded-sm"
               :class="verifyResult.valid ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'">
            <span class="text-sm">{{ verifyResult.valid ? '✓' : '✗' }}</span>
            <div>
              <p class="text-xs font-medium" :class="verifyResult.valid ? 'text-emerald-700' : 'text-red-700'">
                {{ verifyResult.valid ? 'Credential valid' : 'Invalid credential' }}
              </p>
              <p v-if="verifyResult.reason" class="text-xs text-stone-500">{{ verifyResult.reason }}</p>
            </div>
          </div>
        </div>

        <!-- Credentials list -->
        <div v-if="didCredentials.length > 0" class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <p class="text-xs tracking-widest uppercase text-stone-400">Issued Credentials ({{ didCredentials.length }})</p>
          <div v-for="cred in didCredentials" :key="cred.credentialId"
               class="border border-stone-100 p-3 rounded-sm space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-stone-700">{{ cred.type }}</span>
              <span class="text-xs text-stone-400">{{ new Date(cred.issuedAt).toLocaleTimeString() }}</span>
            </div>
            <p class="text-xs font-mono text-stone-500">{{ cred.credentialId }}</p>
            <p class="text-xs text-stone-500">Subject: {{ cred.subject.slice(8, 20) }}…</p>
            <a v-if="cred.explorerUrl" :href="cred.explorerUrl" target="_blank"
               class="text-xs text-stone-400 underline">Solscan ↗</a>
          </div>
        </div>

        <!-- How it works -->
        <div class="border border-stone-200 bg-white/70 p-5">
          <p class="text-xs tracking-widest uppercase text-stone-400 mb-3">How DID Works</p>
          <ol class="space-y-2 text-xs text-stone-600 list-none pl-0">
            <li class="flex gap-2"><span class="text-stone-300 select-none">1.</span>Agent's Solana pubkey becomes its <span class="font-mono text-stone-700">did:sol:&lt;pubkey&gt;</span></li>
            <li class="flex gap-2"><span class="text-stone-300 select-none">2.</span>DID Document lists Ed25519 signing key + X25519 encryption key</li>
            <li class="flex gap-2"><span class="text-stone-300 select-none">3.</span>Issuer signs credential claim with their keypair → claimHash + signature</li>
            <li class="flex gap-2"><span class="text-stone-300 select-none">4.</span>Credential hash committed on-chain via Solana Memo (tamper-proof)</li>
            <li class="flex gap-2"><span class="text-stone-300 select-none">5.</span>Any agent can verify: recompute hash → check signature → check chain</li>
          </ol>
        </div>

      </div>

      <!-- ZK Proofs tab -->
      <div v-if="activeTab === 'zk'" class="max-w-2xl mx-auto space-y-6 p-6">

        <!-- Create Commitment -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-4">
          <p class="text-xs tracking-widest uppercase text-stone-400">Create ZK Commitment</p>

          <!-- Type selector -->
          <div class="flex gap-2">
            <button v-for="t in ['reputation', 'memory', 'task']" :key="t"
              @click="zkCommitType = t as any"
              class="px-3 py-1.5 text-xs rounded-sm transition-colors"
              :class="zkCommitType === t ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'">
              {{ t.charAt(0).toUpperCase() + t.slice(1) }}
            </button>
          </div>

          <!-- Reputation form -->
          <div v-if="zkCommitType === 'reputation'" class="space-y-3">
            <div class="space-y-1">
              <label class="text-xs text-stone-500 tracking-wide">Claimed Score</label>
              <input v-model.number="zkRepScore" type="number"
                class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-mono text-stone-700 outline-none focus:border-stone-400 transition-colors" />
            </div>
            <p class="text-[10px] text-stone-400">Events: {{ zkRepEvents.length }} event(s) pre-configured</p>
          </div>

          <!-- Memory form -->
          <div v-if="zkCommitType === 'memory'" class="space-y-3">
            <div class="space-y-1">
              <label class="text-xs text-stone-500 tracking-wide">Memory Type</label>
              <select v-model="zkMemType"
                class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs text-stone-700 outline-none focus:border-stone-400 transition-colors">
                <option value="episodic">Episodic</option>
                <option value="semantic">Semantic</option>
                <option value="procedural">Procedural</option>
              </select>
            </div>
          </div>

          <!-- Task form -->
          <div v-if="zkCommitType === 'task'" class="space-y-3">
            <div class="space-y-1">
              <label class="text-xs text-stone-500 tracking-wide">Outcome</label>
              <select v-model="zkTaskOutcome"
                class="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-xs text-stone-700 outline-none focus:border-stone-400 transition-colors">
                <option value="success">Success</option>
                <option value="partial">Partial</option>
                <option value="failure">Failure</option>
              </select>
            </div>
          </div>

          <button
            @click="createZKCommitment"
            :disabled="isCreatingCommitment"
            class="px-6 py-2.5 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            {{ isCreatingCommitment ? 'Committing...' : 'Create Commitment' }}
          </button>
        </div>

        <!-- Verify result -->
        <div v-if="zkVerifyResult" class="flex items-center gap-2 p-3 rounded-sm"
             :class="zkVerifyResult.valid ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'">
          <span class="text-sm">{{ zkVerifyResult.valid ? 'V' : 'X' }}</span>
          <div>
            <p class="text-xs font-medium" :class="zkVerifyResult.valid ? 'text-emerald-700' : 'text-red-700'">
              {{ zkVerifyResult.valid ? 'Commitment verified' : 'Verification failed' }}
            </p>
            <p v-if="zkVerifyResult.reason" class="text-xs text-stone-500">{{ zkVerifyResult.reason }}</p>
          </div>
        </div>

        <!-- Prover Service Status -->
        <div class="border border-stone-200 bg-white/70 p-4 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" :class="proverServiceAvailable ? 'bg-emerald-400' : 'bg-stone-300'"></span>
            <p class="text-xs text-stone-500">
              Prover Service: <span class="font-medium" :class="proverServiceAvailable ? 'text-emerald-600' : 'text-stone-400'">{{ proverServiceAvailable ? 'Online' : 'Offline' }}</span>
            </p>
          </div>
          <div v-if="proverServiceAvailable" class="flex items-center gap-2">
            <span class="text-[10px] px-2 py-0.5 rounded-sm bg-stone-100 text-stone-600 uppercase tracking-wider">{{ proverServiceMode }}</span>
          </div>
          <button @click="checkProverHealth" class="text-[10px] text-stone-400 hover:text-stone-600 underline">Check</button>
        </div>

        <!-- Commitments list -->
        <div class="border border-stone-200 bg-white/70 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs tracking-widest uppercase text-stone-400">Commitments ({{ zkCommitments.length }})</p>
            <button @click="fetchZKCommitments" class="text-[10px] text-stone-400 hover:text-stone-600 underline">Refresh</button>
          </div>

          <div v-if="zkCommitments.length === 0" class="text-xs text-stone-400 py-4 text-center">No commitments yet</div>

          <div v-for="c in zkCommitments" :key="c.id"
               class="border border-stone-100 p-3 rounded-sm space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-stone-700 capitalize">{{ c.proofType }}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-sm"
                :class="{
                  'bg-amber-100 text-amber-700': c.status === 'pending',
                  'bg-emerald-100 text-emerald-700': c.status === 'verified',
                  'bg-blue-100 text-blue-700': c.status === 'proved',
                  'bg-red-100 text-red-700': c.status === 'failed',
                }">{{ c.status }}</span>
            </div>
            <p class="text-[10px] font-mono text-stone-500 truncate">ID: {{ c.id }}</p>
            <p class="text-[10px] font-mono text-stone-400 truncate">Output hash: {{ c.outputHash.slice(0, 24) }}...</p>
            <p v-if="c.vkey" class="text-[10px] font-mono text-emerald-600 truncate">vkey: {{ c.vkey.slice(0, 24) }}...</p>
            <p class="text-[10px] text-stone-400">{{ new Date(c.createdAt).toLocaleString() }}</p>

            <!-- Proof status indicator -->
            <div v-if="proofStatusMap[c.id]" class="mt-1 p-2 bg-stone-50 rounded-sm space-y-1">
              <div class="flex items-center gap-2">
                <span v-if="proofStatusMap[c.id].status === 'proving' || proofStatusMap[c.id].status === 'queued'"
                  class="inline-block w-3 h-3 border-2 border-stone-400 border-t-transparent rounded-full animate-spin"></span>
                <span class="text-[10px] font-medium uppercase tracking-wider"
                  :class="{
                    'text-amber-600': proofStatusMap[c.id].status === 'queued',
                    'text-blue-600': proofStatusMap[c.id].status === 'proving',
                    'text-emerald-600': proofStatusMap[c.id].status === 'completed',
                    'text-red-600': proofStatusMap[c.id].status === 'failed',
                  }">{{ proofStatusMap[c.id].status }}</span>
                <span class="text-[10px] text-stone-400">({{ proofStatusMap[c.id].mode }})</span>
              </div>
              <p v-if="proofStatusMap[c.id].error" class="text-[10px] text-red-500">{{ proofStatusMap[c.id].error }}</p>
              <a v-if="proofStatusMap[c.id].explorer_url" :href="proofStatusMap[c.id].explorer_url!" target="_blank"
                class="text-[10px] text-blue-500 underline">Succinct Explorer</a>
            </div>

            <!-- On-chain verification result -->
            <div v-if="onChainVerifications[c.id]" class="mt-1.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-sm space-y-1">
              <div class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
                <span class="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Verified On-Chain</span>
              </div>
              <p class="text-[10px] font-mono text-emerald-600 truncate">PDA: {{ onChainVerifications[c.id].verificationPda }}</p>
              <a :href="`https://solscan.io/tx/${onChainVerifications[c.id].txSignature}?cluster=devnet`"
                target="_blank" class="text-[10px] text-emerald-500 underline">View tx on Solscan</a>
            </div>

            <div class="flex gap-2 pt-1 flex-wrap">
              <button @click="verifyZKCommitment(c.id)"
                class="text-[10px] text-stone-500 underline hover:text-stone-700">Verify Hash</button>
              <button v-if="proverServiceAvailable && c.status !== 'proved'"
                @click="requestProof(c.id)"
                :disabled="isProvingCommitment === c.id"
                class="text-[10px] px-2 py-0.5 bg-stone-800 text-white rounded-sm hover:bg-stone-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {{ isProvingCommitment === c.id ? 'Generating...' : 'Generate SP1 Proof' }}
              </button>
              <button v-if="c.status === 'proved' && proofStatusMap[c.id]?.groth16_proof && !onChainVerifications[c.id]"
                @click="verifyOnChain(c.id)"
                :disabled="isVerifyingOnChain === c.id"
                class="text-[10px] px-2 py-0.5 bg-violet-700 text-white rounded-sm hover:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {{ isVerifyingOnChain === c.id ? 'Verifying...' : 'Verify On-Chain' }}
              </button>
              <a v-if="c.txSignature" :href="`https://solscan.io/tx/${c.txSignature}?cluster=devnet`" target="_blank"
                class="text-[10px] text-stone-400 underline">Solscan</a>
              <a v-if="c.explorerUrl" :href="c.explorerUrl" target="_blank"
                class="text-[10px] text-blue-400 underline">Succinct Explorer</a>
            </div>
          </div>
        </div>

        <!-- How it works -->
        <div class="border border-stone-200 bg-white/70 p-5">
          <p class="text-xs tracking-widest uppercase text-stone-400 mb-3">How ZK Proofs Work</p>
          <ol class="space-y-2 text-xs text-stone-600 list-none pl-0">
            <li class="flex gap-2"><span class="text-stone-300 select-none">1.</span>Agent creates a hash commitment from private inputs (reputation events, memory data, or task results)</li>
            <li class="flex gap-2"><span class="text-stone-300 select-none">2.</span>Commitment is anchored on Solana via Memo program (tamper-proof timestamp)</li>
            <li class="flex gap-2"><span class="text-stone-300 select-none">3.</span>Click "Generate SP1 Proof" to submit to Succinct Network for Groth16 proof generation</li>
            <li class="flex gap-2"><span class="text-stone-300 select-none">4.</span>The prover service generates a real ZK proof asynchronously (30s-2min)</li>
            <li class="flex gap-2"><span class="text-stone-300 select-none">5.</span>Click "Verify On-Chain" to submit the Groth16 proof to the Kage Solana program</li>
            <li class="flex gap-2"><span class="text-stone-300 select-none">6.</span>The on-chain verifier validates the proof using BN254 precompiles and stores the result in a PDA</li>
          </ol>
        </div>

      </div>

        </div>
      </main>

    </div>
  </div>
</template>

<style scoped>
/* Reasoning step slide-in animation */
.step-fade-enter-active {
  transition: all 0.35s ease;
}
.step-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.step-fade-enter-to {
  opacity: 1;
  transform: translateY(0);
}
</style>
