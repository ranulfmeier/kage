<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';

const activeSection = ref('overview');
const mobileNavOpen = ref(false);

function selectSection(sectionId: string) {
  activeSection.value = sectionId;
  mobileNavOpen.value = false;
}

const sections = [
  { id: 'overview', label: '概要', title: 'Overview' },
  { id: 'quickstart', label: '始', title: 'Quick Start' },
  { id: 'architecture', label: '構造', title: 'Architecture' },
  { id: 'sdk', label: '道具', title: 'SDK Reference' },
  { id: 'agent', label: '代理', title: 'Agent Setup' },
];

const codeExample = [
  'import { KageAgent } from "@kage/agent";',
  'import { Keypair } from "@solana/web3.js";',
  '',
  'const agent = new KageAgent(',
  '  {',
  '    rpcUrl: "https://api.devnet.solana.com",',
  '    programId: "KAGE...",',
  '    anthropicApiKey: process.env.ANTHROPIC_API_KEY,',
  '  },',
  '  Keypair.generate()',
  ');',
  '',
  'await agent.initialize();',
  '',
  '// Store encrypted memory',
  'await agent.chat("Remember: my API key is sk-secret-123");',
  '',
  '// Recall privately',
  'const response = await agent.chat("What\'s my API key?");',
].join('\n');
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
          <RouterLink to="/roadmap" class="text-kage-500 hover:text-kage-800 transition-colors">Roadmap</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-kage-500 hover:text-kage-800 transition-colors">GitHub</a>
        </nav>
      </div>

      <!-- Mobile section navigation -->
      <div v-if="mobileNavOpen" class="lg:hidden border-t border-kage-100 bg-white">
        <nav class="max-w-7xl mx-auto px-4 py-4 space-y-2">
          <button
            v-for="section in sections"
            :key="section.id"
            @click="selectSection(section.id)"
            class="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all"
            :class="activeSection === section.id 
              ? 'bg-kage-900 text-white' 
              : 'text-kage-600 hover:bg-kage-100'"
          >
            <span class="text-lg font-japanese" :class="activeSection === section.id ? 'text-accent-400' : 'text-kage-300'">
              {{ section.label }}
            </span>
            <span class="text-sm">{{ section.title }}</span>
          </button>
          <div class="border-t border-kage-100 pt-4 mt-4 flex gap-4">
            <RouterLink to="/roadmap" class="text-kage-500 hover:text-kage-800 transition-colors text-sm">Roadmap</RouterLink>
            <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-kage-500 hover:text-kage-800 transition-colors text-sm">GitHub</a>
          </div>
        </nav>
      </div>
    </header>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div class="grid lg:grid-cols-[240px_1fr] gap-8 lg:gap-12">
        <!-- Sidebar - Desktop only -->
        <aside class="hidden lg:block lg:sticky lg:top-24 lg:h-fit">
          <nav class="space-y-1">
            <button
              v-for="section in sections"
              :key="section.id"
              @click="activeSection = section.id"
              class="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all"
              :class="activeSection === section.id 
                ? 'bg-kage-900 text-white' 
                : 'text-kage-600 hover:bg-kage-100'"
            >
              <span class="text-lg font-japanese" :class="activeSection === section.id ? 'text-accent-400' : 'text-kage-300'">
                {{ section.label }}
              </span>
              <span class="text-sm">{{ section.title }}</span>
            </button>
          </nav>
        </aside>

        <!-- Content -->
        <main class="min-w-0">
          <!-- Overview -->
          <article v-show="activeSection === 'overview'" class="prose-custom">
            <div class="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              <span class="text-3xl sm:text-5xl font-japanese text-kage-200">概要</span>
              <h1 class="text-2xl sm:text-4xl font-display font-bold text-kage-900">Overview</h1>
            </div>

            <p class="text-base sm:text-xl text-kage-600 mb-8 sm:mb-12 leading-relaxed">
              Kage is a privacy-first memory protocol for AI agents on Solana. 
              It encrypts agent memories client-side and stores commitments on-chain, 
              ensuring only authorized parties can access sensitive data.
            </p>

            <div class="grid md:grid-cols-2 gap-6 sm:gap-8 mb-8 sm:mb-12">
              <div class="border-l-2 border-kage-200 pl-4 sm:pl-6">
                <h3 class="font-semibold text-kage-800 mb-2">The Problem</h3>
                <p class="text-kage-500 text-sm leading-relaxed">
                  AI agent memories are stored in centralized clouds or on public blockchains. Both expose sensitive data to leaks or surveillance.
                </p>
              </div>
              <div class="border-l-2 border-accent-400 pl-4 sm:pl-6">
                <h3 class="font-semibold text-kage-800 mb-2">The Solution</h3>
                <p class="text-kage-500 text-sm leading-relaxed">
                  Encrypt memories before they leave your device. Store encrypted blobs on IPFS. Commit only hashes to Solana. Share via viewing keys.
                </p>
              </div>
            </div>

            <h2 class="text-xl sm:text-2xl font-display font-bold text-kage-800 mt-10 sm:mt-16 mb-4 sm:mb-6">How It Works</h2>
            
            <div class="space-y-6">
              <div class="flex gap-6 items-start">
                <span class="text-2xl font-japanese text-accent-500 mt-1">壱</span>
                <div>
                  <h4 class="font-semibold text-kage-800">Store Memory</h4>
                  <p class="text-kage-500 text-sm">Agent calls storeMemory() with any data. Preferences, conversations, learned behaviors.</p>
                </div>
              </div>
              <div class="flex gap-6 items-start">
                <span class="text-2xl font-japanese text-accent-500 mt-1">弐</span>
                <div>
                  <h4 class="font-semibold text-kage-800">Client Encryption</h4>
                  <p class="text-kage-500 text-sm">SDK encrypts data using AES-256-GCM with your viewing key. Plaintext never leaves your device.</p>
                </div>
              </div>
              <div class="flex gap-6 items-start">
                <span class="text-2xl font-japanese text-accent-500 mt-1">参</span>
                <div>
                  <h4 class="font-semibold text-kage-800">IPFS Storage</h4>
                  <p class="text-kage-500 text-sm">Encrypted blob uploads to IPFS. Only the content-addressed hash (CID) is recorded.</p>
                </div>
              </div>
              <div class="flex gap-6 items-start">
                <span class="text-2xl font-japanese text-accent-500 mt-1">肆</span>
                <div>
                  <h4 class="font-semibold text-kage-800">On-chain Commit</h4>
                  <p class="text-kage-500 text-sm">Cryptographic commitment stored on Solana PDA. Ensures integrity without revealing content.</p>
                </div>
              </div>
              <div class="flex gap-6 items-start">
                <span class="text-2xl font-japanese text-accent-500 mt-1">伍</span>
                <div>
                  <h4 class="font-semibold text-kage-800">Recall Securely</h4>
                  <p class="text-kage-500 text-sm">Only viewing key holders can decrypt. Everyone else sees encrypted noise.</p>
                </div>
              </div>
            </div>
          </article>

          <!-- Quick Start -->
          <article v-show="activeSection === 'quickstart'" class="prose-custom">
            <div class="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              <span class="text-3xl sm:text-5xl font-japanese text-kage-200">始</span>
              <h1 class="text-2xl sm:text-4xl font-display font-bold text-kage-900">Quick Start</h1>
            </div>

            <div class="space-y-6 sm:space-y-8">
              <div>
                <h3 class="flex items-center gap-3 text-base sm:text-lg font-semibold text-kage-800 mb-3 sm:mb-4">
                  <span class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-accent-500 text-white flex items-center justify-center text-xs sm:text-sm flex-shrink-0">1</span>
                  Install
                </h3>
                <div class="bg-kage-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm text-kage-100 overflow-x-auto">
                  pnpm add @kage/agent @kage/sdk
                </div>
              </div>

              <div>
                <h3 class="flex items-center gap-3 text-base sm:text-lg font-semibold text-kage-800 mb-3 sm:mb-4">
                  <span class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-accent-500 text-white flex items-center justify-center text-xs sm:text-sm flex-shrink-0">2</span>
                  Configure
                </h3>
                <div class="bg-kage-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm text-kage-100 overflow-x-auto">
                  <div class="text-kage-400"># .env</div>
                  ANTHROPIC_API_KEY=sk-ant-...<br>
                  SOLANA_RPC_URL=https://api.devnet.solana.com
                </div>
              </div>

              <div>
                <h3 class="flex items-center gap-3 text-base sm:text-lg font-semibold text-kage-800 mb-3 sm:mb-4">
                  <span class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-accent-500 text-white flex items-center justify-center text-xs sm:text-sm flex-shrink-0">3</span>
                  Initialize Agent
                </h3>
                <div class="bg-kage-900 rounded-lg p-4 sm:p-6 font-mono text-xs sm:text-sm overflow-x-auto">
                  <pre class="text-kage-100">{{ codeExample }}</pre>
                </div>
              </div>
            </div>
          </article>

          <!-- Architecture -->
          <article v-show="activeSection === 'architecture'" class="prose-custom">
            <div class="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              <span class="text-3xl sm:text-5xl font-japanese text-kage-200">構造</span>
              <h1 class="text-2xl sm:text-4xl font-display font-bold text-kage-900">Architecture</h1>
            </div>

            <p class="text-base sm:text-lg text-kage-600 mb-8 sm:mb-12 leading-relaxed">
              Kage uses a layered architecture. Each layer handles a specific concern, 
              making integration and extension straightforward.
            </p>

            <!-- Architecture diagram - minimal style -->
            <div class="border border-kage-200 rounded-lg overflow-hidden mb-12">
              <div class="bg-accent-50 p-6 border-b border-kage-200">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs text-kage-400 uppercase tracking-wide">Layer 1</span>
                    <h4 class="font-semibold text-kage-800">Agent Layer</h4>
                  </div>
                  <span class="font-mono text-sm text-kage-500">@kage/agent</span>
                </div>
                <p class="text-sm text-kage-500 mt-2">Eliza-compatible plugins, LLM integration, natural language commands</p>
              </div>
              <div class="bg-kage-50 p-6 border-b border-kage-200">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs text-kage-400 uppercase tracking-wide">Layer 2</span>
                    <h4 class="font-semibold text-kage-800">SDK Layer</h4>
                  </div>
                  <span class="font-mono text-sm text-kage-500">@kage/sdk</span>
                </div>
                <p class="text-sm text-kage-500 mt-2">Memory vault, encryption engine, storage adapters, tier system</p>
              </div>
              <div class="bg-white p-6 border-b border-kage-200">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs text-kage-400 uppercase tracking-wide">Layer 3</span>
                    <h4 class="font-semibold text-kage-800">Privacy Layer</h4>
                  </div>
                  <span class="font-mono text-sm text-kage-500">Umbra SDK</span>
                </div>
                <p class="text-sm text-kage-500 mt-2">Shielded pools, confidential transfers, viewing keys</p>
              </div>
              <div class="bg-kage-900 text-white p-6">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs text-kage-500 uppercase tracking-wide">Layer 4</span>
                    <h4 class="font-semibold">Storage Layer</h4>
                  </div>
                  <span class="font-mono text-sm text-kage-400">Solana + IPFS</span>
                </div>
                <p class="text-sm text-kage-400 mt-2">Anchor program PDAs, decentralized blob storage</p>
              </div>
            </div>
          </article>

          <!-- SDK Reference -->
          <article v-show="activeSection === 'sdk'" class="prose-custom">
            <div class="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              <span class="text-3xl sm:text-5xl font-japanese text-kage-200">道具</span>
              <h1 class="text-2xl sm:text-4xl font-display font-bold text-kage-900">SDK Reference</h1>
            </div>

            <div class="space-y-8 sm:space-y-12">
              <div>
                <h3 class="text-lg sm:text-xl font-semibold text-kage-800 mb-3 sm:mb-4">KageVault</h3>
                <p class="text-kage-500 mb-3 sm:mb-4 text-sm sm:text-base">Main interface for memory operations.</p>
                <div class="bg-kage-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm text-kage-100 overflow-x-auto">
<pre>const vault = new KageVault(config);

await vault.initialize(keypair);
await vault.storeMemory(content, type);
await vault.recallMemory(cid);
await vault.listMemories();
await vault.grantAccess(grantee, permissions);
await vault.revokeAccess(grantee);</pre>
                </div>
              </div>

              <div>
                <h3 class="text-lg sm:text-xl font-semibold text-kage-800 mb-3 sm:mb-4">EncryptionEngine</h3>
                <p class="text-kage-500 mb-3 sm:mb-4 text-sm sm:text-base">Client-side encryption utilities.</p>
                <div class="bg-kage-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm text-kage-100 overflow-x-auto">
<pre>const engine = new EncryptionEngine();

const { key } = await engine.generateKey();
const encrypted = await engine.encrypt(data, key);
const decrypted = await engine.decrypt(encrypted, key);
const hash = await engine.hash(data);</pre>
                </div>
              </div>

              <div>
                <h3 class="text-lg sm:text-xl font-semibold text-kage-800 mb-3 sm:mb-4">KageTierManager</h3>
                <p class="text-kage-500 mb-3 sm:mb-4 text-sm sm:text-base">Token-gated access control.</p>
                <div class="bg-kage-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm text-kage-100 overflow-x-auto">
<pre>const tiers = new KageTierManager(rpcUrl, kageMint);

const tier = await tiers.checkTier(wallet);
const features = await tiers.getFeatures(wallet);
const hasAccess = await tiers.hasAccess(wallet);</pre>
                </div>
              </div>
            </div>
          </article>

          <!-- Agent Setup -->
          <article v-show="activeSection === 'agent'" class="prose-custom">
            <div class="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              <span class="text-3xl sm:text-5xl font-japanese text-kage-200">代理</span>
              <h1 class="text-2xl sm:text-4xl font-display font-bold text-kage-900">Agent Setup</h1>
            </div>

            <p class="text-base sm:text-lg text-kage-600 mb-6 sm:mb-8 leading-relaxed">
              Kage agents use Eliza-compatible plugins for memory operations. 
              Natural language commands are automatically parsed into SDK calls.
            </p>

            <h3 class="text-lg sm:text-xl font-semibold text-kage-800 mb-3 sm:mb-4">Available Actions</h3>
            
            <div class="space-y-2 sm:space-y-3 mb-8 sm:mb-12">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-3 border-b border-kage-100 gap-1 sm:gap-4">
                <code class="text-xs sm:text-sm text-accent-600">store_memory</code>
                <span class="text-xs sm:text-sm text-kage-500">Save encrypted data to vault</span>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-3 border-b border-kage-100 gap-1 sm:gap-4">
                <code class="text-xs sm:text-sm text-accent-600">recall_memory</code>
                <span class="text-xs sm:text-sm text-kage-500">Retrieve and decrypt specific memory</span>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-3 border-b border-kage-100 gap-1 sm:gap-4">
                <code class="text-xs sm:text-sm text-accent-600">list_memories</code>
                <span class="text-xs sm:text-sm text-kage-500">List all stored memories</span>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-3 border-b border-kage-100 gap-1 sm:gap-4">
                <code class="text-xs sm:text-sm text-accent-600">search_memories</code>
                <span class="text-xs sm:text-sm text-kage-500">Search by tags or metadata</span>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-3 border-b border-kage-100 gap-1 sm:gap-4">
                <code class="text-xs sm:text-sm text-accent-600">grant_access</code>
                <span class="text-xs sm:text-sm text-kage-500">Share memory access with another wallet</span>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-3 border-b border-kage-100 gap-1 sm:gap-4">
                <code class="text-xs sm:text-sm text-accent-600">revoke_access</code>
                <span class="text-xs sm:text-sm text-kage-500">Remove previously granted access</span>
              </div>
            </div>

            <h3 class="text-lg sm:text-xl font-semibold text-kage-800 mb-3 sm:mb-4">Example Conversation</h3>
            <div class="bg-kage-50 rounded-lg p-4 sm:p-6 space-y-3 sm:space-y-4 font-mono text-xs sm:text-sm">
              <div class="flex gap-3">
                <span class="text-accent-500">User:</span>
                <span class="text-kage-700">"Remember that my trading strategy is to buy SOL dips below $100"</span>
              </div>
              <div class="flex gap-3">
                <span class="text-kage-400">Kage:</span>
                <span class="text-kage-600">"I've securely stored this as a preference memory. It's encrypted and only accessible by you."</span>
              </div>
              <div class="flex gap-3">
                <span class="text-accent-500">User:</span>
                <span class="text-kage-700">"What's my trading strategy?"</span>
              </div>
              <div class="flex gap-3">
                <span class="text-kage-400">Kage:</span>
                <span class="text-kage-600">"Your strategy is to buy SOL dips below $100."</span>
              </div>
            </div>
          </article>
        </main>
      </div>
    </div>
  </div>
</template>
