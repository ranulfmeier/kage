<script setup lang="ts">
const codeExample = `import { createKageAgent } from "@kage/agent";

const agent = createKageAgent({
  rpcUrl: "https://api.devnet.solana.com",
  programId: "KAGE...",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
}, keypair);

await agent.initialize();

// Store encrypted memories
await agent.chat("Remember my trading strategy...");

// Recall privately
await agent.chat("What's my strategy?");`;
</script>

<template>
  <section id="get-started" class="py-20 md:py-32 relative overflow-hidden">
    <!-- Background accents -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-200/20 rounded-full blur-3xl"></div>
      <div class="absolute -top-40 -right-40 w-80 h-80 bg-kage-200/20 rounded-full blur-3xl"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
      <div class="grid lg:grid-cols-2 gap-16 items-center">
        <!-- Left: Code -->
        <div class="order-2 lg:order-1 fade-section" style="animation-delay: 0.3s">
          <div class="relative">
            <!-- Glow effect -->
            <div class="absolute -inset-4 bg-gradient-to-r from-kage-500/10 via-accent-500/10 to-kage-500/10 rounded-3xl blur-2xl"></div>
            
            <div class="card-hover p-0 overflow-hidden relative">
              <div class="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-kage-800 to-shadow-950 border-b border-kage-700/50">
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-red-400/80 hover:bg-red-400 transition-colors cursor-pointer"></div>
                  <div class="w-3 h-3 rounded-full bg-yellow-400/80 hover:bg-yellow-400 transition-colors cursor-pointer"></div>
                  <div class="w-3 h-3 rounded-full bg-green-400/80 hover:bg-green-400 transition-colors cursor-pointer"></div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-kage-400 text-sm font-mono">agent.ts</span>
                  <span class="text-accent-400 text-xs animate-pulse">●</span>
                </div>
              </div>
              <pre class="p-6 md:p-8 bg-gradient-to-br from-kage-800 to-shadow-950 overflow-x-auto"><code class="text-sm font-mono text-kage-100 leading-relaxed">{{ codeExample }}</code></pre>
            </div>

            <!-- Floating badge -->
            <div class="absolute -top-4 -right-4 px-4 py-2 bg-gradient-to-r from-accent-500 to-accent-600 rounded-xl shadow-lg shadow-accent-500/30 text-white text-sm font-semibold">
              TypeScript
            </div>
          </div>
        </div>

        <!-- Right: Content -->
        <div class="order-1 lg:order-2 fade-section">
          <span class="inline-block text-accent-500 font-semibold text-sm tracking-wider uppercase mb-4">Quick Start</span>
          <h2 class="section-title mb-6 kage-border pb-6">
            Get Started in <span class="gradient-text">Minutes</span>
          </h2>
          <p class="text-lg text-kage-500 mb-10 leading-relaxed mt-8">
            Install the SDK, initialize your agent, and start storing encrypted memories. 
            It's that simple.
          </p>

          <!-- Steps -->
          <div class="space-y-5 mb-10">
            <div class="flex items-center gap-4 p-4 glass rounded-xl group hover:shadow-lg transition-all duration-300">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-accent-500/30 group-hover:scale-110 transition-transform">1</div>
              <code class="px-4 py-2 bg-kage-800/10 rounded-lg text-sm font-mono text-kage-700 flex-1">pnpm add @kage/agent @kage/sdk</code>
            </div>
            <div class="flex items-center gap-4 p-4 glass rounded-xl group hover:shadow-lg transition-all duration-300">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-accent-500/30 group-hover:scale-110 transition-transform">2</div>
              <span class="text-kage-600 font-medium">Configure your environment variables</span>
            </div>
            <div class="flex items-center gap-4 p-4 glass rounded-xl group hover:shadow-lg transition-all duration-300">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-accent-500/30 group-hover:scale-110 transition-transform">3</div>
              <span class="text-kage-600 font-medium">Start chatting with your private agent</span>
            </div>
          </div>

          <!-- CTAs -->
          <div class="flex flex-col sm:flex-row gap-4">
            <a href="https://github.com/ranulfmeier/kage" target="_blank" class="btn-primary group">
              <svg class="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
              </svg>
              View on GitHub
            </a>
            <a href="#" class="btn-secondary group">
              <svg class="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Read Documentation
            </a>
          </div>
        </div>
      </div>

      <!-- Bottom tagline -->
      <div class="mt-20 text-center fade-section">
        <div class="inline-flex items-center gap-4 px-8 py-4 glass-dark rounded-2xl">
          <span class="text-4xl font-japanese text-white">影</span>
          <div class="text-left">
            <p class="text-white font-semibold">Kage</p>
            <p class="text-kage-400 text-sm">Shadow Memory Protocol</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
