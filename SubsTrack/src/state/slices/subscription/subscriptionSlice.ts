import type { StateCreator } from 'zustand';
import type { TierPlan, TenantUsage, Tenant } from '@/src/core/types';
import { tierService } from '@/src/modules/subscription/services/TierService';
import type { GlobalState } from '@/src/state/globalStore';

const EMPTY_USAGE: TenantUsage = {
  customers: 0,
  users: 0,
  plans: 0,
  branches: 0,
  currencies: 0,
};

export interface SubscriptionSlice {
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

export const createSubscriptionSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  SubscriptionSlice
> = (set, get) => ({
  tiers: [],
  currentTier: null,
  usage: EMPTY_USAGE,
  loading: false,
  upgrading: false,
  error: null,

  init: async (_tenantId, tier) => {
    set((state) => {
      state.subscription.loading = true;
      state.subscription.error = null;
      state.subscription.currentTier = tier;
    });
    try {
      const [tiers, usage] = await Promise.all([
        tierService.fetchTiers(),
        tierService.fetchUsage(),
      ]);
      set((state) => {
        state.subscription.tiers = tiers;
        state.subscription.usage = usage;
        state.subscription.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.subscription.error = (e as Error).message;
        state.subscription.loading = false;
      });
    }
  },

  refreshUsage: async () => {
    try {
      const usage = await tierService.fetchUsage();
      set((state) => {
        state.subscription.usage = usage;
      });
    } catch (e) {
      console.warn('[subscriptionSlice] refreshUsage failed', e);
    }
  },

  upgrade: async (tenantId, tierId) => {
    if (get().subscription.upgrading) {
      throw new Error('Upgrade already in progress');
    }
    set((state) => {
      state.subscription.upgrading = true;
      state.subscription.error = null;
    });
    try {
      const tenant = await tierService.upgradeTenant(tenantId, tierId);
      set((state) => {
        state.subscription.currentTier = tenant.tier ?? null;
        state.subscription.upgrading = false;
      });
      await get().subscription.refreshUsage();
      return tenant;
    } catch (e) {
      set((state) => {
        state.subscription.error = (e as Error).message;
        state.subscription.upgrading = false;
      });
      throw e;
    }
  },

  clearError: () =>
    set((state) => {
      state.subscription.error = null;
    }),

  reset: () =>
    set((state) => {
      state.subscription.tiers = [];
      state.subscription.currentTier = null;
      state.subscription.usage = EMPTY_USAGE;
      state.subscription.loading = false;
      state.subscription.upgrading = false;
      state.subscription.error = null;
    }),
});
