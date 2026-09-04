import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { UnpaidStartRule } from '@/src/core/types';
import {
  periodFromPreset,
  type PeriodPreset,
  type ReportPeriod,
} from '@/src/core/utils/dateRange';
import reportsService from '@/src/modules/reports/services/ReportsService';
import type { DebtsReport, MoneyReport } from '@/src/modules/reports/utils/types';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
// Deep imports (not the module barrel) — the barrel re-exports screens.
import tenantSettingService from '@/src/modules/admin/tenant-settings/services/TenantSettingService';
import { TENANT_SETTING_KEYS } from '@/src/modules/admin/tenant-settings/utils/constants';
import { getStore } from '@/src/state/globalStore';

// A MODULE store, not a global slice: only the Reports screen reads it, and no slice reads
// it back. `auth` + `tenantSettings` are read across through the global
// store — the one allowed direction.
// See CLAUDE.md → State Management.

export type ReportSection = 'money' | 'debts';

const getUnpaidRule = (): UnpaidStartRule =>
  tenantSettingService.parseUnpaidStartRule(
    getStore()
      .getState()
      .tenantSettings.items.find((s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule)?.value,
  );

export interface ReportsState {
  // The filter session — survives navigating away, cleared on logout.
  period: ReportPeriod;
  section: ReportSection;
  money: MoneyReport | null;
  debts: DebtsReport | null;
  loading: boolean;
  error: string | null;
  // Last-write-wins guard: a branch change and a period change can be in flight
  // together, and the older answer must not overwrite the newer one.
  token: number;
  setPeriod: (period: ReportPeriod) => Promise<void>;
  setPreset: (preset: PeriodPreset) => Promise<void>;
  setSection: (section: ReportSection) => Promise<void>;
  fetchSection: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useReportsStore = create<ReportsState>()(
  immer((set, get) => ({
    period: periodFromPreset('this_month'),
    section: 'money',
    money: null,
    debts: null,
    loading: false,
    error: null,
    token: 0,

    // Only the section on screen is fetched — the other one loads when it is
    // opened, so a period change costs one report, not all of them.
    fetchSection: async () => {
      const { period, section } = get();
      const branchFilter = resolveBranchFilter(getStore().getState().auth.user);
      const token = get().token + 1;
      set((state) => {
        state.token = token;
        state.loading = true;
        state.error = null;
      });
      try {
        const filter = { period, branchFilter };
        if (section === 'money') {
          const money = await reportsService.getMoneyReport(filter);
          if (get().token !== token) return;
          set((state) => {
            state.money = money;
            state.loading = false;
          });
        } else {
          const debts = await reportsService.getDebtsReport(filter, getUnpaidRule());
          if (get().token !== token) return;
          set((state) => {
            state.debts = debts;
            state.loading = false;
          });
        }
      } catch (e) {
        if (get().token !== token) return;
        set((state) => {
          state.error = (e as Error).message;
          state.loading = false;
        });
      }
    },

    setPeriod: async (period) => {
      // Both reports are period-scoped, so the other section's cached answer is
      // stale the moment the period moves — drop it rather than show old numbers
      // under a new date range.
      set((state) => {
        state.period = period;
        state.money = null;
        state.debts = null;
      });
      await get().fetchSection();
    },

    setPreset: async (preset) => {
      await get().setPeriod(periodFromPreset(preset));
    },

    setSection: async (section) => {
      set((state) => {
        state.section = section;
      });
      const { money, debts } = get();
      if ((section === 'money' && money) || (section === 'debts' && debts)) return;
      await get().fetchSection();
    },

    refresh: async () => {
      set((state) => {
        state.money = null;
        state.debts = null;
      });
      await get().fetchSection();
    },

    clearError: () =>
      set((state) => {
        state.error = null;
      }),

    reset: () =>
      set((state) => {
        state.period = periodFromPreset('this_month');
        state.section = 'money';
        state.money = null;
        state.debts = null;
        state.loading = false;
        state.error = null;
      }),
  })),
);
