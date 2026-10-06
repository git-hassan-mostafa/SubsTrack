import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { UnpaidStartRule } from "@shared/core/types";
import {
  periodFromPreset,
  type PeriodPreset,
  type ReportPeriod,
} from "@shared/core/utils/dateRange";
import reportsService from "@shared/modules/reports/services/ReportsService";
import type {
  ReportDimension,
  SectionViewState,
} from "@shared/modules/reports/utils/reportDimensions";
import {
  defaultViews,
  drilledInto,
  SECTION_DATASETS,
  withFilter,
  withGrain,
  type ReportDataset,
  type ReportSection,
} from "@shared/modules/reports/utils/reportSections";
import type { TimeGrain } from "@shared/modules/reports/utils/timeBuckets";
import type {
  CustomersReport,
  DebtsReport,
  MoneyReport,
  ReportsFilter,
  SalesReport,
} from "@shared/modules/reports/utils/types";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import { isFreshRead, readStamp, type ReadStamp } from "@shared/shared/lib/readStamp";
import { parseUnpaidStartRule } from "@shared/modules/admin/tenant-settings/utils/unpaidStartRule";
import { TENANT_SETTING_KEYS } from "@shared/modules/admin/tenant-settings/utils/constants";
import { getStore } from "@shared/state/globalStore";

export type { ReportSection };

interface Datasets {
  money: MoneyReport | null;
  debts: DebtsReport | null;
  customers: CustomersReport | null;
  sales: SalesReport | null;
}

type DatasetValue = Datasets[ReportDataset];

const getUnpaidRule = (): UnpaidStartRule =>
  parseUnpaidStartRule(
    getStore()
      .getState()
      .tenantSettings.items.find(
        (s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule,
      )?.value,
  );

const currentBranch = () => resolveBranchFilter(getStore().getState().auth.user);

const owedVersion = () => getStore().getState().ledger.owedVersion;

function readDataset(dataset: ReportDataset, filter: ReportsFilter): Promise<DatasetValue> {
  switch (dataset) {
    case "money":
      return reportsService.getMoneyReport(filter);
    case "debts":
      return reportsService.getDebtsReport(filter, getUnpaidRule());
    case "customers":
      return reportsService.getCustomersReport(filter);
    case "sales":
      return reportsService.getSalesReport(filter);
  }
}

const NO_DATA: Datasets = { money: null, debts: null, customers: null, sales: null };

export interface ReportsState extends Datasets {
  period: ReportPeriod;
  section: ReportSection;
  stamps: Partial<Record<ReportDataset, ReadStamp>>;
  views: Record<ReportSection, SectionViewState>;
  loading: boolean;
  error: string | null;
  token: number;
  setPeriod: (period: ReportPeriod) => Promise<void>;
  setPreset: (preset: PeriodPreset) => Promise<void>;
  setSection: (section: ReportSection) => Promise<void>;
  fetchSection: () => Promise<void>;
  ensureSection: () => Promise<void>;
  refresh: () => Promise<void>;
  reloadIfLoaded: () => Promise<void>;
  setFilter: (section: ReportSection, dim: ReportDimension, key: string | null) => void;
  clearFilters: (section: ReportSection) => void;
  setGroupBy: (section: ReportSection, dim: ReportDimension) => void;
  setGrain: (section: ReportSection, grain: TimeGrain | null) => void;
  drillInto: (
    section: ReportSection,
    dim: ReportDimension,
    key: string,
    next: ReportDimension,
  ) => void;
  clearError: () => void;
  reset: () => void;
}

export const useReportsStore = create<ReportsState>()(
  immer((set, get) => {
    const load = async (force: boolean) => {
      const { period, section } = get();
      const branchFilter = currentBranch();
      const version = owedVersion();
      const needed = SECTION_DATASETS[section].filter(
        (dataset) =>
          force ||
          get()[dataset] === null ||
          !isFreshRead(get().stamps[dataset] ?? null, branchFilter, version),
      );
      if (needed.length === 0) return;
      const token = get().token + 1;
      const stamp = readStamp(branchFilter, version);
      set((state) => {
        state.token = token;
        state.loading = true;
        state.error = null;
      });
      try {
        const filter = { period, branchFilter };
        const results = await Promise.all(needed.map((dataset) => readDataset(dataset, filter)));
        if (get().token !== token) return;
        set((state) => {
          needed.forEach((dataset, i) => {
            Object.assign(state, { [dataset]: results[i] });
            state.stamps[dataset] = stamp;
          });
          state.loading = false;
        });
      } catch (e) {
        if (get().token !== token) return;
        set((state) => {
          state.error = (e as Error).message;
          state.loading = false;
        });
      }
    };

    const patchView = (
      section: ReportSection,
      next: (view: SectionViewState) => SectionViewState,
    ) =>
      set((state) => {
        state.views[section] = next(state.views[section]);
      });

    return {
      ...NO_DATA,
      period: periodFromPreset("this_month"),
      section: "money",
      stamps: {},
      views: defaultViews(),
      loading: false,
      error: null,
      token: 0,

      fetchSection: () => load(true),

      ensureSection: () => load(false),

      setPeriod: async (period) => {
        set((state) => {
          Object.assign(state, NO_DATA);
          state.period = period;
          state.stamps = {};
        });
        await load(false);
      },

      setPreset: async (preset) => {
        await get().setPeriod(periodFromPreset(preset));
      },

      setSection: async (section) => {
        set((state) => {
          state.section = section;
        });
        await load(false);
      },

      refresh: async () => {
        set((state) => {
          Object.assign(state, NO_DATA);
          state.stamps = {};
        });
        await load(false);
      },

      reloadIfLoaded: async () => {
        const held = SECTION_DATASETS[get().section].some((dataset) => get()[dataset] !== null);
        if (held) await load(true);
      },

      setFilter: (section, dim, key) => patchView(section, (v) => withFilter(v, dim, key)),

      clearFilters: (section) => patchView(section, (v) => ({ ...v, filter: {} })),

      setGroupBy: (section, dim) => patchView(section, (v) => ({ ...v, groupBy: dim })),

      setGrain: (section, grain) => patchView(section, (v) => withGrain(v, grain)),

      drillInto: (section, dim, key, next) =>
        patchView(section, (v) => drilledInto(v, dim, key, next)),

      clearError: () =>
        set((state) => {
          state.error = null;
        }),

      reset: () =>
        set((state) => {
          Object.assign(state, NO_DATA);
          state.period = periodFromPreset("this_month");
          state.section = "money";
          state.stamps = {};
          state.views = defaultViews();
          state.loading = false;
          state.error = null;
          state.token += 1;
        }),
    };
  }),
);
