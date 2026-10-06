import type {
  DimensionFilter,
  ReportDimension,
  SectionViewState,
} from "@shared/modules/reports/utils/reportDimensions";
import type { TimeGrain } from "@shared/modules/reports/utils/timeBuckets";

export type ReportSection =
  | "money"
  | "money_in"
  | "money_out"
  | "debts"
  | "customers"
  | "sales"
  | "staff";

export type ReportDataset = "money" | "debts" | "customers" | "sales";

export const REPORT_SECTIONS: readonly ReportSection[] = [
  "money",
  "money_in",
  "money_out",
  "debts",
  "customers",
  "sales",
  "staff",
];

export const SECTION_LABEL_KEY: Record<ReportSection, string> = {
  money: "reports.section_overview",
  money_in: "reports.money_in",
  money_out: "reports.money_out",
  debts: "reports.section_debts",
  customers: "reports.section_customers",
  sales: "reports.section_sales",
  staff: "reports.section_staff",
};

// What a section reads; two sections sharing a dataset share one read.
export const SECTION_DATASETS: Record<ReportSection, readonly ReportDataset[]> = {
  money: ["money"],
  money_in: ["money"],
  money_out: ["money"],
  debts: ["debts"],
  customers: ["customers"],
  sales: ["sales", "money"],
  staff: ["money", "sales"],
};

const view = (groupBy: ReportDimension): SectionViewState => ({
  filter: {},
  groupBy,
  grain: null,
});

export function defaultViews(): Record<ReportSection, SectionViewState> {
  return {
    money: view("time"),
    money_in: view("stream"),
    money_out: view("category"),
    debts: view("customer"),
    customers: view("plan"),
    sales: view("item"),
    staff: view("collector"),
  };
}

export function withFilter(
  state: SectionViewState,
  dim: ReportDimension,
  key: string | null,
): SectionViewState {
  const filter: DimensionFilter = { ...state.filter };
  if (key === null) delete filter[dim];
  else filter[dim] = key;
  return { ...state, filter };
}

// A time key only means something at the step it was picked at.
export function withGrain(state: SectionViewState, grain: TimeGrain | null): SectionViewState {
  return { ...withFilter(state, "time", null), grain };
}

// The dimensions still worth splitting one group by: not the one shown, not one already pinned.
export function splitTargets(
  dims: readonly ReportDimension[],
  state: SectionViewState,
): ReportDimension[] {
  return dims.filter((dim) => dim !== state.groupBy && state.filter[dim] === undefined);
}

// Narrow to one group, then split it by the next question.
export function drilledInto(
  state: SectionViewState,
  dim: ReportDimension,
  key: string,
  next: ReportDimension,
): SectionViewState {
  return { ...withFilter(state, dim, key), groupBy: next };
}
