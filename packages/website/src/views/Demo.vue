<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { RouterLink } from 'vue-router';

const WS_URL = import.meta.env.VITE_API_WS_URL || 'ws://localhost:3002';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface StoreProof {
  cid?: string;
  txSignature?: string;
  explorerUrl?: string;
  umbraProof?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  time: string;
  proof?: StoreProof | null;
}

interface Memory {
  index: number;
  id: string;
  type: string;
  time: string;
}

const messages = ref<ChatMessage[]>([]);
const input = ref('');
const isConnected = ref(false);
const isTyping = ref(false);
const agentId = ref('');
const memories = ref<Memory[]>([]);
const showMemories = ref(false);
const messagesEl = ref<HTMLElement | null>(null);
const mobileMenuOpen = ref(false);

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
      messages.value.push({
        role: 'system',
        text: `Agent connected. ID: ${msg.agentId.slice(0, 12)}…`,
        time: now(),
      });
      scrollToBottom();
    } else if (msg.type === 'typing') {
      isTyping.value = true;
      scrollToBottom();
    } else if (msg.type === 'message') {
      isTyping.value = false;
      messages.value.push({
        role: 'assistant',
        text: msg.text,
        time: now(),
        proof: msg.proof ?? null,
      });
      scrollToBottom();
    } else if (msg.type === 'memories') {
      memories.value = msg.memories;
      showMemories.value = true;
    } else if (msg.type === 'error') {
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

onMounted(() => {
  connect();
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

      <!-- Memory Panel -->
      <div
        v-if="showMemories"
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

      <!-- Chat Window -->
      <div class="border border-stone-200 bg-white/70 rounded-sm overflow-hidden">

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

          <!-- Typing indicator -->
          <div v-if="isTyping" class="flex justify-start">
            <div class="bg-stone-50 border border-stone-200 px-4 py-3 rounded-sm">
              <div class="flex gap-1 items-center">
                <div class="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
              </div>
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
            <button
              @click="send"
              :disabled="!isConnected || !input.trim()"
              class="px-5 py-2.5 bg-stone-800 text-stone-100 text-xs tracking-widest uppercase hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              Send
            </button>
          </div>
          <p class="text-xs text-stone-400 mt-2">
            Try <span class="font-mono text-stone-500">/memories</span> to view your encrypted vault
          </p>
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
          <p class="text-sm text-stone-700">Claude Haiku</p>
        </div>
      </div>

    </main>

  </div>
</template>
