import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "events", "process"],
      globals: { Buffer: true, process: true },
    }),
  ],
  server: {
    port: 3000,
  },
  optimizeDeps: {
    include: ["@solana/web3.js", "solana-wallets-vue"],
  },
});
