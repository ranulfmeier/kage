<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import WalletButton from '../components/WalletButton.vue';

const isScrolled = ref(false);
const mobileMenuOpen = ref(false);
const activeTab = ref<'python' | 'typescript' | 'eliza'>('python');
const copiedId = ref('');

function handleScroll() { isScrolled.value = window.scrollY > 50; }
function toggleMobileMenu() { mobileMenuOpen.value = !mobileMenuOpen.value; }
function closeMobileMenu() { mobileMenuOpen.value = false; }

onMounted(() => window.addEventListener('scroll', handleScroll));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));

async function copyCode(id: string, code: string) {
  await navigator.clipboard.writeText(code);
  copiedId.value = id;
  setTimeout(() => copiedId.value = '', 2000);
}

const API_URL = 'https://kageapi-production.up.railway.app';

const steps = [
  {
    num: 1,
    title: 'Install the SDK',
    desc: 'One command — no extra dependencies needed.',
    tabs: {
      python: { lang: 'bash', code: 'pip install kage-sdk' },
      typescript: { lang: 'bash', code: 'npm install @kage/sdk @solana/web3.js' },
      eliza: { lang: 'bash', code: 'npm install @kage/plugin-eliza' },
    },
  },
  {
    num: 2,
    title: 'Connect to the API',
    desc: 'Initialize a client pointing to the Kage API. No API key required during free access period.',
    tabs: {
      python: {
        lang: 'python',
        code: `from kage import KageAgent

agent = KageAgent("${API_URL}")
health = agent.health()
print(health["status"])  # "ok"`,
      },
      typescript: {
        lang: 'typescript',
        code: `import { KageVault } from "@kage/sdk";

const vault = new KageVault("${API_URL}");
const health = await fetch("${API_URL}/health");
console.log(await health.json()); // { status: "ok" }`,
      },
      eliza: {
        lang: 'typescript',
        code: `import { kagePlugin } from "@kage/plugin-eliza";

const character = {
  name: "MyAgent",
  plugins: [kagePlugin],
  settings: {
    secrets: { KAGE_API_URL: "${API_URL}" }
  }
};`,
      },
    },
  },
  {
    num: 3,
    title: 'Store an encrypted memory',
    desc: 'Data is AES-256-GCM encrypted client-side, stored on IPFS, and anchored on Solana.',
    tabs: {
      python: {
        lang: 'python',
        code: `with KageAgent("${API_URL}") as agent:
    result = agent.store_memory("API key: prod_k8s_9f2x")
    print(result.text)
    # "Stored securely in encrypted vault"`,
      },
      typescript: {
        lang: 'typescript',
        code: `const response = await fetch("${API_URL}/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "Remember: API key is prod_k8s_9f2x"
  })
});
const data = await response.json();
console.log(data.reply, data.proof);`,
      },
      eliza: {
        lang: 'text',
        code: `User: "Remember that our launch date is April 15"

Kage Agent: "Stored securely in the encrypted vault.
  That information is now AES-256-GCM encrypted
  and anchored on Solana."`,
      },
    },
  },
  {
    num: 4,
    title: 'Recall from the vault',
    desc: 'Query your encrypted memories with natural language. Only your agent can decrypt them.',
    tabs: {
      python: {
        lang: 'python',
        code: `memories = agent.list_memories()
print(f"{len(memories)} memories in vault")

result = agent.recall("API key")
print(result.text)  # returns the decrypted memory`,
      },
      typescript: {
        lang: 'typescript',
        code: `const memories = await fetch("${API_URL}/memories");
const data = await memories.json();
console.log(\`\${data.count} memories in vault\`);

// Recall via chat
const recall = await fetch("${API_URL}/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "What API keys do I have?" })
});`,
      },
      eliza: {
        lang: 'text',
        code: `User: "What do you know about our launch?"

Kage Agent: "I found 1 memory about 'launch':
  Your launch date is April 15.
  (Retrieved from encrypted vault)"`,
      },
    },
  },
  {
    num: 5,
    title: 'Check identity & reputation',
    desc: 'Every agent gets a DID (did:sol:...) and an on-chain reputation score.',
    tabs: {
      python: {
        lang: 'python',
        code: `me = agent.identity()
print(f"DID: {me.did}")
# did:sol:5MYxJjeKUq5Di7gqt8Sta7LnJVJMCHPqbxBLiLjNqHQP

rep = agent.reputation()
print(f"Score: {rep.score}/1000 | Tier: {rep.tier}")

agent.record_task("success", "Completed security audit")
# Score increases on-chain`,
      },
      typescript: {
        lang: 'typescript',
        code: `const did = await fetch("${API_URL}/did");
const { did: agentDID } = await did.json();
// did:sol:5MYxJjeKUq5Di7gqt8Sta7LnJVJMCHPqbxBLiLjNqHQP

const rep = await fetch("${API_URL}/reputation");
const { reputation } = await rep.json();
console.log(\`Score: \${reputation.score}/1000\`);`,
      },
      eliza: {
        lang: 'text',
        code: `User: "What's your reputation?"

Kage Agent: "On-chain reputation: 850/1000
  Tier: Silver | Tasks: 47 completed
  Success rate: 94%
  All verified on Solana."`,
      },
    },
  },
];

const nextSteps = [
  {
    title: 'LangChain Integration',
    desc: 'Give any LangChain agent encrypted memory with 3 lines of code.',
    link: '/agents',
    code: 'from kage.langchain import get_kage_tools',
  },
  {
    title: 'CrewAI Multi-Agent',
    desc: 'Coordinate agent swarms with shielded task delegation.',
    link: '/agents',
    code: 'from kage.crewai_tools import get_kage_tools',
  },
  {
    title: 'ZK Proofs',
    desc: 'Create zero-knowledge commitments for data integrity.',
    link: '/docs',
    code: 'POST /zk/commit/reputation',
  },
  {
    title: 'Shielded Payments',
    desc: 'Send SOL privately through Umbra stealth addresses.',
    link: '/docs',
    code: 'POST /pay { recipientPubkey, amountLamports }',
  },
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
        
        <button @click="toggleMobileMenu"
          class="lg:hidden p-2 rounded-lg transition-colors"
          :class="isScrolled || mobileMenuOpen ? 'text-kage-700 hover:bg-kage-100' : 'text-kage-600 hover:bg-kage-100/50'">
          <svg v-if="!mobileMenuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <nav class="hidden lg:flex items-center gap-6">
          <RouterLink to="/docs" class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">Docs</RouterLink>
          <RouterLink to="/agents" class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">Agents</RouterLink>
          <RouterLink to="/roadmap" class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">Roadmap</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-sm font-medium transition-colors duration-300"
            :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">GitHub</a>
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
          <RouterLink to="/agents" @click="closeMobileMenu" class="text-base font-medium text-kage-700 hover:text-kage-900 py-2">Agents</RouterLink>
          <RouterLink to="/roadmap" @click="closeMobileMenu" class="text-base font-medium text-kage-700 hover:text-kage-900 py-2">Roadmap</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="text-base font-medium text-kage-700 hover:text-kage-900 py-2">GitHub</a>
          <RouterLink to="/demo" @click="closeMobileMenu"
            class="flex items-center justify-center px-4 py-3 rounded-lg text-base font-medium bg-kage-900 text-white hover:bg-kage-800 mt-2">Try Demo</RouterLink>
          <div class="mt-2"><WalletButton variant="dark" /></div>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <section class="pt-32 sm:pt-40 pb-12 sm:pb-16 relative">
      <div class="absolute right-4 md:right-16 top-1/2 -translate-y-1/2 writing-vertical hidden lg:block opacity-10">
        <span class="text-6xl xl:text-8xl font-japanese text-kage-300 tracking-widest">始め方</span>
      </div>
      <div class="max-w-4xl mx-auto px-4 sm:px-6">
        <p class="text-xs sm:text-sm text-kage-400 tracking-widest uppercase mb-3">Getting Started</p>
        <h1 class="text-4xl sm:text-5xl font-display font-bold text-kage-900 leading-tight mb-4">
          Quickstart
        </h1>
        <p class="text-lg text-kage-500 max-w-2xl leading-relaxed mb-6">
          Give your AI agent encrypted memory on Solana in 5 minutes. 
          No API key needed — all features are free during the launch period.
        </p>
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200/50">
          <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span class="text-sm text-emerald-700 font-medium">API live at {{ API_URL.replace('https://', '') }}</span>
        </div>
      </div>
    </section>

    <!-- Language Tabs -->
    <section class="pb-8">
      <div class="max-w-4xl mx-auto px-4 sm:px-6">
        <div class="flex gap-1 p-1 bg-kage-100 rounded-xl w-fit">
          <button 
            v-for="tab in [
              { id: 'python' as const, label: 'Python' },
              { id: 'typescript' as const, label: 'TypeScript' },
              { id: 'eliza' as const, label: 'ElizaOS' },
            ]"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            :class="activeTab === tab.id 
              ? 'bg-white text-kage-900 shadow-sm' 
              : 'text-kage-500 hover:text-kage-700'"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- Steps -->
    <section class="pb-16 sm:pb-24">
      <div class="max-w-4xl mx-auto px-4 sm:px-6">
        <div class="space-y-8">
          <div 
            v-for="step in steps" 
            :key="step.num"
            class="relative"
          >
            <!-- Connector line -->
            <div v-if="step.num < steps.length" class="absolute left-6 top-16 bottom-0 w-px bg-kage-100 hidden sm:block"></div>

            <div class="flex gap-4 sm:gap-6">
              <!-- Step number -->
              <div class="flex-shrink-0 w-12 h-12 rounded-xl bg-kage-900 text-white flex items-center justify-center text-lg font-bold">
                {{ step.num }}
              </div>

              <div class="flex-1 min-w-0">
                <h3 class="text-lg sm:text-xl font-bold text-kage-800 mb-1">{{ step.title }}</h3>
                <p class="text-sm text-kage-500 mb-4">{{ step.desc }}</p>

                <!-- Code block -->
                <div class="bg-kage-900 rounded-xl overflow-hidden">
                  <div class="flex items-center justify-between px-4 py-2 border-b border-kage-800">
                    <span class="text-[10px] text-kage-500 uppercase tracking-wider font-mono">
                      {{ step.tabs[activeTab].lang }}
                    </span>
                    <button 
                      @click="copyCode(`step-${step.num}`, step.tabs[activeTab].code)"
                      class="text-[10px] text-kage-500 hover:text-kage-300 transition-colors uppercase tracking-wider"
                    >
                      {{ copiedId === `step-${step.num}` ? 'Copied!' : 'Copy' }}
                    </button>
                  </div>
                  <pre class="p-4 overflow-x-auto"><code class="text-xs sm:text-sm text-kage-300 font-mono leading-relaxed whitespace-pre">{{ step.tabs[activeTab].code }}</code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- What's Next -->
    <section class="py-16 sm:py-24 bg-gradient-to-b from-kage-50/50 to-transparent">
      <div class="max-w-4xl mx-auto px-4 sm:px-6">
        <div class="mb-10">
          <p class="text-xs sm:text-sm text-kage-400 tracking-widest uppercase mb-2">Go Further</p>
          <h2 class="text-2xl sm:text-3xl font-display font-bold text-kage-800">What's Next?</h2>
        </div>

        <div class="grid sm:grid-cols-2 gap-4">
          <RouterLink 
            v-for="ns in nextSteps" 
            :key="ns.title"
            :to="ns.link"
            class="group bg-white rounded-xl border border-kage-100 p-5 hover:border-accent-200 hover:shadow-md transition-all duration-300"
          >
            <h3 class="text-base font-bold text-kage-800 mb-1 group-hover:text-accent-600 transition-colors">
              {{ ns.title }}
              <span class="inline-block ml-1 opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
            </h3>
            <p class="text-sm text-kage-500 mb-3">{{ ns.desc }}</p>
            <code class="text-[11px] text-kage-400 font-mono bg-kage-50 px-2 py-1 rounded">{{ ns.code }}</code>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Architecture -->
    <section class="py-16 sm:py-24">
      <div class="max-w-4xl mx-auto px-4 sm:px-6">
        <div class="mb-10">
          <p class="text-xs sm:text-sm text-kage-400 tracking-widest uppercase mb-2">Architecture</p>
          <h2 class="text-2xl sm:text-3xl font-display font-bold text-kage-800">How It Works</h2>
        </div>

        <div class="bg-white rounded-2xl border border-kage-100 p-6 sm:p-8">
          <div class="grid sm:grid-cols-4 gap-4 text-center">
            <div class="p-4">
              <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-accent-50 flex items-center justify-center">
                <span class="text-xl font-japanese text-accent-500">鏈</span>
              </div>
              <p class="text-sm font-bold text-kage-800">Your Agent</p>
              <p class="text-xs text-kage-400 mt-1">Python / TypeScript / ElizaOS</p>
            </div>
            <div class="p-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-kage-200 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <svg class="w-8 h-8 text-kage-200 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
            <div class="p-4">
              <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-kage-100 flex items-center justify-center">
                <span class="text-xl font-japanese text-kage-600">影</span>
              </div>
              <p class="text-sm font-bold text-kage-800">Kage API</p>
              <p class="text-xs text-kage-400 mt-1">AES-256-GCM / ZK / DID</p>
            </div>
            <div class="p-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-kage-200 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <svg class="w-8 h-8 text-kage-200 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>
          <div class="flex justify-end mt-2 sm:mt-0">
            <div class="p-4 text-center sm:w-1/4">
              <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-purple-50 flex items-center justify-center">
                <span class="text-xl">◎</span>
              </div>
              <p class="text-sm font-bold text-kage-800">Solana</p>
              <p class="text-xs text-kage-400 mt-1">On-chain proofs & anchoring</p>
            </div>
          </div>
        </div>

        <div class="mt-6 grid sm:grid-cols-3 gap-4">
          <div class="bg-kage-50/50 rounded-xl p-4 border border-kage-100">
            <p class="text-xs text-kage-400 uppercase tracking-wider mb-1">Encryption</p>
            <p class="text-sm font-medium text-kage-700">AES-256-GCM</p>
            <p class="text-xs text-kage-400 mt-1">Client-side, before storage</p>
          </div>
          <div class="bg-kage-50/50 rounded-xl p-4 border border-kage-100">
            <p class="text-xs text-kage-400 uppercase tracking-wider mb-1">Key Exchange</p>
            <p class="text-sm font-medium text-kage-700">X25519 ECDH</p>
            <p class="text-xs text-kage-400 mt-1">End-to-end agent messaging</p>
          </div>
          <div class="bg-kage-50/50 rounded-xl p-4 border border-kage-100">
            <p class="text-xs text-kage-400 uppercase tracking-wider mb-1">Proofs</p>
            <p class="text-sm font-medium text-kage-700">SP1 zkVM</p>
            <p class="text-xs text-kage-400 mt-1">Hash commitments + ZK circuits</p>
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
          </div>
          <div class="relative">
            <span class="text-5xl font-japanese text-kage-700 mb-4 block">始</span>
            <h2 class="text-2xl sm:text-3xl font-display font-bold text-white mb-4">Ready to Build?</h2>
            <p class="text-kage-400 mb-8 max-w-lg mx-auto">
              Join the growing ecosystem of privacy-first AI agents on Solana.
            </p>
            <div class="flex flex-wrap justify-center gap-4">
              <RouterLink to="/demo"
                class="px-6 py-3 bg-accent-500 text-white rounded-lg font-medium hover:bg-accent-600 transition-colors">
                Try Live Demo
              </RouterLink>
              <RouterLink to="/docs"
                class="px-6 py-3 border border-kage-600 text-kage-300 rounded-lg font-medium hover:bg-kage-800 transition-colors">
                Full API Docs
              </RouterLink>
              <RouterLink to="/agents"
                class="px-6 py-3 border border-kage-600 text-kage-300 rounded-lg font-medium hover:bg-kage-800 transition-colors">
                View Demo Agents
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
          <RouterLink to="/agents" class="hover:text-kage-700 transition-colors">Agents</RouterLink>
          <RouterLink to="/roadmap" class="hover:text-kage-700 transition-colors">Roadmap</RouterLink>
          <a href="https://github.com/ranulfmeier/kage" target="_blank" class="hover:text-kage-700 transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  </div>
</template>
