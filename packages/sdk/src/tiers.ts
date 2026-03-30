import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

export const KAGE_MINT = 'Fm5fvFsVQrkv77MZtJRr7vGB71voYYtDPiCWEfxspump';
export const KAGE_DECIMALS = 6;
export const KAGE_TOTAL_SUPPLY = 1_000_000_000_000; // 1 Trillion

/**
 * Token gating activates on this date. Before this, all features are free.
 * Override via KAGE_TOKEN_GATE_DATE env var (ISO string).
 * Default: April 13, 2026.
 */
export const TOKEN_GATE_ACTIVATION = new Date(
  (typeof process !== 'undefined' && process.env?.KAGE_TOKEN_GATE_DATE) || '2026-04-13T00:00:00Z'
);

export function isTokenGateActive(): boolean {
  return Date.now() >= TOKEN_GATE_ACTIVATION.getTime();
}

export enum KageTier {
  Free = 'free',
  Shadow = 'shadow',
  Phantom = 'phantom',
  Specter = 'specter',
  Kage = 'kage',
}

/**
 * Tier thresholds in raw token units (6 decimals).
 * Total supply: 1T. Tiers are percentage-based:
 *   Shadow  = 0.001%  = 10B tokens
 *   Phantom = 0.01%   = 100B tokens
 *   Specter = 0.05%   = 500B tokens
 *   Kage    = 0.1%    = 1T tokens (1B displayed)
 */
export const TIER_THRESHOLDS = {
  [KageTier.Shadow]:  10_000_000_000  * 1e6,  // 10B $KAGE  (0.001%)
  [KageTier.Phantom]: 100_000_000_000 * 1e6,  // 100B $KAGE (0.01%)
  [KageTier.Specter]: 500_000_000_000 * 1e6,  // 500B $KAGE (0.05%)
  [KageTier.Kage]:    1_000_000_000_000 * 1e6, // 1T $KAGE   (0.1%)
};

export const TIER_DISPLAY = {
  [KageTier.Free]:    { kanji: '無', name: 'Free',    amount: '0',    pct: '0%' },
  [KageTier.Shadow]:  { kanji: '影', name: 'Shadow',  amount: '10B',  pct: '0.001%' },
  [KageTier.Phantom]: { kanji: '幻', name: 'Phantom', amount: '100B', pct: '0.01%' },
  [KageTier.Specter]: { kanji: '霊', name: 'Specter', amount: '500B', pct: '0.05%' },
  [KageTier.Kage]:    { kanji: '忍', name: 'Kage',    amount: '1T',   pct: '0.1%' },
};

export interface TierFeatures {
  tier: KageTier;
  displayName: string;
  memoriesPerDay: number;
  unlimitedMemories: boolean;
  apiAccess: boolean;
  multiAgent: boolean;
  zkProofs: boolean;
  teamVaults: boolean;
  prioritySupport: boolean;
  daoVoting: boolean;
}

export const TIER_FEATURES: Record<KageTier, TierFeatures> = {
  [KageTier.Free]: {
    tier: KageTier.Free,
    displayName: 'Free',
    memoriesPerDay: 5,
    unlimitedMemories: false,
    apiAccess: true,
    multiAgent: false,
    zkProofs: false,
    teamVaults: false,
    prioritySupport: false,
    daoVoting: false,
  },
  [KageTier.Shadow]: {
    tier: KageTier.Shadow,
    displayName: 'Shadow',
    memoriesPerDay: 50,
    unlimitedMemories: false,
    apiAccess: true,
    multiAgent: true,
    zkProofs: false,
    teamVaults: false,
    prioritySupport: false,
    daoVoting: false,
  },
  [KageTier.Phantom]: {
    tier: KageTier.Phantom,
    displayName: 'Phantom',
    memoriesPerDay: 500,
    unlimitedMemories: false,
    apiAccess: true,
    multiAgent: true,
    zkProofs: true,
    teamVaults: false,
    prioritySupport: false,
    daoVoting: false,
  },
  [KageTier.Specter]: {
    tier: KageTier.Specter,
    displayName: 'Specter',
    memoriesPerDay: -1,
    unlimitedMemories: true,
    apiAccess: true,
    multiAgent: true,
    zkProofs: true,
    teamVaults: true,
    prioritySupport: false,
    daoVoting: false,
  },
  [KageTier.Kage]: {
    tier: KageTier.Kage,
    displayName: 'Kage',
    memoriesPerDay: -1,
    unlimitedMemories: true,
    apiAccess: true,
    multiAgent: true,
    zkProofs: true,
    teamVaults: true,
    prioritySupport: true,
    daoVoting: true,
  },
};

export function getTierFromBalance(rawBalance: number): KageTier {
  if (rawBalance >= TIER_THRESHOLDS[KageTier.Kage])    return KageTier.Kage;
  if (rawBalance >= TIER_THRESHOLDS[KageTier.Specter])  return KageTier.Specter;
  if (rawBalance >= TIER_THRESHOLDS[KageTier.Phantom])  return KageTier.Phantom;
  if (rawBalance >= TIER_THRESHOLDS[KageTier.Shadow])   return KageTier.Shadow;
  return KageTier.Free;
}

/**
 * Effective tier: if token gate is not yet active, everyone gets Kage tier.
 */
export function getEffectiveTier(rawBalance: number): KageTier {
  if (!isTokenGateActive()) return KageTier.Kage;
  return getTierFromBalance(rawBalance);
}

export function getTierFeatures(tier: KageTier): TierFeatures {
  return TIER_FEATURES[tier];
}

export class KageTierManager {
  private connection: Connection;
  private kageMint: PublicKey;
  private cache = new Map<string, { tier: KageTier; expiry: number }>();
  private readonly CACHE_TTL = 60_000;

  constructor(rpcUrl: string, kageMintAddress: string = KAGE_MINT) {
    this.connection = new Connection(rpcUrl);
    this.kageMint = new PublicKey(kageMintAddress);
  }

  async checkTier(walletAddress: PublicKey): Promise<KageTier> {
    if (!isTokenGateActive()) return KageTier.Kage;

    const key = walletAddress.toBase58();
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiry) return cached.tier;

    try {
      const ata = await getAssociatedTokenAddress(this.kageMint, walletAddress);
      const account = await getAccount(this.connection, ata);
      const tier = getTierFromBalance(Number(account.amount));
      this.cache.set(key, { tier, expiry: Date.now() + this.CACHE_TTL });
      return tier;
    } catch {
      const tier = KageTier.Free;
      this.cache.set(key, { tier, expiry: Date.now() + this.CACHE_TTL });
      return tier;
    }
  }

  async getFeatures(walletAddress: PublicKey): Promise<TierFeatures> {
    const tier = await this.checkTier(walletAddress);
    return getTierFeatures(tier);
  }

  async canStoreMemory(walletAddress: PublicKey, todayCount: number): Promise<boolean> {
    const features = await this.getFeatures(walletAddress);
    return features.unlimitedMemories || todayCount < features.memoriesPerDay;
  }

  clearCache(wallet?: string): void {
    if (wallet) this.cache.delete(wallet);
    else this.cache.clear();
  }
}

export function formatKageAmount(rawAmount: number): string {
  const tokens = rawAmount / 1e6;
  if (tokens >= 1_000_000_000_000) return `${(tokens / 1_000_000_000_000).toFixed(0)}T`;
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(0)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return tokens.toFixed(0);
}

export function getTokensForNextTier(currentBalance: number): { nextTier: KageTier; required: number } | null {
  const currentTier = getTierFromBalance(currentBalance);
  const tierOrder = [KageTier.Free, KageTier.Shadow, KageTier.Phantom, KageTier.Specter, KageTier.Kage];
  const idx = tierOrder.indexOf(currentTier);
  if (idx >= tierOrder.length - 1) return null;
  const nextTier = tierOrder[idx + 1];
  const threshold = TIER_THRESHOLDS[nextTier as keyof typeof TIER_THRESHOLDS];
  if (!threshold) return null;
  return { nextTier, required: Math.max(0, threshold - currentBalance) };
}

export function daysUntilTokenGate(): number {
  const ms = TOKEN_GATE_ACTIVATION.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}
