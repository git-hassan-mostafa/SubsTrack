import type { StateCreator } from 'zustand';
import type { CollectorWallet, CollectorWalletDetail, WalletSource } from '@/src/core/types';
import walletService from '@/src/modules/wallet/services/WalletService';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '../../globalStore';

export interface WalletSlice {
  // Admin view: one entry per collector who still holds cash. Sorted most-first.
  items: CollectorWallet[];
  // The collector currently open in the detail sheet (admin) or self-view.
  detail: CollectorWalletDetail | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  // Last-write-wins guard for concurrent detail fetches.
  detailToken: number;

  fetchWallets: () => Promise<void>;
  fetchDetail: (collectorUserId: string) => Promise<void>;
  clearDetail: () => void;
  // Per-transaction settle. Marks the given items received, then refreshes.
  receiveItems: (items: { source: WalletSource; id: string }[]) => Promise<void>;
  // "Receive everything from this collector" — empties their wallet.
  receiveAllFromCollector: (collectorUserId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createWalletSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  WalletSlice
> = (set, get) => ({
  items: [],
  detail: null,
  loading: false,
  detailLoading: false,
  error: null,
  detailToken: 0,

  fetchWallets: async () => {
    set((s) => {
      s.wallet.loading = true;
      s.wallet.error = null;
    });
    try {
      const branchFilter = resolveBranchFilter(get().auth.user);
      const items = await walletService.getWalletsView(branchFilter);
      set((s) => {
        s.wallet.items = items;
        s.wallet.loading = false;
      });
    } catch (e) {
      set((s) => {
        s.wallet.error = e instanceof Error ? e.message : String(e);
        s.wallet.loading = false;
      });
    }
  },

  fetchDetail: async (collectorUserId) => {
    const token = get().wallet.detailToken + 1;
    set((s) => {
      s.wallet.detailLoading = true;
      s.wallet.error = null;
      s.wallet.detailToken = token;
    });
    try {
      const branchFilter = resolveBranchFilter(get().auth.user);
      const detail = await walletService.getWalletDetail(collectorUserId, branchFilter);
      set((s) => {
        // Ignore a stale response (a newer fetch started meanwhile).
        if (s.wallet.detailToken !== token) return;
        s.wallet.detail = detail;
        s.wallet.detailLoading = false;
      });
    } catch (e) {
      set((s) => {
        if (s.wallet.detailToken !== token) return;
        s.wallet.error = e instanceof Error ? e.message : String(e);
        s.wallet.detailLoading = false;
      });
    }
  },

  clearDetail: () => {
    set((s) => {
      s.wallet.detail = null;
    });
  },

  receiveItems: async (items) => {
    const user = get().auth.user;
    if (!user) return;
    try {
      await walletService.receiveItems(items, user.id, user.role);
      // Refresh the open detail + the collector list.
      const detailId = get().wallet.detail?.collectorUserId;
      if (detailId) await get().wallet.fetchDetail(detailId);
      await get().wallet.fetchWallets();
    } catch (e) {
      set((s) => {
        s.wallet.error = e instanceof Error ? e.message : String(e);
      });
      throw e;
    }
  },

  receiveAllFromCollector: async (collectorUserId) => {
    const user = get().auth.user;
    if (!user) return;
    try {
      const branchFilter = resolveBranchFilter(user);
      await walletService.receiveAllFromCollector(collectorUserId, user.id, user.role, branchFilter);
      if (get().wallet.detail?.collectorUserId === collectorUserId) {
        await get().wallet.fetchDetail(collectorUserId);
      }
      await get().wallet.fetchWallets();
    } catch (e) {
      set((s) => {
        s.wallet.error = e instanceof Error ? e.message : String(e);
      });
      throw e;
    }
  },

  clearError: () => {
    set((s) => {
      s.wallet.error = null;
    });
  },

  reset: () => {
    set((s) => {
      s.wallet.items = [];
      s.wallet.detail = null;
      s.wallet.loading = false;
      s.wallet.detailLoading = false;
      s.wallet.error = null;
      s.wallet.detailToken += 1;
    });
  },
});
