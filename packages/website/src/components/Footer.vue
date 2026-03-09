<script setup lang="ts">
const links = {
  product: [
    { name: "Features", href: "#features" },
    { name: "How It Works", href: "#how-it-works" },
    { name: "Use Cases", href: "#use-cases" },
    { name: "Roadmap", href: "#" },
  ],
  developers: [
    { name: "Documentation", href: "#" },
    { name: "SDK Reference", href: "#" },
    { name: "GitHub", href: "https://github.com/ranulfmeier/kage" },
    { name: "Examples", href: "#" },
  ],
  ecosystem: [
    { name: "Umbra Privacy", href: "https://umbraprivacy.com" },
    { name: "Solana", href: "https://solana.com" },
    { name: "ElizaOS", href: "https://elizaos.ai" },
  ],
};

const socialLinks = [
  { name: "GitHub", href: "https://github.com/ranulfmeier/kage", icon: "github" },
  { name: "Twitter", href: "https://x.com/kage_agent", icon: "twitter" },
  { name: "Discord", href: "#", icon: "discord" },
];
</script>

<template>
  <footer class="bg-kage-800 text-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
        <!-- Brand -->
        <div class="col-span-2 md:col-span-1">
          <div class="flex items-center gap-2 mb-4">
            <img 
              src="/kage_logo.png" 
              alt="Kage Logo" 
              class="h-16 sm:h-20 w-auto invert"
            />
          </div>
          <p class="text-kage-300 text-sm leading-relaxed mb-6">
            Shadow Memory Protocol for Autonomous Agents. Privacy-first encrypted memory vault on Solana.
          </p>
          <div class="flex gap-4">
            <a
              v-for="social in socialLinks"
              :key="social.name"
              :href="social.href"
              target="_blank"
              class="w-10 h-10 rounded-lg bg-kage-700 hover:bg-kage-600 flex items-center justify-center transition-colors"
            >
              <!-- GitHub -->
              <svg v-if="social.icon === 'github'" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
              </svg>
              <!-- Twitter -->
              <svg v-if="social.icon === 'twitter'" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <!-- Discord -->
              <svg v-if="social.icon === 'discord'" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
              </svg>
            </a>
          </div>
        </div>

        <!-- Product -->
        <div>
          <h4 class="font-semibold mb-4">Product</h4>
          <ul class="space-y-3">
            <li v-for="link in links.product" :key="link.name">
              <a :href="link.href" class="text-kage-300 hover:text-white transition-colors text-sm">
                {{ link.name }}
              </a>
            </li>
          </ul>
        </div>

        <!-- Developers -->
        <div>
          <h4 class="font-semibold mb-4">Developers</h4>
          <ul class="space-y-3">
            <li v-for="link in links.developers" :key="link.name">
              <a :href="link.href" :target="link.href.startsWith('http') ? '_blank' : undefined" class="text-kage-300 hover:text-white transition-colors text-sm">
                {{ link.name }}
              </a>
            </li>
          </ul>
        </div>

        <!-- Ecosystem -->
        <div>
          <h4 class="font-semibold mb-4">Ecosystem</h4>
          <ul class="space-y-3">
            <li v-for="link in links.ecosystem" :key="link.name">
              <a :href="link.href" target="_blank" class="text-kage-300 hover:text-white transition-colors text-sm">
                {{ link.name }}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom -->
      <div class="pt-8 border-t border-kage-700 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="text-kage-400 text-sm">
          © 2026 Kage Protocol. Open source under MIT license.
        </p>
        <p class="text-kage-400 text-sm">
          Built with <span class="text-accent-400">♥</span> on Solana
        </p>
      </div>
    </div>
  </footer>
</template>
