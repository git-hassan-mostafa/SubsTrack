import { create } from "zustand";
import type { AppUser } from "@/src/core/types";
import { UserService } from "../services/UserService";

interface UsersState {
  users: AppUser[];
  loading: boolean;
  error: string | null;
  getUsers: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  createUser: (
    data: {
      username: string;
      password: string;
      phone: string | null;
      role: "admin" | "user";
    },
    tenantId: string,
  ) => Promise<void>;
  updateUser: (
    id: string,
    currentUserId: string,
    currentUserRole: string,
    data: { username: string; phone: string | null; role: "admin" | "user" },
  ) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const userService = new UserService();

export const useUserStore = create<UsersState>((set, get) => ({
  users: [],
  loading: false,
  error: null,

  getUsers: async () => {
    if (!!get().users && get().users.length > 0) return;
    await get().fetchUsers();
  },
  fetchUsers: async () => {
    set({ loading: true, error: null });
    try {
      const users = await userService.getUsers();
      set({ users, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createUser: async (data, tenantId) => {
    set({ loading: true, error: null });
    try {
      const user = await userService.createUser(data, tenantId);
      set((state) => ({ users: [...state.users, user], loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
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
      );
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? updated : u)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set({ users: [], loading: false, error: null }),
}));
