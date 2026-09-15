import { create } from 'zustand';
import type { Tenant, TenantCounts } from '@/src/core/types';
import { TenantService, type CreateTenantInput, type UpdateTenantInput } from '../services/TenantService';

interface TenantState {
  tenants: Tenant[];
  counts: TenantCounts | null;
  loading: boolean;
  countsLoading: boolean;
  error: string | null;
  fetchTenants: () => Promise<void>;
  fetchCounts: (tenantId: string) => Promise<void>;
  createTenant: (data: CreateTenantInput) => Promise<boolean>;
  updateTenant: (id: string, data: UpdateTenantInput) => Promise<boolean>;
  acceptRequest: (tenantId: string, requestId: string, granted: number) => Promise<boolean>;
  declineRequest: (tenantId: string, requestId: string) => Promise<boolean>;
  deleteTenant: (id: string) => Promise<void>;
  clearError: () => void;
}

const tenantService = new TenantService();

export const useTenantStore = create<TenantState>((set, get) => ({
  tenants: [],
  counts: null,
  loading: false,
  countsLoading: false,
  error: null,

  fetchTenants: async () => {
    set({ loading: true, error: null });
    try {
      const tenants = await tenantService.getTenants();
      set({ tenants, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  // Cleared up front so a reopened sheet can never show another tenant's counts.
  fetchCounts: async (tenantId) => {
    set({ counts: null, countsLoading: true, error: null });
    try {
      const counts = await tenantService.getTenantCounts(tenantId);
      set({ counts, countsLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, countsLoading: false });
    }
  },

  createTenant: async (data) => {
    set({ loading: true, error: null });
    try {
      const tenant = await tenantService.createTenant(data);
      set((state) => ({ tenants: [...state.tenants, tenant], loading: false }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  updateTenant: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const updated = await tenantService.updateTenant(id, data);
      set((state) => ({
        tenants: state.tenants.map((t) => (t.id === id ? updated : t)),
        loading: false,
      }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  // Patches the raised allowance in from what the write returned.
  acceptRequest: async (tenantId, requestId, granted) => {
    set({ loading: true, error: null });
    try {
      const current = get().tenants.find((t) => t.id === tenantId);
      const { allowance } = await tenantService.acceptRequest(
        requestId,
        granted,
        current?.customerAllowance ?? 0,
      );
      set((state) => ({
        tenants: state.tenants.map((t) =>
          t.id === tenantId
            ? { ...t, customerAllowance: allowance, pendingRequest: null }
            : t,
        ),
        loading: false,
      }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  declineRequest: async (tenantId, requestId) => {
    set({ loading: true, error: null });
    try {
      await tenantService.declineRequest(requestId);
      set((state) => ({
        tenants: state.tenants.map((t) =>
          t.id === tenantId ? { ...t, pendingRequest: null } : t,
        ),
        loading: false,
      }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  deleteTenant: async (id) => {
    set({ loading: true, error: null });
    try {
      await tenantService.deleteTenant(id);
      set((state) => ({ tenants: state.tenants.filter((t) => t.id !== id), loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
