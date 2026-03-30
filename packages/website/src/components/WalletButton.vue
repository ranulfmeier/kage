<script setup lang="ts">
import { ref, computed } from 'vue';
import { useWallet } from 'solana-wallets-vue';

const { publicKey, connected, disconnect, select, wallets, connecting } = useWallet();
const showDropdown = ref(false);
const showModal = ref(false);

const shortAddress = computed(() => {
  if (!publicKey.value) return '';
  const addr = publicKey.value.toBase58();
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
});

const fullAddress = computed(() => publicKey.value?.toBase58() ?? '');

const availableWallets = computed(() =>
  wallets.value.filter(w => w.readyState === 'Installed' || w.readyState === 'Loadable')
);

function handleConnect(walletName: string) {
  select(walletName as any);
  showModal.value = false;
}

function handleDisconnect() {
  disconnect();
  showDropdown.value = false;
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value;
}

function closeDropdown(e: Event) {
  const target = e.target as HTMLElement;
  if (!target.closest('.wallet-dropdown-container')) {
    showDropdown.value = false;
  }
}

const copied = ref(false);
async function copyAddress() {
  if (!fullAddress.value) return;
  await navigator.clipboard.writeText(fullAddress.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <!-- Connected state -->
  <div v-if="connected && publicKey" class="relative wallet-dropdown-container">
    <button
      @click="toggleDropdown"
      class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 border"
      :class="[
        $attrs.variant === 'dark'
          ? 'bg-kage-800 text-kage-200 border-kage-700 hover:bg-kage-700'
          : 'bg-white/80 text-kage-700 border-kage-200 hover:bg-white hover:border-accent-400/50'
      ]"
    >
      <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse-soft"></span>
      <span class="font-mono text-xs">{{ shortAddress }}</span>
      <svg class="w-3.5 h-3.5 transition-transform" :class="showDropdown ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown -->
    <Teleport to="body">
      <div v-if="showDropdown" class="fixed inset-0 z-[100]" @click="showDropdown = false">
        <div
          class="absolute right-4 top-16 w-64 bg-white/95 backdrop-blur-xl rounded-xl border border-kage-200 shadow-kage p-2 animate-fade-in-down"
          @click.stop
        >
          <div class="px-3 py-2 mb-1">
            <p class="text-[10px] uppercase tracking-widest text-kage-400 mb-1">Connected</p>
            <p class="font-mono text-xs text-kage-600 break-all">{{ fullAddress }}</p>
          </div>

          <button
            @click="copyAddress"
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-kage-600 hover:bg-kage-50 transition-colors"
          >
            <svg v-if="!copied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <svg v-else class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            {{ copied ? 'Copied!' : 'Copy address' }}
          </button>

          <a
            :href="`https://explorer.solana.com/address/${fullAddress}?cluster=devnet`"
            target="_blank"
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-kage-600 hover:bg-kage-50 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Explorer
          </a>

          <div class="border-t border-kage-100 my-1"></div>

          <button
            @click="handleDisconnect"
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-accent-600 hover:bg-accent-50 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Disconnect
          </button>
        </div>
      </div>
    </Teleport>
  </div>

  <!-- Connecting state -->
  <button
    v-else-if="connecting"
    disabled
    class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium opacity-70 cursor-wait"
    :class="[
      $attrs.variant === 'dark'
        ? 'bg-kage-800 text-kage-300 border border-kage-700'
        : 'bg-white/60 text-kage-500 border border-kage-200'
    ]"
  >
    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    Connecting...
  </button>

  <!-- Disconnected state -->
  <div v-else>
    <button
      @click="showModal = true"
      class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300"
      :class="[
        $attrs.variant === 'dark'
          ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white hover:from-accent-600 hover:to-accent-700 shadow-lg shadow-accent-500/20'
          : 'bg-kage-900 text-white hover:bg-kage-800'
      ]"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
      Connect Wallet
    </button>

    <!-- Wallet selection modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4" @click.self="showModal = false">
        <div class="absolute inset-0 bg-kage-950/60 backdrop-blur-sm"></div>
        <div class="relative w-full max-w-sm bg-white rounded-2xl border border-kage-200 shadow-kage-lg overflow-hidden animate-scale-in">
          <!-- Header -->
          <div class="px-6 pt-6 pb-4 border-b border-kage-100">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-display font-bold text-kage-900">Connect Wallet</h3>
                <p class="text-xs text-kage-400 mt-0.5">Select a Solana wallet</p>
              </div>
              <button @click="showModal = false" class="p-1.5 rounded-lg hover:bg-kage-100 transition-colors">
                <svg class="w-5 h-5 text-kage-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Wallet list -->
          <div class="p-3 space-y-1.5 max-h-80 overflow-y-auto">
            <button
              v-for="wallet in availableWallets"
              :key="wallet.adapter.name"
              @click="handleConnect(wallet.adapter.name)"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-kage-50 transition-all duration-200 group border border-transparent hover:border-kage-200"
            >
              <img :src="wallet.adapter.icon" :alt="wallet.adapter.name" class="w-8 h-8 rounded-lg" />
              <div class="text-left flex-1">
                <p class="text-sm font-medium text-kage-800 group-hover:text-kage-900">{{ wallet.adapter.name }}</p>
                <p class="text-[10px] text-kage-400">
                  {{ wallet.readyState === 'Installed' ? 'Detected' : 'Available' }}
                </p>
              </div>
              <svg class="w-4 h-4 text-kage-300 group-hover:text-accent-500 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <!-- No wallets detected -->
            <div v-if="availableWallets.length === 0" class="px-4 py-8 text-center">
              <svg class="w-12 h-12 mx-auto text-kage-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <p class="text-sm text-kage-500 mb-1">No wallet detected</p>
              <p class="text-xs text-kage-400 mb-4">Install a Solana wallet to continue</p>
              <div class="flex justify-center gap-3">
                <a
                  href="https://phantom.app"
                  target="_blank"
                  class="text-xs text-accent-600 hover:text-accent-700 underline underline-offset-2"
                >
                  Get Phantom
                </a>
                <a
                  href="https://solflare.com"
                  target="_blank"
                  class="text-xs text-accent-600 hover:text-accent-700 underline underline-offset-2"
                >
                  Get Solflare
                </a>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-3 bg-kage-50/50 border-t border-kage-100">
            <p class="text-[10px] text-kage-400 text-center">
              <span class="font-japanese">影</span> Kage — Devnet
            </p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
