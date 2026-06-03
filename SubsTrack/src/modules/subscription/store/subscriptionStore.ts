import { create } from 'zustand';
import type { TierPlan, TenantUsage, Tenant } from '@/src/core/types';
import { tierService } from '../services/TierService';

interface SubscriptionState {
  tiers: TierPlan[];
  currentTier: TierPlan | null;
  usage: TenantUsage;
  loading: boolean;
  upgrading: boolean;
  error: string | null;
  init: (tenantId: string, tier: TierPlan | null) => Promise<void>;
  refreshUsage: () => Promise<void>;
  upgrade: (tenantId: string, tierId: string) => Promise<Tenant>;
  clearError: () => void;
  reset: () => void;
}

const EMPTY_USAGE: TenantUsage = {
  customers: 0,
  users: 0,
  plans: 0,
  branches: 0,
  currencies: 0,
};

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tiers: [],
  currentTier: null,
  usage: EMPTY_USAGE,
  loading: false,
  upgrading: false,
  error: null,

  init: async (_tenantId, tier) => {
    set({ loading: true, error: null, currentTier: tier });
    try {
      const [tiers, usage] = await Promise.all([
        tierService.fetchTiers(),
        tierService.fetchUsage(),
      ]);
      set({ tiers, usage, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  refreshUsage: async () => {
    try {
      const usage = await tierService.fetchUsage();
      set({ usage });
    } catch (e) {
      // refreshUsage runs in the background after a create — don't block UI on it
      console.warn('[subscriptionStore] refreshUsage failed', e);
    }
  },

  upgrade: async (tenantId, tierId) => {
    if (get().upgrading) {
      throw new Error('Upgrade already in progress');
    }
    set({ upgrading: true, error: null });
    try {
      const tenant = await tierService.upgradeTenant(tenantId, tierId);
      set({ currentTier: tenant.tier ?? null, upgrading: false });
      await get().refreshUsage();
      return tenant;
    } catch (e) {
      set({ error: (e as Error).message, upgrading: false });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
  reset: () =>
    set({
      tiers: [],
      currentTier: null,
      usage: EMPTY_USAGE,
      loading: false,
      upgrading: false,
      error: null,
    }),
}));

// Selector hook used by payment-related screens to read the current tier's
// grace days. Returns 0 if no tier is loaded yet.
export function useGraceDays(): number {
  return useSubscriptionStore((s) => s.currentTier?.graceDays ?? 0);
}
