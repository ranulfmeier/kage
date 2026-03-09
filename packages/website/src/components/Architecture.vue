<script setup lang="ts">
const layers = [
  {
    name: "Agent Layer",
    color: "accent",
    components: ["Eliza Agent", "Kage Plugins", "LLM Provider"],
  },
  {
    name: "SDK Layer",
    color: "kage",
    components: ["Memory Vault", "Encryption Engine", "Storage Adapter"],
  },
  {
    name: "Privacy Layer",
    color: "warm",
    components: ["Umbra SDK", "Shielded Pools", "Viewing Keys"],
  },
  {
    name: "Storage Layer",
    color: "accent",
    components: ["IPFS/Arweave", "Solana PDAs", "Anchor Program"],
  },
];
</script>

<template>
  <section class="py-20 md:py-32 relative">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-16 items-center">
        <!-- Left: Description -->
        <div class="fade-section">
          <span class="inline-block text-accent-500 font-semibold text-sm tracking-wider uppercase mb-4">Technical Overview</span>
          <h2 class="section-title mb-6 kage-border pb-6">
            Layered <span class="gradient-text">Architecture</span>
          </h2>
          <p class="text-lg text-kage-500 mb-10 leading-relaxed mt-8">
            Kage is built as a modular stack. Each layer handles a specific concern, 
            making it easy to integrate, extend, or swap components.
          </p>

          <div class="space-y-4">
            <div
              v-for="(layer, index) in layers"
              :key="layer.name"
              class="flex items-start gap-4 p-5 rounded-xl glass group hover:shadow-lg transition-all duration-300 cursor-pointer fade-section"
              :class="[`stagger-${index + 1}`]"
            >
              <div
                :class="[
                  'w-4 h-4 rounded-full mt-1 flex-shrink-0 transition-transform duration-300 group-hover:scale-125',
                  layer.color === 'accent' ? 'bg-gradient-to-br from-accent-400 to-accent-600 shadow-lg shadow-accent-500/30' : '',
                  layer.color === 'kage' ? 'bg-gradient-to-br from-kage-400 to-kage-600 shadow-lg shadow-kage-500/30' : '',
                  layer.color === 'warm' ? 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/30' : '',
                ]"
              ></div>
              <div>
                <h4 class="font-semibold text-kage-800 mb-1 group-hover:text-accent-700 transition-colors">{{ layer.name }}</h4>
                <p class="text-sm text-kage-500">
                  {{ layer.components.join(" · ") }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Visual -->
        <div class="relative fade-section" style="animation-delay: 0.3s">
          <!-- Glow behind -->
          <div class="absolute -inset-4 bg-gradient-to-r from-accent-200/30 via-kage-200/30 to-accent-200/30 rounded-3xl blur-2xl -z-10 animate-pulse-soft"></div>
          
          <div class="card-hover p-8 group">
            <div class="space-y-5">
              <!-- Agent Layer -->
              <div class="bg-gradient-to-r from-accent-50 to-accent-100/80 rounded-xl p-6 border border-accent-200/80 hover:border-accent-300 transition-all duration-300 hover:shadow-lg hover:shadow-accent-500/10">
                <div class="flex items-center gap-3 mb-4">
                  <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-500/30">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <span class="font-semibold text-accent-700 block">Kage Agent</span>
                    <span class="text-xs text-accent-500">AI + Memory + Privacy</span>
                  </div>
                </div>
                <div class="flex gap-2 flex-wrap">
                  <span class="px-3 py-1.5 bg-white/90 rounded-lg text-sm text-accent-600 shadow-sm">Memory Plugin</span>
                  <span class="px-3 py-1.5 bg-white/90 rounded-lg text-sm text-accent-600 shadow-sm">Privacy Plugin</span>
                </div>
              </div>

              <!-- Arrow with animation -->
              <div class="flex justify-center py-1">
                <div class="flex flex-col items-center gap-1">
                  <div class="w-0.5 h-4 bg-gradient-to-b from-accent-300 to-kage-300"></div>
                  <svg class="w-5 h-5 text-kage-400 animate-bounce" style="animation-duration: 2s" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </div>

              <!-- SDK Layer -->
              <div class="bg-gradient-to-r from-kage-50 to-kage-100/80 rounded-xl p-6 border border-kage-200/80 hover:border-kage-300 transition-all duration-300 hover:shadow-lg hover:shadow-kage-500/10">
                <div class="flex items-center gap-3 mb-4">
                  <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-kage-400 to-kage-600 flex items-center justify-center shadow-lg shadow-kage-500/30">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <span class="font-semibold text-kage-700 block">@kage/sdk</span>
                    <span class="text-xs text-kage-500">Core Infrastructure</span>
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center">
                  <div class="px-2 py-2.5 bg-white/90 rounded-lg text-xs text-kage-600 font-medium shadow-sm hover:shadow transition-shadow">Vault</div>
                  <div class="px-2 py-2.5 bg-white/90 rounded-lg text-xs text-kage-600 font-medium shadow-sm hover:shadow transition-shadow">Encrypt</div>
                  <div class="px-2 py-2.5 bg-white/90 rounded-lg text-xs text-kage-600 font-medium shadow-sm hover:shadow transition-shadow">Storage</div>
                </div>
              </div>

              <!-- Arrow -->
              <div class="flex justify-center py-1">
                <div class="flex flex-col items-center gap-1">
                  <div class="w-0.5 h-4 bg-gradient-to-b from-kage-300 to-amber-300"></div>
                  <svg class="w-5 h-5 text-kage-400 animate-bounce" style="animation-duration: 2s; animation-delay: 0.3s" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </div>

              <!-- Privacy + Storage -->
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-gradient-to-br from-amber-50 to-amber-100/80 rounded-xl p-5 border border-amber-200/80 hover:border-amber-300 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10">
                  <div class="flex items-center gap-2 mb-3">
                    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                      <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <span class="text-sm font-semibold text-amber-700">Umbra</span>
                  </div>
                  <p class="text-xs text-amber-600">Privacy Layer</p>
                </div>
                <div class="bg-gradient-to-br from-accent-50 to-accent-100/80 rounded-xl p-5 border border-accent-200/80 hover:border-accent-300 transition-all duration-300 hover:shadow-lg hover:shadow-accent-500/10">
                  <div class="flex items-center gap-2 mb-3">
                    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-500/30">
                      <span class="text-white text-sm font-bold">◎</span>
                    </div>
                    <span class="text-sm font-semibold text-accent-700">Solana</span>
                  </div>
                  <p class="text-xs text-accent-600">On-chain</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Floating Kage symbol -->
          <div class="absolute -top-6 -right-6 w-16 h-16 bg-gradient-to-br from-kage-700 to-shadow-950 rounded-2xl shadow-xl flex items-center justify-center animate-float border border-kage-600/50">
            <span class="text-white text-2xl font-japanese">影</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
