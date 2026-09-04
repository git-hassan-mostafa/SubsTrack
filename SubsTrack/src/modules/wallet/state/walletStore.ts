import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AuthUser, UserWallet, UserWalletDetail } from '@/src/core/types';
import walletService from '@/src/modules/wallet/services/WalletService';
import type { WalletActor } from '@/src/modules/wallet/utils/custody';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { getStore } from '@/src/state/globalStore';


// The signed-in user as the chain sees them. Role + branch decide every wallet
// permission, so they travel together into the service (never re-derived there).
function actorOf(user: AuthUser): WalletActor {
  return { id: user.id, role: user.role, branchId: user.branchId };
}

/** The viewer, or null when nobody is signed in. */
function viewer(): AuthUser | null {
  return getStore().getState().auth.user;
}

export interface WalletState {
  items: UserWallet[];
  detail: UserWalletDetail | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  detailToken: number;

  fetchWallets: () => Promise<void>;
  fetchDetail: (holderUserId: string) => Promise<void>;
  clearDetail: () => void;
  receiveFrom: (holderUserId: string, ids: string[]) => Promise<void>;
  receiveAllFrom: (holderUserId: string) => Promise<void>;
  closeOutItems: (ids: string[]) => Promise<void>;
  closeOutAll: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>()(
  immer((set, get) => {
    // Every mutation ends the same way: refresh the open detail, then the list.
    async function refresh(holderUserId: string): Promise<void> {
      if (get().detail?.holderUserId === holderUserId) {
        await get().fetchDetail(holderUserId);
      }
      await get().fetchWallets();
    }

    // One try/catch for all four mutations — they differ only in the call.
    async function mutate(run: () => Promise<void>, holderUserId: string): Promise<void> {
      try {
        await run();
        await refresh(holderUserId);
      } catch (e) {
        set((s) => {
          s.error = e instanceof Error ? e.message : String(e);
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
        const user = viewer();
        if (!user) return;
        set((s) => {
          s.loading = true;
          s.error = null;
        });
        try {
          const items = await walletService.getWalletsView(
            actorOf(user),
            resolveBranchFilter(user),
          );
          set((s) => {
            s.items = items;
            s.loading = false;
          });
        } catch (e) {
          set((s) => {
            s.error = e instanceof Error ? e.message : String(e);
            s.loading = false;
          });
        }
      },

      fetchDetail: async (holderUserId) => {
        const user = viewer();
        if (!user) return;
        const token = get().detailToken + 1;
        set((s) => {
          s.detailLoading = true;
          s.error = null;
          s.detailToken = token;
        });
        try {
          const detail = await walletService.getWalletDetail(
            holderUserId,
            actorOf(user),
            resolveBranchFilter(user),
          );
          set((s) => {
            if (s.detailToken !== token) return;
            s.detail = detail;
            s.detailLoading = false;
          });
        } catch (e) {
          set((s) => {
            if (s.detailToken !== token) return;
            s.error = e instanceof Error ? e.message : String(e);
            s.detailLoading = false;
          });
        }
      },

      clearDetail: () => {
        set((s) => {
          s.detail = null;
        });
      },

      receiveFrom: async (holderUserId, ids) => {
        const user = viewer();
        if (!user) return;
        await mutate(
          () => walletService.receiveFrom(holderUserId, ids, actorOf(user)),
          holderUserId,
        );
      },

      receiveAllFrom: async (holderUserId) => {
        const user = viewer();
        if (!user) return;
        await mutate(
          () =>
            walletService.receiveAllFrom(holderUserId, actorOf(user), resolveBranchFilter(user)),
          holderUserId,
        );
      },

      closeOutItems: async (ids) => {
        const user = viewer();
        if (!user) return;
        await mutate(() => walletService.closeOut(ids, actorOf(user)), user.id);
      },

      closeOutAll: async () => {
        const user = viewer();
        if (!user) return;
        await mutate(
          () => walletService.closeOutAll(actorOf(user), resolveBranchFilter(user)),
          user.id,
        );
      },

      clearError: () => {
        set((s) => {
          s.error = null;
        });
      },

      reset: () => {
        set((s) => {
          s.items = [];
          s.detail = null;
          s.loading = false;
          s.detailLoading = false;
          s.error = null;
          s.detailToken += 1;
        });
      },
    };
  }),
);
