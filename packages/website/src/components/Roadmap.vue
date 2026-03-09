<script setup lang="ts">
const phases = [
  {
    id: 1,
    name: "Core Protocol",
    japanese: "基礎",
    status: "current",
    items: [
      { text: "Client-side AES-256-GCM encryption", done: true },
      { text: "IPFS blob storage integration", done: true },
      { text: "Solana PDA commitments", done: true },
      { text: "Single-agent memory operations", done: true },
      { text: "Owner-only decrypt with viewing keys", done: true },
      { text: "Grant/revoke access permissions", done: true },
      { text: "Eliza-compatible agent plugins", done: true },
      { text: "Devnet deployment", done: false },
    ],
  },
  {
    id: 2,
    name: "Privacy Layer",
    japanese: "隠密",
    status: "upcoming",
    items: [
      { text: "Umbra SDK integration", done: false },
      { text: "Confidential SPL balance support", done: false },
      { text: "Private metadata fields", done: false },
      { text: "Zero-knowledge memory existence proofs", done: false },
      { text: "Access verification without reveal", done: false },
      { text: "Noir circuit implementation", done: false },
    ],
  },
  {
    id: 3,
    name: "Multi-Agent Coordination",
    japanese: "連携",
    status: "upcoming",
    items: [
      { text: "Shielded task delegation protocol", done: false },
      { text: "Private payment channels (x402)", done: false },
      { text: "Encrypted agent-to-agent messaging", done: false },
      { text: "Permissioned group vaults", done: false },
      { text: "Multi-sig access control", done: false },
      { text: "Cross-agent memory synchronization", done: false },
    ],
  },
  {
    id: 4,
    name: "Advanced Privacy",
    japanese: "極秘",
    status: "future",
    items: [
      { text: "SP1/Risc0 zkVM integration", done: false },
      { text: "Verifiable computation proofs", done: false },
      { text: "Hidden reasoning trace", done: false },
      { text: "DID identity integration", done: false },
      { text: "Agent reputation system", done: false },
      { text: "Cross-chain identity support", done: false },
    ],
  },
  {
    id: 5,
    name: "Enterprise & Scale",
    japanese: "帝国",
    status: "future",
    items: [
      { text: "Arweave permanent storage option", done: false },
      { text: "Multi-region IPFS pinning", done: false },
      { text: "Team vaults & enterprise features", done: false },
      { text: "SDK v2 (Rust, Python, Go)", done: false },
      { text: "CLI tools & local dev mode", done: false },
      { text: "Comprehensive documentation", done: false },
    ],
  },
];
</script>

<template>
  <section id="roadmap" class="py-20 md:py-32 relative overflow-hidden">
    <!-- Background -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute top-1/4 -left-40 w-80 h-80 bg-accent-200/20 rounded-full blur-3xl"></div>
      <div class="absolute bottom-1/4 -right-40 w-80 h-80 bg-kage-200/20 rounded-full blur-3xl"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
      <!-- Section header -->
      <div class="text-center mb-16 fade-section">
        <span class="inline-block text-accent-500 font-semibold text-sm tracking-wider uppercase mb-4">Development</span>
        <h2 class="section-title mb-4 kage-border pb-6">
          Technical <span class="gradient-text">Roadmap</span>
        </h2>
        <p class="section-subtitle mt-8">
          Building the privacy infrastructure for autonomous agents, one phase at a time.
        </p>
      </div>

      <!-- Timeline -->
      <div class="relative">
        <!-- Vertical line -->
        <div class="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-accent-300 via-kage-300 to-accent-300/50"></div>

        <div class="space-y-12 lg:space-y-24">
          <div
            v-for="(phase, index) in phases"
            :key="phase.id"
            class="relative fade-section"
            :class="[`stagger-${Math.min(index + 1, 6)}`]"
          >
            <div
              :class="[
                'lg:flex items-start gap-12',
                index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse',
              ]"
            >
              <!-- Content -->
              <div 
                class="lg:w-1/2"
                :class="index % 2 === 0 ? 'lg:text-right lg:pr-16' : 'lg:text-left lg:pl-16'"
              >
                <div 
                  class="card-hover inline-block text-left w-full"
                  :class="{
                    'border-accent-300 shadow-accent-500/10': phase.status === 'current',
                    'opacity-90': phase.status === 'future',
                  }"
                >
                  <!-- Phase header -->
                  <div class="flex items-center gap-4 mb-6">
                    <div 
                      class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-japanese shadow-lg"
                      :class="{
                        'bg-gradient-to-br from-accent-400 to-accent-600 text-white shadow-accent-500/30': phase.status === 'current',
                        'bg-gradient-to-br from-kage-400 to-kage-600 text-white shadow-kage-500/30': phase.status === 'upcoming',
                        'bg-gradient-to-br from-shadow-400 to-shadow-600 text-white shadow-shadow-500/30': phase.status === 'future',
                      }"
                    >
                      {{ phase.japanese }}
                    </div>
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-semibold text-kage-400">Phase {{ phase.id }}</span>
                        <span 
                          v-if="phase.status === 'current'"
                          class="px-2 py-0.5 bg-accent-100 text-accent-600 text-xs font-semibold rounded-full"
                        >
                          In Progress
                        </span>
                      </div>
                      <h3 class="text-xl font-bold text-kage-800">{{ phase.name }}</h3>
                    </div>
                  </div>

                  <!-- Items -->
                  <ul class="space-y-3">
                    <li
                      v-for="item in phase.items"
                      :key="item.text"
                      class="flex items-start gap-3"
                    >
                      <span 
                        class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        :class="{
                          'bg-green-100 text-green-600': item.done,
                          'bg-kage-100 text-kage-400': !item.done,
                        }"
                      >
                        <svg v-if="item.done" class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                        </svg>
                        <span v-else class="w-1.5 h-1.5 rounded-full bg-current"></span>
                      </span>
                      <span 
                        class="text-sm"
                        :class="item.done ? 'text-kage-600' : 'text-kage-500'"
                      >
                        {{ item.text }}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Center node -->
              <div 
                class="hidden lg:flex absolute left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white border-4 shadow-xl items-center justify-center"
                :class="{
                  'border-accent-400 shadow-accent-500/20': phase.status === 'current',
                  'border-kage-300 shadow-kage-500/20': phase.status === 'upcoming',
                  'border-shadow-300 shadow-shadow-500/20': phase.status === 'future',
                }"
              >
                <span 
                  class="text-2xl font-bold"
                  :class="{
                    'gradient-text': phase.status === 'current',
                    'text-kage-500': phase.status === 'upcoming',
                    'text-shadow-400': phase.status === 'future',
                  }"
                >
                  {{ phase.id }}
                </span>
              </div>

              <!-- Spacer -->
              <div class="lg:w-1/2"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom CTA -->
      <div class="mt-20 text-center fade-section">
        <div class="inline-flex flex-col items-center gap-4">
          <div class="glass-dark px-8 py-4 rounded-2xl">
            <p class="text-white font-semibold">Building in public</p>
            <p class="text-kage-400 text-sm">Follow our progress on GitHub</p>
          </div>
          <a href="https://github.com/your-org/kage" target="_blank" class="btn-primary">
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
            </svg>
            View Repository
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
