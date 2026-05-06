import { create } from 'zustand';
import type { Tenant } from '@/src/core/types';
import { TenantService, type CreateTenantInput, type UpdateTenantInput } from '../services/TenantService';

interface TenantState {
  tenants: Tenant[];
  loading: boolean;
  error: string | null;
  fetchTenants: () => Promise<void>;
  createTenant: (data: CreateTenantInput) => Promise<boolean>;
  updateTenant: (id: string, data: UpdateTenantInput) => Promise<boolean>;
  deleteTenant: (id: string) => Promise<void>;
  clearError: () => void;
}

const tenantService = new TenantService();

export const useTenantStore = create<TenantState>((set) => ({
  tenants: [],
  loading: false,
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
