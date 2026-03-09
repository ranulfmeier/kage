<script setup lang="ts">
const useCases = [
  {
    icon: "chart",
    title: "Trading Agents",
    description: "Keep your alpha private. Trading strategies, market signals, and execution history stay encrypted. No more leaking edge to competitors.",
    tags: ["DeFi", "Alpha Protection", "MEV"],
  },
  {
    icon: "wallet",
    title: "Personal Finance",
    description: "AI advisors that remember your portfolio, goals, and risk tolerance without exposing your financial data to the world.",
    tags: ["Privacy", "Wealth Management"],
  },
  {
    icon: "heart",
    title: "Social & Dating",
    description: "Matchmaking agents that learn preferences privately. Your dating history and preferences stay between you and your agent.",
    tags: ["Social", "Matching", "Private"],
  },
  {
    icon: "briefcase",
    title: "Enterprise Assistants",
    description: "Corporate AI agents that handle sensitive business data without risk of exposure. Compliant with data privacy regulations.",
    tags: ["Enterprise", "Compliance"],
  },
];
</script>

<template>
  <section id="use-cases" class="py-20 md:py-32 relative overflow-hidden">
    <!-- Background decoration -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent-200 to-transparent"></div>
      <div class="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-kage-200 to-transparent"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
      <!-- Section header -->
      <div class="text-center mb-16 fade-section">
        <span class="inline-block text-accent-500 font-semibold text-sm tracking-wider uppercase mb-4">Applications</span>
        <h2 class="section-title mb-4 kage-border pb-6">
          Built for <span class="gradient-text">Sensitive Data</span>
        </h2>
        <p class="section-subtitle mt-8">
          When your agent handles private information, Kage ensures it stays that way.
        </p>
      </div>

      <!-- Use cases grid -->
      <div class="grid md:grid-cols-2 gap-8">
        <div
          v-for="(useCase, index) in useCases"
          :key="useCase.title"
          class="card-hover group fade-section"
          :class="[`stagger-${index + 1}`]"
        >
          <div class="flex items-start gap-5">
            <!-- Icon -->
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-100 to-kage-100 flex items-center justify-center flex-shrink-0 group-hover:from-accent-200 group-hover:to-kage-200 transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-accent-500/20">
              <!-- Chart -->
              <svg v-if="useCase.icon === 'chart'" class="w-8 h-8 text-accent-600 group-hover:text-accent-700 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <!-- Wallet -->
              <svg v-if="useCase.icon === 'wallet'" class="w-8 h-8 text-accent-600 group-hover:text-accent-700 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <!-- Heart -->
              <svg v-if="useCase.icon === 'heart'" class="w-8 h-8 text-accent-600 group-hover:text-accent-700 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <!-- Briefcase -->
              <svg v-if="useCase.icon === 'briefcase'" class="w-8 h-8 text-accent-600 group-hover:text-accent-700 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>

            <div class="flex-1">
              <h3 class="text-xl font-semibold text-kage-800 mb-2 group-hover:text-accent-700 transition-colors">
                {{ useCase.title }}
              </h3>
              <p class="text-kage-500 leading-relaxed mb-4">
                {{ useCase.description }}
              </p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="tag in useCase.tags"
                  :key="tag"
                  class="px-3 py-1.5 bg-gradient-to-r from-kage-50 to-accent-50/50 text-kage-600 rounded-lg text-sm font-medium border border-kage-100 group-hover:border-accent-200 transition-colors"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>

          <!-- Hover arrow -->
          <div class="absolute bottom-6 right-6 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
            <div class="w-10 h-10 rounded-full bg-accent-500 flex items-center justify-center shadow-lg shadow-accent-500/30">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
