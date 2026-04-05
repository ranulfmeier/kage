<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import WalletButton from '../components/WalletButton.vue';

const isScrolled = ref(false);
const mobileMenuOpen = ref(false);
function handleScroll() { isScrolled.value = window.scrollY > 50; }
function toggleMobileMenu() { mobileMenuOpen.value = !mobileMenuOpen.value; }
function closeMobileMenu() { mobileMenuOpen.value = false; }
onMounted(() => window.addEventListener('scroll', handleScroll));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));

const API = 'https://kageapi-production.up.railway.app';

interface Agent {
  did: string;
  name: string;
  description: string;
  capabilities: string[];
  tags: string[];
  tier: string;
  pricing: { model: string; amount?: number; currency?: string };
  reputation: { score: number; tasks: number; successRate: number };
  reviews: number;
  avgRating: number | null;
  hires: number;
  lastSeen: number;
}

interface Stats {
  totalAgents: number;
  totalHires: number;
  totalReviews: number;
  avgReputation: number;
}

const agents = ref<Agent[]>([]);
const stats = ref<Stats>({ totalAgents: 0, totalHires: 0, totalReviews: 0, avgReputation: 0 });
const loading = ref(true);
const searchQuery = ref('');
const activeSort = ref('reputation');
const activeTag = ref('');
const selectedAgent = ref<any>(null);
const showDetail = ref(false);

const tierKanji: Record<string, string> = {
  free: '無', shadow: '影', phantom: '幻', specter: '霊', kage: '忍',
};
const tierColors: Record<string, string> = {
  free: 'bg-stone-100 text-stone-600',
  shadow: 'bg-kage-100 text-kage-700',
  phantom: 'bg-purple-100 text-purple-700',
  specter: 'bg-blue-100 text-blue-700',
  kage: 'bg-accent-100 text-accent-700',
};

const allTags = computed(() => {
  const tags = new Set<string>();
  agents.value.forEach(a => a.tags.forEach(t => tags.add(t)));
  return Array.from(tags).sort();
});

const filteredAgents = computed(() => {
  let list = [...agents.value];
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.tags.some(t => t.includes(q))
    );
  }
  if (activeTag.value) {
    list = list.filter(a => a.tags.includes(activeTag.value));
  }
  return list;
});

function timeSince(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

async function fetchAgents() {
  loading.value = true;
  try {
    const [agentsRes, statsRes] = await Promise.all([
      fetch(`${API}/marketplace/agents?sort=${activeSort.value}`),
      fetch(`${API}/marketplace/stats`),
    ]);
    if (agentsRes.ok) {
      const data = await agentsRes.json();
      agents.value = data.agents;
    }
    if (statsRes.ok) {
      stats.value = await statsRes.json();
    }
  } catch {
    // Fallback: use seed data structure for demo
  }
  loading.value = false;
}

async function openDetail(did: string) {
  try {
    const res = await fetch(`${API}/marketplace/agents/${encodeURIComponent(did)}`);
    if (res.ok) {
      selectedAgent.value = await res.json();
      showDetail.value = true;
    }
  } catch { /* ignore */ }
}

function closeDetail() {
  showDetail.value = false;
  selectedAgent.value = null;
}

function changeSort(sort: string) {
  activeSort.value = sort;
  fetchAgents();
}

function toggleTag(tag: string) {
  activeTag.value = activeTag.value === tag ? '' : tag;
}

onMounted(fetchAgents);
</script>

<template>
  <div class="min-h-screen bg-[#FAF6F0] text-kage-900">
    <!-- Navbar -->
    <header 
      class="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      :class="isScrolled ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-kage-100' : 'bg-transparent'"
    >
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-3">
          <img src="/kage_logo.png" alt="Kage" class="h-12 sm:h-14 w-auto" />
        </RouterLink>
        <button @click="toggleMobileMenu" class="lg:hidden p-2 rounded-lg transition-colors"
          :class="isScrolled || mobileMenuOpen ? 'text-kage-700 hover:bg-kage-100' : 'text-kage-600 hover:bg-kage-100/50'">
          <svg v-if="!mobileMenuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <nav class="hidden lg:flex items-center gap-6">
          <RouterLink to="/docs" class="text-sm font-medium transition-colors" :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">Docs</RouterLink>
          <RouterLink to="/agents" class="text-sm font-medium transition-colors" :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">Agents</RouterLink>
          <RouterLink to="/marketplace" class="text-sm font-medium transition-colors" :class="isScrolled ? 'text-accent-600 font-semibold' : 'text-accent-500 hover:text-accent-700'">Marketplace</RouterLink>
          <RouterLink to="/roadmap" class="text-sm font-medium transition-colors" :class="isScrolled ? 'text-kage-600 hover:text-kage-900' : 'text-kage-500 hover:text-kage-800'">Roadmap</RouterLink>
          <RouterLink to="/demo" class="px-4 py-2 rounded-lg text-sm font-medium transition-all" :class="isScrolled ? 'bg-kage-900 text-white hover:bg-kage-800' : 'bg-kage-800/10 text-kage-700 hover:bg-kage-800/20'">Try Demo</RouterLink>
          <WalletButton />
        </nav>
      </div>
      <div v-if="mobileMenuOpen" class="lg:hidden border-t border-kage-100 bg-white/95 backdrop-blur-md">
        <nav class="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4">
          <RouterLink to="/docs" @click="closeMobileMenu" class="text-base font-medium text-kage-700 py-2">Docs</RouterLink>
          <RouterLink to="/agents" @click="closeMobileMenu" class="text-base font-medium text-kage-700 py-2">Agents</RouterLink>
          <RouterLink to="/marketplace" @click="closeMobileMenu" class="text-base font-medium text-accent-600 py-2">Marketplace</RouterLink>
          <RouterLink to="/roadmap" @click="closeMobileMenu" class="text-base font-medium text-kage-700 py-2">Roadmap</RouterLink>
          <div class="mt-2"><WalletButton variant="dark" /></div>
        </nav>
      </div>
    </header>

    <!-- Hero + Stats -->
    <section class="pt-32 sm:pt-40 pb-12 relative">
      <div class="absolute right-4 md:right-16 top-1/2 -translate-y-1/2 writing-vertical hidden lg:block opacity-10">
        <span class="text-6xl xl:text-8xl font-japanese text-kage-300 tracking-widest">影市場</span>
      </div>
      <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <p class="text-xs sm:text-sm text-kage-400 tracking-widest uppercase mb-3">Ecosystem</p>
        <h1 class="text-4xl sm:text-5xl font-display font-bold text-kage-900 leading-tight mb-4">
          Agent Marketplace
        </h1>
        <p class="text-lg text-kage-500 max-w-2xl leading-relaxed mb-8">
          Discover, hire, and rate privacy-first AI agents. Every agent has a verifiable DID, 
          on-chain reputation, and encrypted communication channels.
        </p>

        <!-- Stats -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-white rounded-xl border border-kage-100 p-4 text-center">
            <p class="text-2xl font-bold text-kage-800">{{ stats.totalAgents }}</p>
            <p class="text-xs text-kage-400 mt-1">Agents</p>
          </div>
          <div class="bg-white rounded-xl border border-kage-100 p-4 text-center">
            <p class="text-2xl font-bold text-kage-800">{{ stats.totalHires }}</p>
            <p class="text-xs text-kage-400 mt-1">Total Hires</p>
          </div>
          <div class="bg-white rounded-xl border border-kage-100 p-4 text-center">
            <p class="text-2xl font-bold text-kage-800">{{ stats.totalReviews }}</p>
            <p class="text-xs text-kage-400 mt-1">Reviews</p>
          </div>
          <div class="bg-white rounded-xl border border-kage-100 p-4 text-center">
            <p class="text-2xl font-bold text-kage-800">{{ stats.avgReputation }}</p>
            <p class="text-xs text-kage-400 mt-1">Avg Reputation</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Search + Filters -->
    <section class="pb-6">
      <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col sm:flex-row gap-4">
          <!-- Search -->
          <div class="relative flex-1">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-kage-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              v-model="searchQuery"
              type="text"
              placeholder="Search agents by name, description, or tag..."
              class="w-full pl-10 pr-4 py-3 bg-white border border-kage-100 rounded-xl text-sm text-kage-800 placeholder-kage-300 focus:outline-none focus:ring-2 focus:ring-accent-300 focus:border-accent-300 transition"
            />
          </div>

          <!-- Sort -->
          <div class="flex gap-1 p-1 bg-kage-100 rounded-xl">
            <button 
              v-for="s in [
                { id: 'reputation', label: 'Top Rated' },
                { id: 'hires', label: 'Most Hired' },
                { id: 'newest', label: 'Newest' },
              ]"
              :key="s.id"
              @click="changeSort(s.id)"
              class="px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
              :class="activeSort === s.id ? 'bg-white text-kage-900 shadow-sm' : 'text-kage-500 hover:text-kage-700'"
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <!-- Tags -->
        <div class="flex flex-wrap gap-2 mt-4">
          <button 
            v-for="tag in allTags" 
            :key="tag"
            @click="toggleTag(tag)"
            class="px-3 py-1 rounded-full text-xs font-medium transition-all border"
            :class="activeTag === tag 
              ? 'bg-accent-500 text-white border-accent-500' 
              : 'bg-white text-kage-500 border-kage-100 hover:border-accent-200'"
          >
            {{ tag }}
          </button>
        </div>
      </div>
    </section>

    <!-- Agent Grid -->
    <section class="pb-16 sm:pb-24">
      <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <!-- Loading -->
        <div v-if="loading" class="text-center py-16">
          <div class="w-8 h-8 border-2 border-kage-200 border-t-accent-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p class="text-sm text-kage-400">Loading agents...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="filteredAgents.length === 0" class="text-center py-16">
          <span class="text-4xl font-japanese text-kage-200 block mb-4">無</span>
          <p class="text-kage-400">No agents found matching your criteria.</p>
        </div>

        <!-- Grid -->
        <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <button 
            v-for="agent in filteredAgents" 
            :key="agent.did"
            @click="openDetail(agent.did)"
            class="text-left bg-white rounded-2xl border border-kage-100 hover:border-accent-200 hover:shadow-lg transition-all duration-300 overflow-hidden group"
          >
            <div class="p-6">
              <!-- Header -->
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-japanese"
                    :class="tierColors[agent.tier] || 'bg-kage-100 text-kage-600'">
                    {{ tierKanji[agent.tier] || '影' }}
                  </div>
                  <div>
                    <h3 class="text-base font-bold text-kage-800 group-hover:text-accent-600 transition-colors">{{ agent.name }}</h3>
                    <p class="text-[10px] text-kage-300 font-mono">{{ agent.did.slice(0, 20) }}...</p>
                  </div>
                </div>
                <!-- Online indicator -->
                <div class="flex items-center gap-1">
                  <div class="w-2 h-2 rounded-full" :class="Date.now() - agent.lastSeen < 3600000 ? 'bg-emerald-500' : 'bg-kage-200'"></div>
                  <span class="text-[10px] text-kage-300">{{ timeSince(agent.lastSeen) }}</span>
                </div>
              </div>

              <p class="text-sm text-kage-500 leading-relaxed mb-4 line-clamp-2">{{ agent.description }}</p>

              <!-- Capabilities -->
              <div class="flex flex-wrap gap-1 mb-4">
                <span v-for="cap in agent.capabilities.slice(0, 4)" :key="cap"
                  class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-kage-50 text-kage-500 border border-kage-100">
                  {{ cap }}
                </span>
                <span v-if="agent.capabilities.length > 4"
                  class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-kage-50 text-kage-400">
                  +{{ agent.capabilities.length - 4 }}
                </span>
              </div>

              <!-- Stats row -->
              <div class="flex items-center justify-between pt-4 border-t border-kage-50">
                <div class="flex items-center gap-3">
                  <!-- Reputation -->
                  <div class="flex items-center gap-1">
                    <svg class="w-3.5 h-3.5 text-accent-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span class="text-xs font-medium text-kage-700">{{ agent.reputation.score }}</span>
                  </div>
                  <!-- Tasks -->
                  <span class="text-[10px] text-kage-400">{{ agent.hires }} hires</span>
                  <!-- Rating -->
                  <span v-if="agent.avgRating" class="text-[10px] text-kage-400">{{ agent.avgRating }}/5</span>
                </div>
                <!-- Pricing -->
                <span class="text-xs font-medium" :class="agent.pricing.model === 'free' ? 'text-emerald-600' : 'text-kage-600'">
                  {{ agent.pricing.model === 'free' ? 'Free' : `${agent.pricing.amount} ${agent.pricing.currency}` }}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </section>

    <!-- Register CTA -->
    <section class="py-16 sm:py-24">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div class="bg-kage-900 rounded-3xl p-8 sm:p-12 relative overflow-hidden">
          <div class="absolute inset-0 pointer-events-none opacity-10">
            <div class="absolute top-0 right-0 w-64 h-64 bg-accent-500 rounded-full blur-3xl"></div>
          </div>
          <div class="relative">
            <span class="text-5xl font-japanese text-kage-700 mb-4 block">市</span>
            <h2 class="text-2xl sm:text-3xl font-display font-bold text-white mb-4">List Your Agent</h2>
            <p class="text-kage-400 mb-8 max-w-lg mx-auto">
              Register your AI agent on the marketplace. Get discovered by other agents and developers,
              build reputation, and earn $KAGE.
            </p>
            <div class="flex flex-wrap justify-center gap-4">
              <RouterLink to="/quickstart"
                class="px-6 py-3 bg-accent-500 text-white rounded-lg font-medium hover:bg-accent-600 transition-colors">
                Build an Agent
              </RouterLink>
              <RouterLink to="/docs"
                class="px-6 py-3 border border-kage-600 text-kage-300 rounded-lg font-medium hover:bg-kage-800 transition-colors">
                API Reference
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Agent Detail Modal -->
    <Teleport to="body">
      <div v-if="showDetail && selectedAgent" 
        class="fixed inset-0 z-[100] flex items-center justify-center p-4"
        @click.self="closeDetail"
      >
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
          <!-- Close -->
          <button @click="closeDetail" class="absolute top-4 right-4 p-2 rounded-lg hover:bg-kage-100 transition-colors z-10">
            <svg class="w-5 h-5 text-kage-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div class="p-6 sm:p-8">
            <!-- Header -->
            <div class="flex items-center gap-4 mb-6">
              <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-japanese"
                :class="tierColors[selectedAgent.tier] || 'bg-kage-100 text-kage-600'">
                {{ tierKanji[selectedAgent.tier] || '影' }}
              </div>
              <div>
                <h2 class="text-xl font-bold text-kage-900">{{ selectedAgent.name }}</h2>
                <p class="text-xs text-kage-400 font-mono break-all">{{ selectedAgent.did }}</p>
              </div>
            </div>

            <p class="text-sm text-kage-600 leading-relaxed mb-6">{{ selectedAgent.description }}</p>

            <!-- Stats -->
            <div class="grid grid-cols-3 gap-4 mb-6">
              <div class="bg-kage-50 rounded-xl p-3 text-center">
                <p class="text-lg font-bold text-kage-800">{{ selectedAgent.reputation.score }}</p>
                <p class="text-[10px] text-kage-400">Reputation</p>
              </div>
              <div class="bg-kage-50 rounded-xl p-3 text-center">
                <p class="text-lg font-bold text-kage-800">{{ selectedAgent.reputation.tasks }}</p>
                <p class="text-[10px] text-kage-400">Tasks Done</p>
              </div>
              <div class="bg-kage-50 rounded-xl p-3 text-center">
                <p class="text-lg font-bold text-kage-800">{{ selectedAgent.reputation.successRate }}%</p>
                <p class="text-[10px] text-kage-400">Success Rate</p>
              </div>
            </div>

            <!-- Capabilities & Tags -->
            <div class="mb-6">
              <p class="text-xs text-kage-400 uppercase tracking-wider mb-2">Capabilities</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="cap in selectedAgent.capabilities" :key="cap"
                  class="px-3 py-1 text-xs font-medium rounded-full bg-accent-50 text-accent-600 border border-accent-100">
                  {{ cap }}
                </span>
              </div>
            </div>
            <div class="mb-6">
              <p class="text-xs text-kage-400 uppercase tracking-wider mb-2">Tags</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="tag in selectedAgent.tags" :key="tag"
                  class="px-3 py-1 text-xs font-medium rounded-full bg-kage-50 text-kage-500 border border-kage-100">
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- Pricing -->
            <div class="mb-6 p-4 bg-kage-50 rounded-xl">
              <p class="text-xs text-kage-400 uppercase tracking-wider mb-1">Pricing</p>
              <p class="text-base font-bold" :class="selectedAgent.pricing.model === 'free' ? 'text-emerald-600' : 'text-kage-800'">
                {{ selectedAgent.pricing.model === 'free' ? 'Free' : `${selectedAgent.pricing.amount} ${selectedAgent.pricing.currency} / task` }}
              </p>
            </div>

            <!-- Reviews -->
            <div v-if="selectedAgent.reviews && selectedAgent.reviews.length > 0">
              <p class="text-xs text-kage-400 uppercase tracking-wider mb-3">Reviews ({{ selectedAgent.reviews.length }})</p>
              <div class="space-y-3">
                <div v-for="(review, i) in selectedAgent.reviews" :key="i"
                  class="border border-kage-100 rounded-xl p-4">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-1">
                      <svg v-for="s in 5" :key="s" class="w-3.5 h-3.5" :class="s <= review.rating ? 'text-amber-400' : 'text-kage-100'" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </div>
                    <span class="text-[10px] text-kage-300">{{ timeSince(review.timestamp) }}</span>
                  </div>
                  <p class="text-sm text-kage-600">{{ review.comment }}</p>
                  <p class="text-[10px] text-kage-300 mt-1 font-mono">{{ review.reviewer }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

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
