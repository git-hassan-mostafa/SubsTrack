import { create } from "zustand";
import type { AppUser, UserRole, TierPlan, TenantUsage } from "@/src/core/types";
import { UserService } from "../services/UserService";
import { useBranchStore } from "@/src/modules/branches/store/branchStore";
import { resolveBranchFilter } from "@/src/shared/lib/branchFilter";
import { useAuthStore } from "@/src/modules/auth/store/authStore";
import { useSubscriptionStore } from "@/src/modules/subscription/store/subscriptionStore";
import { TierLimitError } from "@/src/modules/subscription/services/TierService";
import type { TierLimitErrorPayload } from "@/src/modules/subscription/components/UpgradePromptModal";


const userService = new UserService();

function tenantHasBranches(): boolean {
  // A tenant "has branches" once at least one active branch is created.
  return useBranchStore.getState().branches.some((b) => b.active);
}

export const useUserStore = create<UsersState>((set, get) => ({
  users: [],
  loading: false,
  error: null,
  tierLimitError: null,

  getUsers: async () => {
    if (!!get().users && get().users.length > 0) return;
    await get().fetchUsers();
  },
  fetchUsers: async () => {
    set({ loading: true, error: null });
    try {
      const branchFilter = resolveBranchFilter(useAuthStore.getState().user);
      const users = await userService.getUsers(branchFilter);
      set({ users, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createUser: async (data, tenantId, tier, usage) => {
    set({ loading: true, error: null, tierLimitError: null });
    try {
      const user = await userService.createUser(
        data,
        tenantId,
        tenantHasBranches(),
        tier,
        usage,
      );
      set((state) => ({ users: [...state.users, user], loading: false }));
      void useSubscriptionStore.getState().refreshUsage();
    } catch (e) {
      if (e instanceof TierLimitError) {
        set({
          tierLimitError: { resource: e.resource, limit: e.limit, tierCode: e.tierCode },
          loading: false,
        });
      } else {
        set({ error: (e as Error).message, loading: false });
      }
    }
  },

  updateUser: async (id, currentUserId, currentUserRole, data) => {
    set({ loading: true, error: null });
    try {
      const updated = await userService.updateUser(
        id,
        currentUserId,
        currentUserRole,
        data,
        tenantHasBranches(),
      );
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? updated : u)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deactivateUser: async (id, callerId, callerRole, targetRole) => {
    set({ loading: true, error: null });
    try {
      const updated = await userService.deactivateUser(id, callerId, callerRole, targetRole);
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? updated : u)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  activateUser: async (id, callerId, callerRole, targetRole) => {
    set({ loading: true, error: null });
    try {
      const updated = await userService.activateUser(id, callerId, callerRole, targetRole);
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? updated : u)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deleteUser: async (id, callerId, callerRole, targetRole) => {
    set({ loading: true, error: null });
    try {
      const result = await userService.deleteUser(id, callerId, callerRole, targetRole);
      if (result.mode === 'hard') {
        set((state) => ({
          users: state.users.filter((u) => u.id !== id),
          loading: false,
        }));
      } else {
        set((state) => ({
          users: state.users.map((u) => (u.id === id ? result.user : u)),
          loading: false,
        }));
      }
      return result.mode;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return null;
    }
  },

  clearError: () => set({ error: null }),
  clearTierLimitError: () => set({ tierLimitError: null }),
  reset: () => set({ users: [], loading: false, error: null, tierLimitError: null }),
}));


interface UsersState {
  users: AppUser[];
  loading: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  getUsers: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  createUser: (
    data: {
      username: string;
      fullName: string;
      password: string;
      phone: string | null;
      role: "admin" | "user";
      branchId: string | null;
    },
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
  ) => Promise<void>;
  updateUser: (
    id: string,
    currentUserId: string,
    currentUserRole: string,
    data: { username: string; fullName: string; phone: string | null; role: "admin" | "user"; branchId: string | null },
  ) => Promise<void>;
  deactivateUser: (id: string, callerId: string, callerRole: UserRole, targetRole: UserRole) => Promise<void>;
  activateUser: (id: string, callerId: string, callerRole: UserRole, targetRole: UserRole) => Promise<void>;
  deleteUser: (id: string, callerId: string, callerRole: UserRole, targetRole: UserRole) => Promise<'hard' | 'soft' | null>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}