import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";

import SolanaWallets from "solana-wallets-vue";
import "solana-wallets-vue/styles.css";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";

const walletOptions = {
  wallets: [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
  ],
  autoConnect: true,
};

createApp(App).use(router).use(SolanaWallets, walletOptions).mount("#app");
