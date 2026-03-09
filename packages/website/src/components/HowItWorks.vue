<script setup lang="ts">
const steps = [
  {
    number: "01",
    title: "Store Memory",
    description: "Your agent calls storeMemory() with any data — preferences, conversations, learned behaviors.",
  },
  {
    number: "02",
    title: "Client-side Encryption",
    description: "The SDK encrypts data using your viewing key. No plaintext ever leaves your device.",
  },
  {
    number: "03",
    title: "Decentralized Storage",
    description: "Encrypted blob is uploaded to IPFS. Only the content hash (CID) is recorded.",
  },
  {
    number: "04",
    title: "On-chain Commitment",
    description: "A cryptographic commitment is stored on Solana, ensuring data integrity without revealing content.",
  },
  {
    number: "05",
    title: "Recall Securely",
    description: "Only holders of your viewing key can decrypt and recall memories. Everyone else sees encrypted noise.",
  },
];
</script>

<template>
  <section id="how-it-works" class="py-20 md:py-32 relative overflow-hidden">
    <!-- Background pattern -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute top-1/4 -left-20 w-40 h-40 border border-kage-200/50 rounded-full"></div>
      <div class="absolute top-1/3 -left-10 w-20 h-20 border border-accent-200/50 rounded-full"></div>
      <div class="absolute bottom-1/4 -right-20 w-40 h-40 border border-kage-200/50 rounded-full"></div>
      <div class="absolute bottom-1/3 -right-10 w-20 h-20 border border-accent-200/50 rounded-full"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
      <!-- Section header -->
      <div class="text-center mb-20 fade-section">
        <span class="inline-block text-accent-500 font-semibold text-sm tracking-wider uppercase mb-4">The Flow</span>
        <h2 class="section-title mb-4 kage-border pb-6">
          How <span class="gradient-text">Kage</span> Works
        </h2>
        <p class="section-subtitle mt-8">
          A simple, secure flow that keeps your agent's memories private.
        </p>
      </div>

      <!-- Steps -->
      <div class="relative">
        <!-- Connection line with glow -->
        <div class="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-accent-300 via-kage-300 to-accent-300">
          <div class="absolute inset-0 w-4 -left-1.5 bg-gradient-to-b from-accent-200/20 via-kage-200/20 to-accent-200/20 blur-sm"></div>
        </div>

        <div class="space-y-12 lg:space-y-0">
          <div
            v-for="(step, index) in steps"
            :key="step.number"
            class="relative fade-section"
            :class="[`stagger-${index + 1}`]"
          >
            <div
              :class="[
                'lg:flex items-center gap-8',
                index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse',
              ]"
            >
              <!-- Content -->
              <div class="lg:w-1/2 mb-6 lg:mb-0" :class="index % 2 === 0 ? 'lg:text-right lg:pr-16' : 'lg:text-left lg:pl-16'">
                <div class="card-hover inline-block text-left group">
                  <div class="flex items-center gap-4 mb-4">
                    <span class="text-5xl font-bold gradient-text font-display group-hover:scale-110 transition-transform duration-300">{{ step.number }}</span>
                    <h3 class="text-xl font-semibold text-kage-800 group-hover:text-accent-700 transition-colors">{{ step.title }}</h3>
                  </div>
                  <p class="text-kage-500 leading-relaxed max-w-md">
                    {{ step.description }}
                  </p>
                </div>
              </div>

              <!-- Center dot with pulse -->
              <div class="hidden lg:flex absolute left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-white border-4 border-accent-400 shadow-lg shadow-accent-500/20 items-center justify-center group animate-shadow-pulse" style="animation-duration: 4s;">
                <div class="w-5 h-5 rounded-full bg-gradient-to-br from-accent-400 to-accent-600"></div>
              </div>

              <!-- Spacer -->
              <div class="lg:w-1/2"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom decoration -->
      <div class="mt-16 text-center fade-section">
        <div class="inline-flex items-center gap-3 px-6 py-3 glass rounded-full">
          <span class="text-2xl font-japanese">影</span>
          <span class="text-kage-600 font-medium">Memories hidden in plain sight</span>
        </div>
      </div>
    </div>
  </section>
</template>
