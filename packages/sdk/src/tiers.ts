import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

/**
 * Kage tier levels based on $KAGE token holdings
 */
export enum KageTier {
  None = 'none',
  Shadow = 'shadow',
  Phantom = 'phantom',
  Specter = 'specter',
  Kage = 'kage',
}

/**
 * Tier thresholds in $KAGE tokens (assuming 6 decimals)
 */
export const TIER_THRESHOLDS = {
  [KageTier.Shadow]: 10_000 * 1e6,    // 10,000 $KAGE
  [KageTier.Phantom]: 100_000 * 1e6,  // 100,000 $KAGE
  [KageTier.Specter]: 500_000 * 1e6,  // 500,000 $KAGE
  [KageTier.Kage]: 1_000_000 * 1e6,   // 1,000,000 $KAGE
};

/**
 * Tier features and limits
 */
export interface TierFeatures {
  tier: KageTier;
  displayName: string;
  memoriesPerDay: number;
  unlimitedMemories: boolean;
  apiAccess: boolean;
  multiAgent: boolean;
  prioritySupport: boolean;
  daoVoting: boolean;
}

export const TIER_FEATURES: Record<KageTier, TierFeatures> = {
  [KageTier.None]: {
    tier: KageTier.None,
    displayName: 'No Access',
    memoriesPerDay: 0,
    unlimitedMemories: false,
    apiAccess: false,
    multiAgent: false,
    prioritySupport: false,
    daoVoting: false,
  },
  [KageTier.Shadow]: {
    tier: KageTier.Shadow,
    displayName: 'Shadow',
    memoriesPerDay: 10,
    unlimitedMemories: false,
    apiAccess: false,
    multiAgent: false,
    prioritySupport: false,
    daoVoting: false,
  },
  [KageTier.Phantom]: {
    tier: KageTier.Phantom,
    displayName: 'Phantom',
    memoriesPerDay: 100,
    unlimitedMemories: false,
    apiAccess: true,
    multiAgent: false,
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
    prioritySupport: true,
    daoVoting: true,
  },
};

/**
 * Determine tier based on token balance
 */
export function getTierFromBalance(balance: number): KageTier {
  if (balance >= TIER_THRESHOLDS[KageTier.Kage]) {
    return KageTier.Kage;
  }
  if (balance >= TIER_THRESHOLDS[KageTier.Specter]) {
    return KageTier.Specter;
  }
  if (balance >= TIER_THRESHOLDS[KageTier.Phantom]) {
    return KageTier.Phantom;
  }
  if (balance >= TIER_THRESHOLDS[KageTier.Shadow]) {
    return KageTier.Shadow;
  }
  return KageTier.None;
}

/**
 * Get tier features for a given tier
 */
export function getTierFeatures(tier: KageTier): TierFeatures {
  return TIER_FEATURES[tier];
}

/**
 * Kage Tier Manager - checks token balance and manages access
 */
export class KageTierManager {
  private connection: Connection;
  private kageMint: PublicKey;
  private cachedTier: KageTier | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60_000; // 1 minute cache

  constructor(rpcUrl: string, kageMintAddress: string) {
    this.connection = new Connection(rpcUrl);
    this.kageMint = new PublicKey(kageMintAddress);
  }

  /**
   * Check the tier for a given wallet
   */
  async checkTier(walletAddress: PublicKey): Promise<KageTier> {
    const now = Date.now();
    
    // Return cached tier if valid
    if (this.cachedTier !== null && now < this.cacheExpiry) {
      return this.cachedTier;
    }

    try {
      const tokenAccount = await getAssociatedTokenAddress(
        this.kageMint,
        walletAddress
      );

      const account = await getAccount(this.connection, tokenAccount);
      const balance = Number(account.amount);
      
      this.cachedTier = getTierFromBalance(balance);
      this.cacheExpiry = now + this.CACHE_TTL;
      
      return this.cachedTier;
    } catch (error) {
      // No token account = no tokens
      this.cachedTier = KageTier.None;
      this.cacheExpiry = now + this.CACHE_TTL;
      return KageTier.None;
    }
  }

  /**
   * Get features for a wallet
   */
  async getFeatures(walletAddress: PublicKey): Promise<TierFeatures> {
    const tier = await this.checkTier(walletAddress);
    return getTierFeatures(tier);
  }

  /**
   * Check if wallet has access to a specific feature
   */
  async hasAccess(walletAddress: PublicKey): Promise<boolean> {
    const tier = await this.checkTier(walletAddress);
    return tier !== KageTier.None;
  }

  /**
   * Check if wallet can store more memories today
   */
  async canStoreMemory(walletAddress: PublicKey, todayCount: number): Promise<boolean> {
    const features = await this.getFeatures(walletAddress);
    
    if (features.unlimitedMemories) {
      return true;
    }
    
    return todayCount < features.memoriesPerDay;
  }

  /**
   * Clear the cache (useful after token transfer)
   */
  clearCache(): void {
    this.cachedTier = null;
    this.cacheExpiry = 0;
  }
}

/**
 * Format token amount for display (assuming 6 decimals)
 */
export function formatKageAmount(amount: number): string {
  const tokens = amount / 1e6;
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }
  return tokens.toFixed(0);
}

/**
 * Get required tokens for next tier
 */
export function getTokensForNextTier(currentBalance: number): { nextTier: KageTier; required: number } | null {
  const currentTier = getTierFromBalance(currentBalance);
  
  const tierOrder = [KageTier.None, KageTier.Shadow, KageTier.Phantom, KageTier.Specter, KageTier.Kage];
  const currentIndex = tierOrder.indexOf(currentTier);
  
  if (currentIndex >= tierOrder.length - 1) {
    return null; // Already at max tier
  }
  
  const nextTier = tierOrder[currentIndex + 1];
  
  // None tier has no threshold
  if (nextTier === KageTier.None) {
    return null;
  }
  
  const threshold = TIER_THRESHOLDS[nextTier as keyof typeof TIER_THRESHOLDS];
  const required = threshold - currentBalance;
  
  return { nextTier, required: Math.max(0, required) };
}
