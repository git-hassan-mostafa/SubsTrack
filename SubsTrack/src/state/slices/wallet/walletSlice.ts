import type { StateCreator } from 'zustand';
import type { AuthUser, UserWallet, UserWalletDetail } from '@/src/core/types';
import walletService from '@/src/modules/wallet/services/WalletService';
import type { WalletActor } from '@/src/modules/wallet/utils/custody';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '../../globalStore';

// The signed-in user as the chain sees them. Role + branch decide every wallet
// permission, so they travel together into the service (never re-derived there).
function actorOf(user: AuthUser): WalletActor {
  return { id: user.id, role: user.role, branchId: user.branchId };
}

export interface WalletSlice {
  // Admin view: one entry per user holding cash. Sorted most-first.
  items: UserWallet[];
  // The wallet currently open in the detail sheet (admin) or self-view.
  detail: UserWalletDetail | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  // Last-write-wins guard for concurrent detail fetches.
  detailToken: number;

  fetchWallets: () => Promise<void>;
  fetchDetail: (holderUserId: string) => Promise<void>;
  clearDetail: () => void;
  // Per-transaction handover: takes the given hand-overs off `holderUserId` and
  // puts them in the viewer's wallet (or out of the system for the owner).
  receiveFrom: (holderUserId: string, ids: string[]) => Promise<void>;
  // "Receive everything from this holder" — empties their wallet into yours.
  receiveAllFrom: (holderUserId: string) => Promise<void>;
  // Settle your OWN cash: banked, out of the system.
  closeOutItems: (ids: string[]) => Promise<void>;
  closeOutAll: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createWalletSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  WalletSlice
> = (set, get) => {
  // Every mutation ends the same way: refresh the open detail, then the list.
  async function refresh(holderUserId: string): Promise<void> {
    if (get().wallet.detail?.holderUserId === holderUserId) {
      await get().wallet.fetchDetail(holderUserId);
    }
    await get().wallet.fetchWallets();
  }

  // One try/catch for all four mutations — they differ only in the call.
  async function mutate(run: () => Promise<void>, holderUserId: string): Promise<void> {
    try {
      await run();
      await refresh(holderUserId);
    } catch (e) {
      set((s) => {
        s.wallet.error = e instanceof Error ? e.message : String(e);
      });
      throw e;
    }
  }

  return {
    items: [],
    detail: null,
    loading: false,
    detailLoading: false,
    error: null,
    detailToken: 0,

    fetchWallets: async () => {
      const user = get().auth.user;
      if (!user) return;
      set((s) => {
        s.wallet.loading = true;
        s.wallet.error = null;
      });
      try {
        const items = await walletService.getWalletsView(actorOf(user), resolveBranchFilter(user));
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

    fetchDetail: async (holderUserId) => {
      const user = get().auth.user;
      if (!user) return;
      const token = get().wallet.detailToken + 1;
      set((s) => {
        s.wallet.detailLoading = true;
        s.wallet.error = null;
        s.wallet.detailToken = token;
      });
      try {
        const detail = await walletService.getWalletDetail(
          holderUserId,
          actorOf(user),
          resolveBranchFilter(user),
        );
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

    receiveFrom: async (holderUserId, ids) => {
      const user = get().auth.user;
      if (!user) return;
      await mutate(
        () => walletService.receiveFrom(holderUserId, ids, actorOf(user)),
        holderUserId,
      );
    },

    receiveAllFrom: async (holderUserId) => {
      const user = get().auth.user;
      if (!user) return;
      await mutate(
        () => walletService.receiveAllFrom(holderUserId, actorOf(user), resolveBranchFilter(user)),
        holderUserId,
      );
    },

    closeOutItems: async (ids) => {
      const user = get().auth.user;
      if (!user) return;
      await mutate(() => walletService.closeOut(ids, actorOf(user)), user.id);
    },

    closeOutAll: async () => {
      const user = get().auth.user;
      if (!user) return;
      await mutate(
        () => walletService.closeOutAll(actorOf(user), resolveBranchFilter(user)),
        user.id,
      );
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
  };
};
