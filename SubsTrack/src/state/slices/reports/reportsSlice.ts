import type { StateCreator } from 'zustand';
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
import type { GlobalState } from '@/src/state/globalStore';

export type ReportSection = 'money' | 'debts';

const getUnpaidRule = (get: () => GlobalState): UnpaidStartRule =>
  tenantSettingService.parseUnpaidStartRule(
    get().tenantSettings.items.find((s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule)?.value,
  );

export interface ReportsSlice {
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

export const createReportsSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  ReportsSlice
> = (set, get) => ({
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
    const { period, section } = get().reports;
    const branchFilter = resolveBranchFilter(get().auth.user);
    const token = get().reports.token + 1;
    set((state) => {
      state.reports.token = token;
      state.reports.loading = true;
      state.reports.error = null;
    });
    try {
      const filter = { period, branchFilter };
      if (section === 'money') {
        const money = await reportsService.getMoneyReport(filter);
        if (get().reports.token !== token) return;
        set((state) => {
          state.reports.money = money;
          state.reports.loading = false;
        });
      } else {
        const debts = await reportsService.getDebtsReport(filter, getUnpaidRule(get));
        if (get().reports.token !== token) return;
        set((state) => {
          state.reports.debts = debts;
          state.reports.loading = false;
        });
      }
    } catch (e) {
      if (get().reports.token !== token) return;
      set((state) => {
        state.reports.error = (e as Error).message;
        state.reports.loading = false;
      });
    }
  },

  setPeriod: async (period) => {
    // Both reports are period-scoped, so the other section's cached answer is
    // stale the moment the period moves — drop it rather than show old numbers
    // under a new date range.
    set((state) => {
      state.reports.period = period;
      state.reports.money = null;
      state.reports.debts = null;
    });
    await get().reports.fetchSection();
  },

  setPreset: async (preset) => {
    await get().reports.setPeriod(periodFromPreset(preset));
  },

  setSection: async (section) => {
    set((state) => {
      state.reports.section = section;
    });
    const { money, debts } = get().reports;
    if ((section === 'money' && money) || (section === 'debts' && debts)) return;
    await get().reports.fetchSection();
  },

  refresh: async () => {
    set((state) => {
      state.reports.money = null;
      state.reports.debts = null;
    });
    await get().reports.fetchSection();
  },

  clearError: () =>
    set((state) => {
      state.reports.error = null;
    }),

  reset: () =>
    set((state) => {
      state.reports.period = periodFromPreset('this_month');
      state.reports.section = 'money';
      state.reports.money = null;
      state.reports.debts = null;
      state.reports.loading = false;
      state.reports.error = null;
    }),
});
