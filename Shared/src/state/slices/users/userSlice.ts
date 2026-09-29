import type { StateCreator } from "zustand";
import type { AppUser, UserRole } from "@shared/core/types";
import userService from "@shared/modules/admin/users/services/UserService";
import type {
  UserCreateInput,
  UserUpdateInput,
} from "@shared/modules/admin/users/utils/types";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import type { GlobalState } from "@shared/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";

// Writes resolve to the saved user, or null when refused or failed.
export interface UserSlice {
  items: AppUser[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  getUsers: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  createUser: (data: UserCreateInput, tenantId: string) => Promise<AppUser | null>;
  updateUser: (
    id: string,
    currentUserId: string,
    currentUserRole: string,
    data: UserUpdateInput,
  ) => Promise<AppUser | null>;
  deactivateUser: (
    id: string,
    callerId: string,
    callerRole: UserRole,
    targetRole: UserRole,
  ) => Promise<AppUser | null>;
  activateUser: (
    id: string,
    callerId: string,
    callerRole: UserRole,
    targetRole: UserRole,
  ) => Promise<AppUser | null>;
  deleteUser: (
    id: string,
    callerId: string,
    callerRole: UserRole,
    targetRole: UserRole,
  ) => Promise<"hard" | "soft" | null>;
  bulkDeleteUsers: (
    targets: { id: string; role: UserRole }[],
    callerId: string,
    callerRole: UserRole,
  ) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

export const createUserSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  UserSlice
> = (set, get) => {
  const tenantHasBranches = () => get().branches.items.some((b) => b.active);

  const startWrite = () =>
    set((state) => {
      state.users.loading = true;
      state.users.error = null;
    });

  const failWrite = (e: unknown) =>
    set((state) => {
      state.users.error = (e as Error).message;
      state.users.loading = false;
    });

  const replaceItem = (user: AppUser) =>
    set((state) => {
      const i = state.users.items.findIndex((u) => u.id === user.id);
      if (i !== -1) state.users.items[i] = user;
      state.users.loading = false;
    });

  return {
    items: [],
    loaded: false,
    loading: false,
    error: null,

    getUsers: async () => {
      const { loaded, loading } = get().users;
      if (loaded || loading) return;
      await get().users.fetchUsers();
    },

    fetchUsers: async () => {
      const epoch = currentDataEpoch();
      set((state) => {
        state.users.loading = true;
        state.users.error = null;
      });
      try {
        const branchFilter = resolveBranchFilter(get().auth.user);
        const items = await userService.getUsers(branchFilter);
        if (isStaleEpoch(epoch)) return;
        set((state) => {
          state.users.items = items;
          state.users.loaded = true;
          state.users.loading = false;
        });
      } catch (e) {
        if (isStaleEpoch(epoch)) return;
        failWrite(e);
      }
    },

    createUser: async (data, tenantId) => {
      startWrite();
      try {
        const user = await userService.createUser(
          data,
          tenantId,
          tenantHasBranches(),
        );
        set((state) => {
          state.users.items.push(user);
          state.users.loading = false;
        });
        return user;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    updateUser: async (id, currentUserId, currentUserRole, data) => {
      startWrite();
      try {
        const updated = await userService.updateUser(
          id,
          currentUserId,
          currentUserRole,
          data,
          tenantHasBranches(),
        );
        replaceItem(updated);
        return updated;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    deactivateUser: async (id, callerId, callerRole, targetRole) => {
      startWrite();
      try {
        const updated = await userService.deactivateUser(
          id,
          callerId,
          callerRole,
          targetRole,
        );
        replaceItem(updated);
        return updated;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    activateUser: async (id, callerId, callerRole, targetRole) => {
      startWrite();
      try {
        const updated = await userService.activateUser(
          id,
          callerId,
          callerRole,
          targetRole,
        );
        replaceItem(updated);
        return updated;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    deleteUser: async (id, callerId, callerRole, targetRole) => {
      startWrite();
      try {
        const result = await userService.deleteUser(
          id,
          callerId,
          callerRole,
          targetRole,
        );
        if (result.mode === "hard") {
          set((state) => {
            state.users.items = state.users.items.filter((u) => u.id !== id);
            state.users.loading = false;
          });
        } else {
          replaceItem(result.user);
        }
        return result.mode;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    bulkDeleteUsers: async (targets, callerId, callerRole) => {
      if (targets.length === 0) return true;
      startWrite();
      try {
        const { hard, soft } = await userService.deleteUsers(
          targets,
          callerId,
          callerRole,
        );
        set((state) => {
          const removed = new Set(hard);
          const softened = new Set(soft);
          state.users.items = state.users.items.filter(
            (u) => !removed.has(u.id),
          );
          for (const u of state.users.items) {
            if (softened.has(u.id)) u.active = false;
          }
          state.users.loading = false;
        });
        return true;
      } catch (e) {
        failWrite(e);
        return false;
      }
    },

    clearError: () =>
      set((state) => {
        state.users.error = null;
      }),
    reset: () =>
      set((state) => {
        state.users.items = [];
        state.users.loaded = false;
        state.users.loading = false;
        state.users.error = null;
      }),
  };
};
