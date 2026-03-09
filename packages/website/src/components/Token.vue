<script setup lang="ts">
import { ref } from 'vue';

const contractAddress = ref('Coming Soon');
const copied = ref(false);

const tiers = [
  {
    name: 'Shadow',
    icon: '🌑',
    required: '10,000',
    features: ['Basic access', '10 memories/day', 'Standard support'],
    color: 'kage',
  },
  {
    name: 'Phantom',
    icon: '👤',
    required: '100,000',
    features: ['Pro features', '100 memories/day', 'API access'],
    color: 'kage',
    popular: false,
  },
  {
    name: 'Specter',
    icon: '👻',
    required: '500,000',
    features: ['Unlimited memories', 'Multi-agent support', 'Priority API'],
    color: 'accent',
    popular: true,
  },
  {
    name: 'Kage',
    icon: '🥷',
    required: '1,000,000',
    features: ['Enterprise features', 'DAO voting', 'Priority support'],
    color: 'accent',
  },
];

async function copyAddress() {
  if (contractAddress.value === 'Coming Soon') return;
  
  await navigator.clipboard.writeText(contractAddress.value);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <section id="token" class="py-20 md:py-32 relative overflow-hidden">
    <!-- Background -->
    <div class="absolute inset-0 bg-gradient-to-b from-kage-900 via-shadow-950 to-kage-900"></div>
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl"></div>
      <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-kage-500/10 rounded-full blur-3xl"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
      <!-- Section header -->
      <div class="text-center mb-16 fade-section">
        <span class="inline-block text-accent-400 font-semibold text-sm tracking-wider uppercase mb-4">Token</span>
        <h2 class="section-title text-white mb-4">
          <span class="text-6xl md:text-7xl font-japanese">$KAGE</span>
        </h2>
        <p class="text-lg text-kage-300 max-w-2xl mx-auto mt-6">
          Hold $KAGE tokens to unlock Kage features. No staking required — just hold in your wallet.
        </p>
      </div>

      <!-- Contract Address -->
      <div class="max-w-2xl mx-auto mb-16 fade-section">
        <div class="glass-dark rounded-2xl p-6 border border-kage-700/50">
          <div class="flex items-center justify-between mb-3">
            <span class="text-kage-400 text-sm font-medium">Contract Address (Solana)</span>
            <span class="px-2 py-1 bg-accent-500/20 text-accent-400 text-xs font-semibold rounded-full">SPL Token</span>
          </div>
          <div class="flex items-center gap-3">
            <code class="flex-1 bg-kage-800/50 rounded-xl px-4 py-3 text-kage-100 font-mono text-sm truncate">
              {{ contractAddress }}
            </code>
            <button
              @click="copyAddress"
              class="p-3 bg-accent-500 hover:bg-accent-600 rounded-xl transition-colors"
              :class="{ 'bg-green-500': copied }"
            >
              <svg v-if="!copied" class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <svg v-else class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
          <p class="text-kage-500 text-xs mt-3">
            Token will be launched on pump.fun. Contract address will be updated here.
          </p>
        </div>
      </div>

      <!-- Tier Cards -->
      <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        <div
          v-for="(tier, index) in tiers"
          :key="tier.name"
          class="relative fade-section"
          :class="[`stagger-${index + 1}`]"
        >
          <!-- Popular badge -->
          <div 
            v-if="tier.popular"
            class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent-500 text-white text-xs font-bold rounded-full shadow-lg shadow-accent-500/30 z-10"
          >
            Most Popular
          </div>
          
          <div 
            class="h-full rounded-2xl p-6 border transition-all duration-300 hover:-translate-y-2"
            :class="{
              'bg-gradient-to-br from-kage-800/80 to-shadow-900/80 border-kage-700/50 hover:border-kage-600': tier.color === 'kage',
              'bg-gradient-to-br from-accent-900/50 to-kage-900/80 border-accent-700/50 hover:border-accent-500': tier.color === 'accent',
            }"
          >
            <div class="text-center mb-6">
              <span class="text-4xl mb-3 block">{{ tier.icon }}</span>
              <h3 class="text-xl font-bold text-white">{{ tier.name }}</h3>
            </div>
            
            <div class="text-center mb-6">
              <span class="text-3xl font-bold text-white">{{ tier.required }}</span>
              <span class="text-kage-400 text-sm block">$KAGE required</span>
            </div>
            
            <ul class="space-y-3">
              <li
                v-for="feature in tier.features"
                :key="feature"
                class="flex items-center gap-2 text-sm text-kage-300"
              >
                <svg class="w-4 h-4 text-accent-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                {{ feature }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- How it works -->
      <div class="max-w-3xl mx-auto text-center fade-section">
        <div class="glass-dark rounded-2xl p-8 border border-kage-700/50">
          <h3 class="text-xl font-bold text-white mb-4">How Hold-to-Use Works</h3>
          <div class="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <div class="w-12 h-12 rounded-full bg-accent-500/20 flex items-center justify-center mx-auto mb-3">
                <span class="text-accent-400 font-bold">1</span>
              </div>
              <p class="text-kage-300 text-sm">Buy $KAGE on pump.fun or Raydium</p>
            </div>
            <div>
              <div class="w-12 h-12 rounded-full bg-accent-500/20 flex items-center justify-center mx-auto mb-3">
                <span class="text-accent-400 font-bold">2</span>
              </div>
              <p class="text-kage-300 text-sm">Hold tokens in your Solana wallet</p>
            </div>
            <div>
              <div class="w-12 h-12 rounded-full bg-accent-500/20 flex items-center justify-center mx-auto mb-3">
                <span class="text-accent-400 font-bold">3</span>
              </div>
              <p class="text-kage-300 text-sm">Connect wallet to unlock your tier</p>
            </div>
          </div>
          <p class="text-kage-500 text-sm mt-6">
            No staking or locking required. Your tokens stay liquid in your wallet.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
