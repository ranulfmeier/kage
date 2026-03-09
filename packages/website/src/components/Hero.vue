<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isVisible = ref(false);

onMounted(() => {
  setTimeout(() => {
    isVisible.value = true;
  }, 100);
});
</script>

<template>
  <section class="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center">
        <!-- Kage kanji floating -->
        <div 
          class="absolute top-20 right-[10%] text-[200px] font-japanese text-kage-100/40 select-none pointer-events-none animate-float hidden lg:block"
          :class="{ 'opacity-0': !isVisible, 'animate-fade-in': isVisible }"
        >
          影
        </div>

        <!-- Badge -->
        <div 
          class="inline-flex items-center gap-3 px-5 py-2.5 rounded-full glass border-white/60 shadow-lg mb-8 opacity-0"
          :class="{ 'animate-fade-in-down': isVisible }"
        >
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-accent-500 animate-pulse"></div>
            <span class="text-sm font-semibold text-kage-700">Solana</span>
            <span class="text-kage-300">×</span>
            <span class="text-sm font-semibold text-kage-700">Umbra Privacy</span>
          </div>
        </div>

        <!-- Main heading -->
        <h1 
          class="section-title text-5xl md:text-7xl lg:text-8xl mb-6 opacity-0"
          :class="{ 'animate-fade-in-up': isVisible }"
          style="animation-delay: 0.2s"
        >
          <span class="block text-kage-800 shadow-text">Shadow Memory</span>
          <span class="block gradient-text-animated mt-2">for Autonomous Agents</span>
        </h1>

        <!-- Subheading -->
        <p 
          class="section-subtitle mb-12 text-balance max-w-3xl opacity-0"
          :class="{ 'animate-fade-in-up': isVisible }"
          style="animation-delay: 0.4s"
        >
          Privacy-first encrypted memory vault for AI agents. 
          Your agent's memories stay hidden in the shadows, 
          visible only to those who hold the key.
        </p>

        <!-- CTA buttons -->
        <div 
          class="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 opacity-0"
          :class="{ 'animate-fade-in-up': isVisible }"
          style="animation-delay: 0.6s"
        >
          <a href="#get-started" class="btn-primary text-lg group">
            <span>Get Started</span>
            <svg class="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
          <a href="#how-it-works" class="btn-secondary text-lg group">
            <span>See How It Works</span>
            <svg class="w-5 h-5 ml-2 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </a>
        </div>

        <!-- Hero visual -->
        <div 
          class="relative max-w-4xl mx-auto opacity-0"
          :class="{ 'animate-scale-in': isVisible }"
          style="animation-delay: 0.8s"
        >
          <!-- Glow effect behind terminal -->
          <div class="absolute inset-0 bg-gradient-to-r from-accent-500/20 via-kage-500/20 to-accent-500/20 blur-3xl -z-10 scale-110 animate-shadow-pulse"></div>
          
          <div class="card-hover p-6 md:p-10 group">
            <!-- Terminal mockup -->
            <div class="bg-gradient-to-br from-kage-800 to-shadow-950 rounded-xl overflow-hidden shadow-2xl shadow-kage-950/50 border border-kage-700/50">
              <div class="flex items-center gap-2 px-4 py-3 bg-kage-900/80 border-b border-kage-700/50 backdrop-blur-sm">
                <div class="w-3 h-3 rounded-full bg-red-400/80 hover:bg-red-400 transition-colors cursor-pointer"></div>
                <div class="w-3 h-3 rounded-full bg-yellow-400/80 hover:bg-yellow-400 transition-colors cursor-pointer"></div>
                <div class="w-3 h-3 rounded-full bg-green-400/80 hover:bg-green-400 transition-colors cursor-pointer"></div>
                <div class="flex-1 flex items-center justify-center gap-2">
                  <span class="text-kage-500 text-sm font-mono">kage-agent</span>
                  <span class="text-accent-400 text-xs">●</span>
                </div>
              </div>
              <div class="p-6 md:p-8 font-mono text-sm md:text-base text-left space-y-4">
                <div class="space-y-2">
                  <p class="text-kage-500"># Store an encrypted memory</p>
                  <p class="text-white flex items-start gap-2">
                    <span class="text-accent-400 select-none">›</span>
                    <span>
                      <span class="text-accent-400">agent</span>.<span class="text-amber-300">chat</span>(<span class="text-green-400">"Remember my API key is sk-secret-123"</span>)
                    </span>
                  </p>
                </div>
                
                <div class="pl-4 border-l-2 border-accent-500/50 space-y-1 bg-accent-500/5 py-2 px-3 rounded-r-lg">
                  <p class="text-kage-300 flex items-center gap-2">
                    <span class="text-green-400">✓</span> Memory encrypted with your viewing key
                  </p>
                  <p class="text-kage-300 flex items-center gap-2">
                    <span class="text-green-400">✓</span> Stored on IPFS: <span class="text-accent-400">Qm7x9...kP2</span>
                  </p>
                  <p class="text-kage-300 flex items-center gap-2">
                    <span class="text-green-400">✓</span> Commitment saved to Solana
                  </p>
                </div>
                
                <div class="space-y-2 pt-2">
                  <p class="text-kage-500"># Only you can recall it</p>
                  <p class="text-white flex items-start gap-2">
                    <span class="text-accent-400 select-none">›</span>
                    <span>
                      <span class="text-accent-400">agent</span>.<span class="text-amber-300">chat</span>(<span class="text-green-400">"What's my API key?"</span>)
                    </span>
                  </p>
                </div>
                
                <div class="pl-4 border-l-2 border-accent-500/50 bg-accent-500/5 py-2 px-3 rounded-r-lg">
                  <p class="text-kage-200 flex items-center gap-2">
                    <span class="text-accent-400">→</span> Your API key is <span class="text-green-400 font-semibold">sk-secret-123</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Floating elements -->
          <div class="absolute -top-8 -left-8 w-20 h-20 bg-gradient-to-br from-accent-400 to-accent-600 rounded-2xl shadow-xl shadow-accent-500/40 flex items-center justify-center animate-float">
            <svg class="w-10 h-10 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          <div class="absolute -bottom-6 -right-6 w-24 h-24 bg-gradient-to-br from-kage-700 to-shadow-950 rounded-2xl shadow-xl shadow-kage-950/50 flex items-center justify-center animate-float border border-kage-600/50" style="animation-delay: 1.5s;">
            <span class="text-white text-4xl font-japanese drop-shadow-lg">影</span>
          </div>

          <div class="absolute top-1/2 -right-12 w-12 h-12 bg-gradient-to-br from-accent-300 to-accent-500 rounded-xl shadow-lg flex items-center justify-center animate-float hidden md:flex" style="animation-delay: 2s;">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Scroll indicator -->
    <div 
      class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-0"
      :class="{ 'animate-fade-in': isVisible }"
      style="animation-delay: 1.5s"
    >
      <span class="text-kage-400 text-sm">Scroll to explore</span>
      <div class="w-6 h-10 border-2 border-kage-300 rounded-full flex justify-center pt-2">
        <div class="w-1.5 h-3 bg-accent-500 rounded-full animate-bounce"></div>
      </div>
    </div>
  </section>
</template>
