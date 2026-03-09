<script setup lang="ts">
const features = [
  {
    icon: "lock",
    title: "Encrypted Memory Vault",
    description: "All agent memories are encrypted client-side before storage. Only you and your agent can access them.",
    color: "accent",
  },
  {
    icon: "chain",
    title: "On-chain Verification",
    description: "Cryptographic commitments stored on Solana ensure data integrity without exposing content.",
    color: "kage",
  },
  {
    icon: "eye",
    title: "Viewing Keys",
    description: "Share selective access with trusted parties using Umbra's viewing key system.",
    color: "warm",
  },
  {
    icon: "shield",
    title: "Umbra Privacy Layer",
    description: "Built on Umbra's battle-tested privacy infrastructure with shielded pools and confidential transfers.",
    color: "accent",
  },
  {
    icon: "robot",
    title: "Eliza Compatible",
    description: "Drop-in plugins for ElizaOS agents. Natural language memory commands out of the box.",
    color: "kage",
  },
  {
    icon: "storage",
    title: "Decentralized Storage",
    description: "Encrypted blobs stored on IPFS/Arweave. No centralized servers hold your data.",
    color: "warm",
  },
];
</script>

<template>
  <section id="features" class="py-20 md:py-32 relative">
    <!-- Section background accent -->
    <div class="absolute inset-0 bg-gradient-to-b from-transparent via-kage-50/50 to-transparent pointer-events-none"></div>
    
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
      <!-- Section header -->
      <div class="text-center mb-16 fade-section">
        <span class="inline-block text-accent-500 font-semibold text-sm tracking-wider uppercase mb-4">Core Features</span>
        <h2 class="section-title mb-4 kage-border pb-6">
          Privacy by <span class="gradient-text">Design</span>
        </h2>
        <p class="section-subtitle mt-8">
          Every layer of Kage is built with privacy as the foundation, not an afterthought.
        </p>
      </div>

      <!-- Features grid -->
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        <div
          v-for="(feature, index) in features"
          :key="feature.title"
          class="card-hover fade-section group"
          :class="[`stagger-${index + 1}`]"
        >
          <!-- Icon -->
          <div
            :class="[
              'w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg',
              feature.color === 'accent' ? 'bg-gradient-to-br from-accent-100 to-accent-200/50 text-accent-600 group-hover:shadow-accent-500/20' : '',
              feature.color === 'kage' ? 'bg-gradient-to-br from-kage-100 to-kage-200/50 text-kage-600 group-hover:shadow-kage-500/20' : '',
              feature.color === 'warm' ? 'bg-gradient-to-br from-amber-100 to-amber-200/50 text-amber-600 group-hover:shadow-amber-500/20' : '',
            ]"
          >
            <!-- Lock -->
            <svg v-if="feature.icon === 'lock'" class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <!-- Chain -->
            <svg v-if="feature.icon === 'chain'" class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <!-- Eye -->
            <svg v-if="feature.icon === 'eye'" class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <!-- Shield -->
            <svg v-if="feature.icon === 'shield'" class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <!-- Robot -->
            <svg v-if="feature.icon === 'robot'" class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <!-- Storage -->
            <svg v-if="feature.icon === 'storage'" class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>

          <h3 class="text-xl font-semibold text-kage-800 mb-3 group-hover:text-accent-700 transition-colors duration-300">
            {{ feature.title }}
          </h3>
          <p class="text-kage-500 leading-relaxed">
            {{ feature.description }}
          </p>
          
          <!-- Hover indicator -->
          <div class="mt-4 flex items-center gap-2 text-accent-500 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
            <span class="text-sm font-medium">Learn more</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
