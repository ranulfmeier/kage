<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { RouterLink } from 'vue-router';

const WS_URL = import.meta.env.VITE_API_WS_URL || 'ws://localhost:3002';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

type ActiveTab = 'chat' | 'delegation' | 'messaging' | 'groups' | 'payments';

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
    } else if (msg.type === 'error') {
      isSendingPayment.value = false;
      isScanning.value = false;
      isDelegating.value = false;
      isSendingMsg.value = false;
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
});

onUnmounted(() => {
  ws?.close();
});
</script>

<template>
  <div class="min-h-screen bg-[#F5F0E8]" style="font-family: 'Shippori Mincho', serif;">

    <!-- Header -->
    <header class="fixed top-0 left-0 right-0 z-50 bg-[#F5F0E8]/95 backdrop-blur-sm border-b border-stone-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-3">
          <img src="/kage_logo.png" alt="Kage" class="h-10 sm:h-12 w-auto" />
        </RouterLink>
        <nav class="hidden sm:flex items-center gap-8">
          <RouterLink to="/docs" class="text-sm tracking-widest uppercase text-stone-500 hover:text-stone-900 transition-colors">Docs</RouterLink>
          <RouterLink to="/roadmap" class="text-sm tracking-widest uppercase text-stone-500 hover:text-stone-900 transition-colors">Roadmap</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-sm tracking-widest uppercase text-stone-500 hover:text-stone-900 transition-colors">GitHub</a>
        </nav>
        <button class="sm:hidden text-stone-700" @click="mobileMenuOpen = !mobileMenuOpen">
          <svg v-if="!mobileMenuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div v-if="mobileMenuOpen" class="sm:hidden border-t border-stone-200 bg-[#F5F0E8] px-6 py-4 flex flex-col gap-4">
        <RouterLink to="/docs" class="text-sm tracking-widest uppercase text-stone-600" @click="mobileMenuOpen = false">Docs</RouterLink>
        <RouterLink to="/roadmap" class="text-sm tracking-widest uppercase text-stone-600" @click="mobileMenuOpen = false">Roadmap</RouterLink>
        <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-sm tracking-widest uppercase text-stone-600">GitHub</a>
      </div>
    </header>

    <!-- Main -->
    <main class="pt-24 pb-12 px-4 sm:px-6 max-w-4xl mx-auto">

      <!-- Page Header -->
      <div class="mb-10 text-center">
        <p class="text-xs tracking-[0.3em] uppercase text-stone-400 mb-4">Live Demo</p>
        <h1 class="text-4xl sm:text-5xl font-light text-stone-900 mb-4">
          Chat with Kage
        </h1>
        <p class="text-stone-500 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          Your memories are encrypted on-device before leaving your browser.
          The agent runs on Solana devnet.
        </p>
      </div>

      <!-- Status Bar -->
      <div class="flex items-center justify-between mb-4 px-1">
        <div class="flex items-center gap-2">
          <div
            class="w-2 h-2 rounded-full transition-colors"
            :class="isConnected ? 'bg-emerald-500' : 'bg-stone-300'"
          ></div>
          <span class="text-xs text-stone-400 tracking-wide">
            {{ isConnected ? `Agent ${agentId.slice(0,8)}…` : 'Disconnected' }}
          </span>
        </div>
        <div class="flex items-center gap-3">
          <button
            v-if="isConnected"
            @click="fetchMemories"
            class="text-xs text-stone-400 hover:text-stone-700 tracking-widest uppercase transition-colors"
          >
            Memories
          </button>
          <button
            @click="connect"
            class="text-xs text-stone-400 hover:text-stone-700 tracking-widest uppercase transition-colors"
          >
            {{ isConnected ? 'Restart' : 'Connect' }}
          </button>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="flex gap-0 border border-stone-200 mb-4 w-fit overflow-x-auto">
        <button
          @click="activeTab = 'chat'"
          class="px-4 py-2 text-xs tracking-widest uppercase transition-colors whitespace-nowrap"
          :class="activeTab === 'chat' ? 'bg-stone-800 text-stone-100' : 'text-stone-500 hover:text-stone-800'"
        >
          Memory Vault
        </button>
        <button
          @click="activeTab = 'delegation'; fetchTasks()"
          class="px-4 py-2 text-xs tracking-widest uppercase transition-colors border-l border-stone-200 whitespace-nowrap"
          :class="activeTab === 'delegation' ? 'bg-stone-800 text-stone-100' : 'text-stone-500 hover:text-stone-800'"
        >
          Task Delegation
        </button>
        <button
          @click="activeTab = 'messaging'; fetchAgentX25519(); fetchInbox()"
          class="px-4 py-2 text-xs tracking-widest uppercase transition-colors border-l border-stone-200 whitespace-nowrap"
          :class="activeTab === 'messaging' ? 'bg-stone-800 text-stone-100' : 'text-stone-500 hover:text-stone-800'"
        >
          Messaging
        </button>
        <button
          @click="activeTab = 'groups'; fetchGroups(); fetchAgentX25519()"
          class="px-4 py-2 text-xs tracking-widest uppercase transition-colors border-l border-stone-200 whitespace-nowrap"
          :class="activeTab === 'groups' ? 'bg-stone-800 text-stone-100' : 'text-stone-500 hover:text-stone-800'"
        >
          Group Vaults
        </button>
        <button
          @click="activeTab = 'payments'; fetchPayments()"
          class="px-4 py-2 text-xs tracking-widest uppercase transition-colors border-l border-stone-200 whitespace-nowrap"
          :class="activeTab === 'payments' ? 'bg-stone-800 text-stone-100' : 'text-stone-500 hover:text-stone-800'"
        >
          Payments
        </button>
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
          class="h-[420px] sm:h-[500px] overflow-y-auto p-5 sm:p-6 space-y-5 scroll-smooth"
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
                      <span class="text-stone-400 font-mono">🔒</span>
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
              {{ deepThinkEnabled ? '🧠 Deep' : '🧠' }}
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
            · <span :class="deepThinkEnabled ? 'text-violet-500 font-medium' : 'text-stone-400'">🧠 Deep Think {{ deepThinkEnabled ? 'ON' : 'OFF' }}</span>
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
                {{ g.hasKey ? '🔓 key ready' : '🔒 locked' }}
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

      <!-- Info Row -->
      <div class="mt-8 grid grid-cols-3 gap-4 text-center">
        <div class="border border-stone-200 p-4">
          <p class="text-xs tracking-widest uppercase text-stone-400 mb-1">Network</p>
          <p class="text-sm text-stone-700">Solana Devnet</p>
        </div>
        <div class="border border-stone-200 p-4">
          <p class="text-xs tracking-widest uppercase text-stone-400 mb-1">Privacy</p>
          <p class="text-sm text-stone-700">Umbra Shielded</p>
        </div>
        <div class="border border-stone-200 p-4">
          <p class="text-xs tracking-widest uppercase text-stone-400 mb-1">Model</p>
          <p class="text-sm text-stone-700">{{ deepThinkEnabled ? 'Claude 3.7 Sonnet' : 'Claude Haiku' }}</p>
        </div>
      </div>

    </main>

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
