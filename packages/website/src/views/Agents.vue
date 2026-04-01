<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import WalletButton from '../components/WalletButton.vue';

const isScrolled = ref(false);
const mobileMenuOpen = ref(false);

function handleScroll() { isScrolled.value = window.scrollY > 50; }
function toggleMobileMenu() { mobileMenuOpen.value = !mobileMenuOpen.value; }
function closeMobileMenu() { mobileMenuOpen.value = false; }

onMounted(() => window.addEventListener('scroll', handleScroll));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));

const frameworks = [
  {
    id: 'langchain',
    kanji: '鏈',
    name: 'LangChain + Claude',
    desc: 'Single agent with encrypted memory, ZK proofs, and verifiable credentials powered by Claude.',
    features: ['Encrypted vault', 'ZK proofs', 'DID identity', 'Reputation', 'Credentials'],
    code: `from kage.langchain import get_kage_tools
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(model="claude-haiku-4-5-20241022")
tools = get_kage_tools(base_url=KAGE_API)
agent = create_tool_calling_agent(llm, tools, prompt)`,
    install: 'pip install kage-sdk[langchain] langchain-anthropic',
    github: 'https://github.com/ranulfmeier/kage/tree/main/demos/claude-agent',
    color: 'accent',
  },
  {
    id: 'crewai',
    kanji: '群',
    name: 'CrewAI Swarm',
    desc: '3-agent team — Scout, Analyst, Commander — coordinating through encrypted channels.',
    features: ['Multi-agent', 'Task delegation', 'Team vaults', 'Reputation tracking', 'Encrypted coordination'],
    code: `from kage.crewai_tools import get_kage_tools
from crewai import Agent, Crew, Task

tools = get_kage_tools(base_url=KAGE_API)
scout = Agent(role="Scout", tools=tools)
crew = Crew(agents=[scout, analyst, cmd])
crew.kickoff()`,
    install: 'pip install kage-sdk[crewai] crewai',
    github: 'https://github.com/ranulfmeier/kage/tree/main/demos/crewai-swarm',
    color: 'kage',
  },
  {
    id: 'eliza',
    kanji: '忍',
    name: 'ElizaOS Agent',
    desc: 'Deploy a privacy-first chatbot to Discord or Telegram with full Kage capabilities.',
    features: ['Discord / Telegram', 'Shielded payments', 'Team secrets', 'Memory vault', 'DID + reputation'],
    code: `import { kagePlugin } from "@kage/plugin-eliza";

const character = {
  name: "Kage Sensei",
  plugins: [kagePlugin],
  clients: ["discord", "telegram"],
};`,
    install: 'npm install @kage/plugin-eliza',
    github: 'https://github.com/ranulfmeier/kage/tree/main/demos/eliza-agent',
    color: 'accent',
  },
];

const useCases = [
  {
    kanji: '秘',
    title: 'Secret Vault Agent',
    desc: 'Store API keys, passwords, and sensitive data in AES-256-GCM encrypted memory anchored on Solana. Recall with natural language.',
    tags: ['Memory', 'Encryption', 'Solana'],
    icon: 'vault',
  },
  {
    kanji: '連',
    title: 'Multi-Agent Ops',
    desc: 'Coordinate agent swarms with shielded task delegation. Each agent has its own reputation score — tracked on-chain.',
    tags: ['Delegation', 'Reputation', 'Multi-agent'],
    icon: 'network',
  },
  {
    kanji: '証',
    title: 'ZK Verification',
    desc: 'Prove agent competency without revealing training data. Issue verifiable credentials anchored with zero-knowledge commitments.',
    tags: ['ZK Proofs', 'Credentials', 'DID'],
    icon: 'shield',
  },
  {
    kanji: '払',
    title: 'DeFi Privacy Agent',
    desc: 'Send and receive SOL through Umbra stealth addresses. No one sees who paid whom — only that payment occurred.',
    tags: ['Stealth payments', 'Umbra', 'Privacy'],
    icon: 'payment',
  },
];

const featureMatrix = [
  { feature: 'Encrypted memory vault', langchain: true, crewai: true, eliza: true },
  { feature: 'Memory recall', langchain: true, crewai: true, eliza: true },
  { feature: 'DID identity', langchain: true, crewai: true, eliza: true },
  { feature: 'On-chain reputation', langchain: true, crewai: true, eliza: true },
  { feature: 'Verifiable credentials', langchain: true, crewai: true, eliza: false },
  { feature: 'Task delegation', langchain: false, crewai: true, eliza: true },
  { feature: 'Multi-agent coordination', langchain: false, crewai: true, eliza: false },
  { feature: 'Shielded payments', langchain: false, crewai: false, eliza: true },
  { feature: 'Team vaults (SSS)', langchain: false, crewai: false, eliza: true },
  { feature: 'Discord / Telegram', langchain: false, crewai: false, eliza: true },
];
</script>

<template>
  <div class="min-h-screen bg-[#FAF6F0] text-kage-900">
    <!-- Navbar -->
    <header 
      class="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      :class="isScrolled 
        ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-kage-100' 
        : 'bg-transparent'"
    >
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-3">
          <img src="/kage_logo.png" alt="Kage" class="h-12 sm:h-14 w-auto" />
        </RouterLink>
        
        <button 
          @click="toggleMobileMenu"
          class="lg:hidden p-2 rounded-lg transition-colors"
          :class="isScrolled || mobileMenuOpen ? 'text-kage-700 hover:bg-kage-100' : 'text-kage-600 hover:bg-kage-100/50'"
        >
          <svg v-if="!mobileMenuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <nav class="hidden lg:flex items-center gap-6">
          <RouterLink to="/docs" class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">
            Docs
          </RouterLink>
          <RouterLink to="/agents" class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-accent-600 font-semibold' : 'text-accent-500 hover:text-accent-700'">
            Agents
          </RouterLink>
          <RouterLink to="/roadmap" class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">
            Roadmap
          </RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">
            GitHub
          </a>
          <RouterLink to="/demo"
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300"
            :class="isScrolled ? 'bg-kage-900 text-white hover:bg-kage-800' : 'bg-kage-800/10 text-kage-700 hover:bg-kage-800/20'">
            Try Demo
          </RouterLink>
          <WalletButton />
        </nav>
      </div>

      <div v-if="mobileMenuOpen" class="lg:hidden border-t border-kage-100 bg-white/95 backdrop-blur-md">
        <nav class="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4">
          <RouterLink to="/docs" @click="closeMobileMenu" class="text-base font-medium text-kage-700 hover:text-kage-900 py-2">Docs</RouterLink>
          <RouterLink to="/agents" @click="closeMobileMenu" class="text-base font-medium text-accent-600 py-2">Agents</RouterLink>
          <RouterLink to="/roadmap" @click="closeMobileMenu" class="text-base font-medium text-kage-700 hover:text-kage-900 py-2">Roadmap</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-base font-medium text-kage-700 hover:text-kage-900 py-2">GitHub</a>
          <RouterLink to="/demo" @click="closeMobileMenu"
            class="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-base font-medium bg-kage-900 text-white hover:bg-kage-800 mt-2">
            Try Demo
          </RouterLink>
          <div class="mt-2"><WalletButton variant="dark" /></div>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <section class="pt-32 sm:pt-40 pb-16 sm:pb-24 relative overflow-hidden">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-kage-100/50 to-transparent"></div>
      </div>
      <div class="absolute right-4 md:right-16 top-1/2 -translate-y-1/2 writing-vertical hidden lg:block opacity-10">
        <span class="text-6xl xl:text-8xl font-japanese text-kage-300 tracking-widest">影の代理</span>
      </div>

      <div class="max-w-6xl mx-auto px-4 sm:px-6 relative">
        <p class="text-xs sm:text-sm text-kage-400 tracking-widest uppercase mb-3">Agent Ecosystem</p>
        <h1 class="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-kage-900 leading-tight mb-6">
          Build Private AI Agents<br class="hidden sm:block" />
          <span class="text-accent-500">on Solana</span>
        </h1>
        <p class="text-lg sm:text-xl text-kage-500 max-w-2xl leading-relaxed mb-8">
          Integrate Kage into any AI framework in minutes. Encrypted memory, ZK proofs, 
          shielded payments — all running on Solana.
        </p>
        <div class="flex flex-wrap gap-4">
          <RouterLink to="/demo"
            class="inline-flex items-center gap-2 px-6 py-3 bg-kage-900 text-white rounded-lg font-medium hover:bg-kage-800 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Live Playground
          </RouterLink>
          <a href="https://github.com/ranulfmeier/kage/tree/main/demos" target="_blank"
            class="inline-flex items-center gap-2 px-6 py-3 border border-kage-200 text-kage-700 rounded-lg font-medium hover:bg-kage-50 transition-colors">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            View on GitHub
          </a>
        </div>
      </div>
    </section>

    <!-- Framework Integrations -->
    <section class="py-16 sm:py-24">
      <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <div class="mb-12">
          <p class="text-xs sm:text-sm text-kage-400 tracking-widest uppercase mb-2">Integrations</p>
          <h2 class="text-2xl sm:text-3xl font-display font-bold text-kage-800">Framework Support</h2>
        </div>

        <div class="grid lg:grid-cols-3 gap-6 sm:gap-8">
          <div 
            v-for="fw in frameworks" 
            :key="fw.id"
            class="group relative bg-white rounded-2xl border border-kage-100 hover:border-accent-200 transition-all duration-300 hover:shadow-lg overflow-hidden"
          >
            <div class="p-6 sm:p-8">
              <!-- Header -->
              <div class="flex items-center gap-4 mb-4">
                <span class="text-3xl font-japanese text-kage-200 group-hover:text-accent-400 transition-colors">{{ fw.kanji }}</span>
                <div>
                  <h3 class="text-lg font-bold text-kage-800">{{ fw.name }}</h3>
                </div>
              </div>

              <p class="text-sm text-kage-500 mb-5 leading-relaxed">{{ fw.desc }}</p>

              <!-- Features -->
              <div class="flex flex-wrap gap-1.5 mb-6">
                <span 
                  v-for="f in fw.features" :key="f"
                  class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-kage-50 text-kage-500 border border-kage-100"
                >
                  {{ f }}
                </span>
              </div>

              <!-- Code -->
              <div class="bg-kage-900 rounded-xl p-4 mb-4 overflow-x-auto">
                <pre class="text-[11px] sm:text-xs text-kage-300 font-mono leading-relaxed whitespace-pre">{{ fw.code }}</pre>
              </div>

              <!-- Install -->
              <div class="bg-kage-50 rounded-lg px-3 py-2 mb-5">
                <code class="text-[11px] text-kage-600 font-mono">$ {{ fw.install }}</code>
              </div>

              <!-- Action -->
              <a :href="fw.github" target="_blank"
                class="inline-flex items-center gap-2 text-sm font-medium text-accent-600 hover:text-accent-700 transition-colors">
                View source
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Use Cases -->
    <section class="py-16 sm:py-24 bg-gradient-to-b from-kage-50/50 to-transparent">
      <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <div class="mb-12">
          <p class="text-xs sm:text-sm text-kage-400 tracking-widest uppercase mb-2">Use Cases</p>
          <h2 class="text-2xl sm:text-3xl font-display font-bold text-kage-800">What Can You Build?</h2>
        </div>

        <div class="grid sm:grid-cols-2 gap-6">
          <div 
            v-for="uc in useCases" 
            :key="uc.title"
            class="bg-white rounded-2xl border border-kage-100 p-6 sm:p-8 hover:border-accent-200 transition-all duration-300 hover:shadow-md"
          >
            <div class="flex items-start gap-4">
              <span class="text-3xl font-japanese text-kage-200 mt-1 flex-shrink-0">{{ uc.kanji }}</span>
              <div>
                <h3 class="text-lg font-bold text-kage-800 mb-2">{{ uc.title }}</h3>
                <p class="text-sm text-kage-500 leading-relaxed mb-4">{{ uc.desc }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <span 
                    v-for="tag in uc.tags" :key="tag"
                    class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-accent-50 text-accent-600 border border-accent-100"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Feature Comparison -->
    <section class="py-16 sm:py-24">
      <div class="max-w-4xl mx-auto px-4 sm:px-6">
        <div class="mb-12">
          <p class="text-xs sm:text-sm text-kage-400 tracking-widest uppercase mb-2">Comparison</p>
          <h2 class="text-2xl sm:text-3xl font-display font-bold text-kage-800">Feature Matrix</h2>
        </div>

        <div class="bg-white rounded-2xl border border-kage-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-kage-100">
                  <th class="text-left text-xs font-medium text-kage-400 uppercase tracking-wider px-6 py-4">Feature</th>
                  <th class="text-center text-xs font-medium text-kage-400 uppercase tracking-wider px-4 py-4">LangChain</th>
                  <th class="text-center text-xs font-medium text-kage-400 uppercase tracking-wider px-4 py-4">CrewAI</th>
                  <th class="text-center text-xs font-medium text-kage-400 uppercase tracking-wider px-4 py-4">ElizaOS</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="(row, i) in featureMatrix" 
                  :key="row.feature"
                  :class="i % 2 === 0 ? 'bg-kage-50/30' : ''"
                  class="border-b border-kage-50"
                >
                  <td class="text-sm text-kage-700 px-6 py-3">{{ row.feature }}</td>
                  <td class="text-center px-4 py-3">
                    <span v-if="row.langchain" class="text-accent-500">&#10003;</span>
                    <span v-else class="text-kage-200">—</span>
                  </td>
                  <td class="text-center px-4 py-3">
                    <span v-if="row.crewai" class="text-accent-500">&#10003;</span>
                    <span v-else class="text-kage-200">—</span>
                  </td>
                  <td class="text-center px-4 py-3">
                    <span v-if="row.eliza" class="text-accent-500">&#10003;</span>
                    <span v-else class="text-kage-200">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-16 sm:py-24">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div class="bg-kage-900 rounded-3xl p-8 sm:p-12 relative overflow-hidden">
          <div class="absolute inset-0 pointer-events-none opacity-10">
            <div class="absolute top-0 right-0 w-64 h-64 bg-accent-500 rounded-full blur-3xl"></div>
            <div class="absolute bottom-0 left-0 w-48 h-48 bg-kage-400 rounded-full blur-3xl"></div>
          </div>
          <div class="relative">
            <span class="text-5xl font-japanese text-kage-700 mb-4 block">影</span>
            <h2 class="text-2xl sm:text-3xl font-display font-bold text-white mb-4">Start Building in Minutes</h2>
            <p class="text-kage-400 mb-8 max-w-lg mx-auto">
              Install the SDK, connect to the API, and give your agent encrypted memory 
              and on-chain reputation in under 10 lines of code.
            </p>
            <div class="flex flex-wrap justify-center gap-4">
              <RouterLink to="/demo"
                class="inline-flex items-center gap-2 px-6 py-3 bg-accent-500 text-white rounded-lg font-medium hover:bg-accent-600 transition-colors">
                Try Live Demo
              </RouterLink>
              <RouterLink to="/quickstart"
                class="inline-flex items-center gap-2 px-6 py-3 border border-kage-600 text-kage-300 rounded-lg font-medium hover:bg-kage-800 transition-colors">
                Quickstart Guide
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-kage-100 py-8">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <span class="text-lg font-japanese text-kage-300">影</span>
          <span class="text-sm text-kage-400">Kage Protocol</span>
        </div>
        <div class="flex items-center gap-6 text-sm text-kage-400">
          <RouterLink to="/docs" class="hover:text-kage-700 transition-colors">Docs</RouterLink>
          <RouterLink to="/roadmap" class="hover:text-kage-700 transition-colors">Roadmap</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="hover:text-kage-700 transition-colors">GitHub</a>
          <a href="https://x.com/kage_agent" target="_blank" class="hover:text-kage-700 transition-colors">X</a>
        </div>
      </div>
    </footer>
  </div>
</template>
