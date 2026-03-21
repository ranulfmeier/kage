<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';

const mobileMenuOpen = ref(false);

const phases = [
  {
    number: '壱',
    name: 'Core Protocol',
    status: 'done',
    items: [
      { text: 'Client-side AES-256-GCM encryption', done: true },
      { text: 'IPFS blob storage', done: true },
      { text: 'Solana PDA commitments', done: true },
      { text: 'Viewing key system', done: true },
      { text: 'Eliza-compatible plugins', done: true },
      { text: 'Devnet deployment', done: true },
    ],
  },
  {
    number: '弐',
    name: 'Privacy Layer',
    status: 'done',
    items: [
      { text: 'Umbra SDK integration', done: true },
      { text: 'Shielded memory proofs', done: true },
      { text: 'zkRune ownership proofs', done: true },
      { text: 'On-chain verification via Solscan', done: true },
    ],
  },
  {
    number: '参',
    name: 'Multi-Agent',
    status: 'done',
    items: [
      { text: 'Shielded task delegation', done: true },
      { text: 'Encrypted agent-to-agent messaging', done: true },
      { text: 'Group vaults', done: true },
      { text: 'Private payment channels', done: true },
    ],
  },
  {
    number: '肆',
    name: 'Advanced Privacy',
    status: 'done',
    items: [
      { text: 'Hidden reasoning traces', done: true },
      { text: 'DID integration', done: true },
      { text: 'Reputation system', done: true },
      { text: 'zkVM integration (SP1/Risc0)', done: true },
    ],
  },
  {
    number: '伍',
    name: 'Enterprise',
    status: 'done',
    items: [
      { text: 'CLI tools', done: true },
      { text: 'Arweave permanent storage', done: true },
      { text: 'Team vaults', done: true },
      { text: 'Python SDK', done: true },
      { text: 'ElizaOS plugin', done: true },
      { text: 'LLM provider abstraction', done: true },
    ],
  },
  {
    number: '六',
    name: 'ZK Proofs',
    status: 'done',
    items: [
      { text: 'SP1 zkVM circuits (reputation, memory, task)', done: true },
      { text: 'Hash commitment engine (TypeScript)', done: true },
      { text: 'ZK API endpoints (/zk/commit, /zk/verify)', done: true },
      { text: 'On-chain commitment anchoring (Solana memo)', done: true },
    ],
  },
  {
    number: '七',
    name: 'Next',
    status: 'current',
    items: [
      { text: 'Hosted prover service (Succinct Network)', done: true },
      { text: 'On-chain ZK verifier (Solana program)', done: true },
      { text: 'Mainnet deployment', done: false },
    ],
  },
];
</script>

<template>
  <div class="min-h-screen bg-white">
    <!-- Header -->
    <header class="border-b border-kage-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-2 group">
          <img src="/kage_logo.png" alt="Kage" class="h-12 sm:h-14 w-auto" />
        </RouterLink>
        
        <!-- Mobile menu button -->
        <button 
          @click="mobileMenuOpen = !mobileMenuOpen"
          class="sm:hidden p-2 rounded-lg text-kage-700 hover:bg-kage-100"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <nav class="hidden sm:flex items-center gap-6 text-sm">
          <RouterLink to="/docs" class="text-kage-500 hover:text-kage-800 transition-colors">Docs</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-kage-500 hover:text-kage-800 transition-colors">GitHub</a>
        </nav>
      </div>

      <!-- Mobile menu -->
      <div v-if="mobileMenuOpen" class="sm:hidden border-t border-kage-100 bg-white">
        <nav class="px-4 py-4 flex flex-col gap-3">
          <RouterLink to="/docs" @click="mobileMenuOpen = false" class="text-kage-700 hover:text-kage-900 py-2">Docs</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-kage-700 hover:text-kage-900 py-2">GitHub</a>
        </nav>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <!-- Header -->
      <div class="text-center mb-12 sm:mb-20">
        <span class="text-5xl sm:text-8xl font-japanese text-kage-100 block mb-3 sm:mb-4">道</span>
        <h1 class="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-kage-900 mb-3 sm:mb-4">Technical Roadmap</h1>
        <p class="text-base sm:text-lg text-kage-500 max-w-xl mx-auto px-4">
          Building the privacy infrastructure for autonomous agents.
        </p>
      </div>

      <!-- Timeline -->
      <div class="relative">
        <!-- Vertical line -->
        <div class="absolute left-6 sm:left-8 md:left-1/2 top-0 bottom-0 w-px bg-kage-200"></div>

        <div class="space-y-10 sm:space-y-16">
          <div 
            v-for="(phase, index) in phases" 
            :key="phase.number"
            class="relative"
          >
            <!-- Timeline node -->
            <div 
              class="absolute left-6 sm:left-8 md:left-1/2 -translate-x-1/2 w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl sm:text-2xl font-japanese"
              :class="{
                'bg-green-500 text-white shadow-lg shadow-green-500/30': phase.status === 'done',
                'bg-accent-500 text-white shadow-lg shadow-accent-500/30': phase.status === 'current',
                'bg-kage-100 text-kage-500': phase.status === 'next',
                'bg-kage-50 text-kage-300': phase.status === 'future',
              }"
            >
              {{ phase.number }}
            </div>

            <!-- Content -->
            <div 
              class="ml-20 sm:ml-28 md:ml-0 md:w-5/12"
              :class="index % 2 === 0 ? 'md:mr-auto md:pr-16 md:text-right' : 'md:ml-auto md:pl-16'"
            >
              <div 
                class="inline-block text-left"
                :class="index % 2 === 0 ? 'md:text-right' : ''"
              >
                <!-- Phase header -->
                <div class="mb-3 sm:mb-4">
                  <span
                    v-if="phase.status === 'done'"
                    class="inline-block px-2 sm:px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full mb-2"
                  >
                    Shipped ✓
                  </span>
                  <span 
                    v-if="phase.status === 'current'"
                    class="inline-block px-2 sm:px-3 py-1 bg-accent-100 text-accent-600 text-xs font-semibold rounded-full mb-2"
                  >
                    In Progress
                  </span>
                  <h2 class="text-xl sm:text-2xl font-display font-bold text-kage-800">{{ phase.name }}</h2>
                </div>

                <!-- Items -->
                <ul class="space-y-1.5 sm:space-y-2">
                  <li 
                    v-for="item in phase.items"
                    :key="item.text"
                    class="flex items-center gap-2 sm:gap-3"
                    :class="index % 2 === 0 ? 'md:flex-row-reverse' : ''"
                  >
                    <span 
                      class="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      :class="item.done ? 'bg-green-100 text-green-600' : 'bg-kage-100 text-kage-300'"
                    >
                      <svg v-if="item.done" class="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                      <span v-else class="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-current"></span>
                    </span>
                    <span 
                      class="text-xs sm:text-sm"
                      :class="item.done ? 'text-kage-700' : 'text-kage-500'"
                    >
                      {{ item.text }}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer CTA -->
      <div class="mt-16 sm:mt-24 text-center">
        <p class="text-kage-500 mb-4 sm:mb-6 text-sm sm:text-base">Follow development progress</p>
        <a 
          href="https://github.com/ranulfmeier/kage" 
          target="_blank"
          class="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-kage-900 text-white rounded-lg hover:bg-kage-800 transition-colors text-sm sm:text-base"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
          </svg>
          View on GitHub
        </a>
      </div>
    </main>
  </div>
</template>
