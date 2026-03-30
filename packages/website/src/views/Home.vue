<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import WalletButton from '../components/WalletButton.vue';

const isVisible = ref(false);
const copied = ref(false);
const contractAddress = ref('Fm5fvFsVQrkv77MZtJRr7vGB71voYYtDPiCWEfxspump');
const isScrolled = ref(false);
const mobileMenuOpen = ref(false);

function handleScroll() {
  isScrolled.value = window.scrollY > 50;
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value;
}

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}

onMounted(() => {
  setTimeout(() => {
    isVisible.value = true;
  }, 100);
  window.addEventListener('scroll', handleScroll);
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});

async function copyAddress() {
  if (contractAddress.value === 'Coming Soon') return;
  await navigator.clipboard.writeText(contractAddress.value);
  copied.value = true;
  setTimeout(() => copied.value = false, 2000);
}

const tokenGateLive = false; // flips to true when token gate activates
const tiers = [
  { name: '影 Shadow', kage: '10B', pct: '0.001%', desc: 'Basic access + multi-agent' },
  { name: '幻 Phantom', kage: '100B', pct: '0.01%', desc: 'Pro features + ZK proofs' },
  { name: '霊 Specter', kage: '500B', pct: '0.05%', desc: 'Unlimited + team vaults' },
  { name: '忍 Kage', kage: '1T', pct: '0.1%', desc: 'Enterprise + priority + DAO' },
];
</script>

<template>
  <div class="min-h-screen">
    <!-- Header -->
    <header 
      class="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      :class="isScrolled || mobileMenuOpen ? 'bg-white/95 backdrop-blur-md border-b border-kage-100' : 'bg-transparent'"
    >
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-2 group" @click="closeMobileMenu">
          <img 
            src="/kage_logo.png" 
            alt="Kage" 
            class="h-12 sm:h-14 w-auto"
          />
        </RouterLink>
        
        <!-- Mobile menu button -->
        <button 
          @click="toggleMobileMenu"
          class="md:hidden p-2 rounded-lg transition-colors"
          :class="isScrolled || mobileMenuOpen ? 'text-kage-700 hover:bg-kage-100' : 'text-kage-600 hover:bg-kage-100/50'"
        >
          <svg v-if="!mobileMenuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Desktop nav -->
        <nav class="hidden md:flex items-center gap-8">
          <RouterLink 
            to="/docs" 
            class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'"
          >
            Docs
          </RouterLink>
          <RouterLink 
            to="/roadmap" 
            class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'"
          >
            Roadmap
          </RouterLink>
          <a 
            href="https://github.com/ranulfmeier/kage" 
            target="_blank"
            class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'"
          >
            GitHub
          </a>
          <RouterLink
            to="/demo"
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300"
            :class="isScrolled 
              ? 'bg-kage-900 text-white hover:bg-kage-800' 
              : 'bg-kage-800/10 text-kage-700 hover:bg-kage-800/20'"
          >
            Try Demo
          </RouterLink>
          <a 
            href="https://x.com/kage_agent" 
            target="_blank"
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300"
            :class="isScrolled 
              ? 'bg-kage-900 text-white hover:bg-kage-800' 
              : 'bg-kage-800/10 text-kage-700 hover:bg-kage-800/20'"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <WalletButton />
        </nav>
      </div>

      <!-- Mobile menu -->
      <div 
        v-if="mobileMenuOpen"
        class="md:hidden border-t border-kage-100 bg-white/95 backdrop-blur-md"
      >
        <nav class="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4">
          <RouterLink 
            to="/docs" 
            @click="closeMobileMenu"
            class="text-base font-medium text-kage-700 hover:text-kage-900 py-2"
          >
            Docs
          </RouterLink>
          <RouterLink 
            to="/roadmap" 
            @click="closeMobileMenu"
            class="text-base font-medium text-kage-700 hover:text-kage-900 py-2"
          >
            Roadmap
          </RouterLink>
          <a 
            href="https://github.com/ranulfmeier/kage" 
            target="_blank"
            class="text-base font-medium text-kage-700 hover:text-kage-900 py-2"
          >
            GitHub
          </a>
          <a 
            href="https://x.com/kage_agent" 
            target="_blank"
            class="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-base font-medium bg-kage-900 text-white hover:bg-kage-800 mt-2"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Follow on X
          </a>
          <div class="mt-2">
            <WalletButton variant="dark" />
          </div>
        </nav>
      </div>
    </header>

    <!-- Hero Section -->
    <section class="min-h-screen flex flex-col justify-center relative overflow-hidden pt-20 md:pt-0">
      <!-- Ink wash background -->
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-kage-100/50 to-transparent"></div>
        <div class="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-kage-50 to-transparent"></div>
      </div>

      <!-- Vertical Japanese text -->
      <div 
        class="absolute right-4 md:right-16 top-1/2 -translate-y-1/2 writing-vertical hidden lg:block opacity-0"
        :class="{ 'animate-fade-in': isVisible }"
        style="animation-delay: 1s"
      >
        <span class="text-6xl xl:text-8xl font-japanese text-kage-100 tracking-widest">影の記憶</span>
      </div>

      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div class="max-w-3xl">
          <!-- Brush stroke accent -->
          <div 
            class="w-16 sm:w-24 h-1 bg-gradient-to-r from-accent-500 to-transparent mb-8 sm:mb-12 opacity-0"
            :class="{ 'animate-slide-in-left': isVisible }"
          ></div>

          <!-- Main title -->
          <h1 
            class="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-display font-bold text-kage-900 leading-tight mb-6 sm:mb-8 opacity-0"
            :class="{ 'animate-fade-in-up': isVisible }"
            style="animation-delay: 0.2s"
          >
            Shadow Memory<br>
            <span class="text-kage-400">Protocol</span>
          </h1>

          <!-- Subtitle - haiku style -->
          <div 
            class="space-y-1 sm:space-y-2 text-lg sm:text-xl md:text-2xl text-kage-500 mb-10 sm:mb-16 opacity-0"
            :class="{ 'animate-fade-in-up': isVisible }"
            style="animation-delay: 0.4s"
          >
            <p>Your agent's memories</p>
            <p>encrypted in shadows.</p>
            <p>only keys reveal.</p>
          </div>

          <!-- CTA -->
          <div 
            class="flex flex-col sm:flex-row gap-3 sm:gap-4 opacity-0"
            :class="{ 'animate-fade-in-up': isVisible }"
            style="animation-delay: 0.6s"
          >
            <RouterLink to="/demo" class="btn-primary text-base sm:text-lg text-center">
              Try Live Demo
            </RouterLink>
            <RouterLink to="/docs" class="btn-secondary text-base sm:text-lg text-center">
              Documentation
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Scroll indicator -->
      <div class="absolute bottom-8 sm:bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 hidden sm:flex">
        <span class="text-kage-400 text-sm tracking-widest uppercase">Scroll</span>
        <div class="w-px h-16 bg-gradient-to-b from-kage-300 to-transparent"></div>
      </div>
    </section>

    <!-- Token Section -->
    <section class="py-16 sm:py-24 md:py-32 relative">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Section indicator -->
        <div class="flex items-center gap-4 sm:gap-6 mb-12 sm:mb-20">
          <span class="text-4xl sm:text-6xl font-japanese text-kage-200">壱</span>
          <div>
            <p class="text-xs sm:text-sm text-kage-400 tracking-widest uppercase">Token</p>
            <h2 class="text-2xl sm:text-3xl font-display font-bold text-kage-800">$KAGE</h2>
          </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <!-- Left: Contract -->
          <div>
            <p class="text-base sm:text-lg text-kage-500 mb-4 sm:mb-6 leading-relaxed">
              Hold $KAGE to access the protocol. No staking, no locking. Just hold tokens in your wallet.
            </p>

            <!-- Free Access Banner -->
            <div class="mb-6 sm:mb-8 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200/50">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-soft"></div>
                <span class="text-sm font-medium text-emerald-700">All features currently free</span>
              </div>
              <p class="text-xs text-emerald-600/80 mt-1 ml-4">Token-gated access activates in 2 weeks. Get your $KAGE now.</p>
            </div>

            <!-- Contract Address -->
            <div class="border-l-2 border-accent-500 pl-4 sm:pl-6 mb-8 sm:mb-12">
              <p class="text-sm text-kage-400 mb-2">Contract Address</p>
              <div class="flex items-center gap-3">
                <code class="text-kage-700 font-mono text-sm sm:text-lg break-all">{{ contractAddress }}</code>
                <button 
                  @click="copyAddress"
                  class="p-2 hover:bg-kage-100 rounded-lg transition-colors flex-shrink-0"
                >
                  <svg v-if="!copied" class="w-5 h-5 text-kage-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <svg v-else class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Links -->
            <div class="flex flex-wrap gap-4 sm:gap-6 text-sm">
              <a href="#" class="text-accent-600 hover:text-accent-700 transition-colors">pump.fun →</a>
              <a href="#" class="text-accent-600 hover:text-accent-700 transition-colors">Raydium →</a>
              <a href="#" class="text-accent-600 hover:text-accent-700 transition-colors">Birdeye →</a>
            </div>
          </div>

          <!-- Right: Tiers -->
          <div class="space-y-3 sm:space-y-4">
            <div 
              v-for="(tier, index) in tiers" 
              :key="tier.name"
              class="flex items-center justify-between py-4 sm:py-5 border-b border-kage-100 group hover:border-accent-300 transition-colors"
            >
              <div class="flex items-center gap-3 sm:gap-4">
                <span class="text-xl sm:text-2xl font-japanese text-kage-300 group-hover:text-accent-500 transition-colors">
                  {{ tier.name.split(' ')[0] }}
                </span>
                <span class="text-kage-700 font-medium text-sm sm:text-base">{{ tier.name.split(' ')[1] }}</span>
              </div>
              <div class="text-right">
                <span class="text-base sm:text-lg font-bold text-kage-800">{{ tier.kage }}</span>
                <span class="text-kage-400 text-xs sm:text-sm ml-1">$KAGE</span>
                <p class="text-xs text-kage-400">{{ tier.desc }}</p>
                <p class="text-[10px] text-kage-300 font-mono">{{ tier.pct }} of supply</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="py-16 sm:py-24 md:py-32 bg-kage-900 text-white relative overflow-hidden">
      <!-- Pattern -->
      <div class="absolute inset-0 opacity-5">
        <div class="absolute inset-0" style="background-image: radial-gradient(circle at 1px 1px, white 1px, transparent 1px); background-size: 40px 40px;"></div>
      </div>

      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <!-- Section indicator -->
        <div class="flex items-center gap-4 sm:gap-6 mb-12 sm:mb-20">
          <span class="text-4xl sm:text-6xl font-japanese text-kage-700">弐</span>
          <div>
            <p class="text-xs sm:text-sm text-kage-500 tracking-widest uppercase">Core</p>
            <h2 class="text-2xl sm:text-3xl font-display font-bold">Features</h2>
          </div>
        </div>

        <!-- Features list - vertical layout -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-px bg-kage-700">
          <div class="bg-kage-900 p-6 sm:p-8">
            <div class="text-3xl sm:text-4xl font-japanese text-accent-400 mb-3 sm:mb-4">暗</div>
            <h3 class="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">Client Encryption</h3>
            <p class="text-kage-400 text-sm leading-relaxed">
              AES-256-GCM encryption happens on your device. No plaintext ever leaves.
            </p>
          </div>
          <div class="bg-kage-900 p-6 sm:p-8">
            <div class="text-3xl sm:text-4xl font-japanese text-accent-400 mb-3 sm:mb-4">鎖</div>
            <h3 class="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">On-chain Commits</h3>
            <p class="text-kage-400 text-sm leading-relaxed">
              Cryptographic hashes on Solana. Verify integrity without exposing content.
            </p>
          </div>
          <div class="bg-kage-900 p-6 sm:p-8">
            <div class="text-3xl sm:text-4xl font-japanese text-accent-400 mb-3 sm:mb-4">鍵</div>
            <h3 class="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">Viewing Keys</h3>
            <p class="text-kage-400 text-sm leading-relaxed">
              Share access selectively. Grant and revoke permissions anytime.
            </p>
          </div>
        </div>

        <!-- CTA -->
        <div class="mt-10 sm:mt-16 flex justify-center">
          <RouterLink to="/docs" class="group flex items-center gap-3 text-kage-300 hover:text-white transition-colors">
            <span>Full documentation</span>
            <svg class="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="py-10 sm:py-16 border-t border-kage-100">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 sm:gap-8">
          <div class="flex items-center gap-4">
            <img src="/kage_logo.png" alt="Kage" class="h-14 sm:h-16 w-auto" />
            <p class="text-xs sm:text-sm text-kage-400">Shadow Memory Protocol</p>
          </div>

          <div class="flex flex-wrap gap-4 sm:gap-8 text-sm text-kage-500">
            <RouterLink to="/docs" class="hover:text-kage-800 transition-colors">Docs</RouterLink>
            <RouterLink to="/roadmap" class="hover:text-kage-800 transition-colors">Roadmap</RouterLink>
            <a href="https://github.com/ranulfmeier/kage" target="_blank" class="hover:text-kage-800 transition-colors">GitHub</a>
            <a href="https://x.com/kage_agent" target="_blank" class="hover:text-kage-800 transition-colors">Twitter</a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.writing-vertical {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}
</style>
