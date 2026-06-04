import type { StateCreator } from 'zustand';
import type { AppUser, UserRole, TierPlan, TenantUsage } from '@/src/core/types';
import { UserService } from '@/src/modules/users/services/UserService';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { TierLimitError } from '@/src/modules/subscription/services/TierService';
import type { TierLimitErrorPayload } from '@/src/modules/subscription/components/UpgradePromptModal';
import type { GlobalState } from '@/src/state/globalStore';

const userService = new UserService();

interface UserCreateInput {
  username: string;
  fullName: string;
  password: string;
  phone: string | null;
  role: 'admin' | 'user';
  branchId: string | null;
}

interface UserUpdateInput {
  username: string;
  fullName: string;
  phone: string | null;
  role: 'admin' | 'user';
  branchId: string | null;
}

export interface UserSlice {
  items: AppUser[];
  loading: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  getUsers: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  createUser: (
    data: UserCreateInput,
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
  ) => Promise<void>;
  updateUser: (
    id: string,
    currentUserId: string,
    currentUserRole: string,
    data: UserUpdateInput,
  ) => Promise<void>;
  deactivateUser: (id: string, callerId: string, callerRole: UserRole, targetRole: UserRole) => Promise<void>;
  activateUser: (id: string, callerId: string, callerRole: UserRole, targetRole: UserRole) => Promise<void>;
  deleteUser: (id: string, callerId: string, callerRole: UserRole, targetRole: UserRole) => Promise<'hard' | 'soft' | null>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}

export const createUserSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  UserSlice
> = (set, get) => {
  const tenantHasBranches = () => get().branches.items.some((b) => b.active);

  return {
    items: [],
    loading: false,
    error: null,
    tierLimitError: null,

    getUsers: async () => {
      if (get().users.items.length > 0) return;
      await get().users.fetchUsers();
    },

    fetchUsers: async () => {
      set((state) => {
        state.users.loading = true;
        state.users.error = null;
      });
      try {
        const branchFilter = resolveBranchFilter(get().auth.user);
        const items = await userService.getUsers(branchFilter);
        set((state) => {
          state.users.items = items;
          state.users.loading = false;
        });
      } catch (e) {
        set((state) => {
          state.users.error = (e as Error).message;
          state.users.loading = false;
        });
      }
    },

    createUser: async (data, tenantId, tier, usage) => {
      set((state) => {
        state.users.loading = true;
        state.users.error = null;
        state.users.tierLimitError = null;
      });
      try {
        const user = await userService.createUser(data, tenantId, tenantHasBranches(), tier, usage);
        set((state) => {
          state.users.items.push(user);
          state.users.loading = false;
        });
        void get().subscription.refreshUsage();
      } catch (e) {
        if (e instanceof TierLimitError) {
          set((state) => {
            state.users.tierLimitError = {
              resource: e.resource,
              limit: e.limit,
              tierCode: e.tierCode,
            };
            state.users.loading = false;
          });
        } else {
          set((state) => {
            state.users.error = (e as Error).message;
            state.users.loading = false;
          });
        }
      }
    },

    updateUser: async (id, currentUserId, currentUserRole, data) => {
      set((state) => {
        state.users.loading = true;
        state.users.error = null;
      });
      try {
        const updated = await userService.updateUser(
          id,
          currentUserId,
          currentUserRole,
          data,
          tenantHasBranches(),
        );
        set((state) => {
          const i = state.users.items.findIndex((u) => u.id === id);
          if (i !== -1) state.users.items[i] = updated;
          state.users.loading = false;
        });
      } catch (e) {
        set((state) => {
          state.users.error = (e as Error).message;
          state.users.loading = false;
        });
      }
    },

    deactivateUser: async (id, callerId, callerRole, targetRole) => {
      set((state) => {
        state.users.loading = true;
        state.users.error = null;
      });
      try {
        const updated = await userService.deactivateUser(id, callerId, callerRole, targetRole);
        set((state) => {
          const i = state.users.items.findIndex((u) => u.id === id);
          if (i !== -1) state.users.items[i] = updated;
          state.users.loading = false;
        });
      } catch (e) {
        set((state) => {
          state.users.error = (e as Error).message;
          state.users.loading = false;
        });
      }
    },

    activateUser: async (id, callerId, callerRole, targetRole) => {
      set((state) => {
        state.users.loading = true;
        state.users.error = null;
      });
      try {
        const updated = await userService.activateUser(id, callerId, callerRole, targetRole);
        set((state) => {
          const i = state.users.items.findIndex((u) => u.id === id);
          if (i !== -1) state.users.items[i] = updated;
          state.users.loading = false;
        });
      } catch (e) {
        set((state) => {
          state.users.error = (e as Error).message;
          state.users.loading = false;
        });
      }
    },

    deleteUser: async (id, callerId, callerRole, targetRole) => {
      set((state) => {
        state.users.loading = true;
        state.users.error = null;
      });
      try {
        const result = await userService.deleteUser(id, callerId, callerRole, targetRole);
        if (result.mode === 'hard') {
          set((state) => {
            state.users.items = state.users.items.filter((u) => u.id !== id);
            state.users.loading = false;
          });
        } else {
          set((state) => {
            const i = state.users.items.findIndex((u) => u.id === id);
            if (i !== -1) state.users.items[i] = result.user;
            state.users.loading = false;
          });
        }
        return result.mode;
      } catch (e) {
        set((state) => {
          state.users.error = (e as Error).message;
          state.users.loading = false;
        });
        return null;
      }
    },

    clearError: () =>
      set((state) => {
        state.users.error = null;
      }),
    clearTierLimitError: () =>
      set((state) => {
        state.users.tierLimitError = null;
      }),
    reset: () =>
      set((state) => {
        state.users.items = [];
        state.users.loading = false;
        state.users.error = null;
        state.users.tierLimitError = null;
      }),
  };
};
