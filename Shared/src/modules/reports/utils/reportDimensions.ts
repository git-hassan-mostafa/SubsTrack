import type { ReportGroup } from "@shared/modules/reports/utils/analysis";
import type { ReportKpi } from "@shared/modules/reports/utils/reportKpis";
import type { TimeGrain } from "@shared/modules/reports/utils/timeBuckets";

export type ReportDimension =
  | "stream"
  | "collector"
  | "customer"
  | "plan"
  | "currency"
  | "branch"
  | "time"
  | "category"
  | "source"
  | "recorded_by"
  | "kind"
  | "age"
  | "item"
  | "line_type"
  | "status"
  | "type"
  | "area";

export type DimensionFilter<D extends ReportDimension = ReportDimension> = Partial<Record<D, string>>;

export interface SectionViewState {
  filter: DimensionFilter;
  groupBy: ReportDimension;
  grain: TimeGrain | null;
}

// What a section page renders: headline numbers, the table, and what each filter may pick.
export interface AnalysisView<R, D extends ReportDimension> {
  kpis: ReportKpi[];
  groups: ReportGroup<R>[];
  rows: R[];
  options: Partial<Record<D, string[]>>;
  names: ReadonlyMap<string, string>;
  grain: TimeGrain;
}

export const DIMENSION_LABEL_KEY: Record<ReportDimension, string> = {
  stream: "reports.dim_stream",
  collector: "reports.dim_collector",
  customer: "reports.dim_customer",
  plan: "reports.dim_plan",
  currency: "reports.dim_currency",
  branch: "reports.dim_branch",
  time: "reports.dim_time",
  category: "reports.dim_category",
  source: "reports.dim_source",
  recorded_by: "reports.dim_recorded_by",
  kind: "reports.dim_kind",
  age: "reports.dim_age",
  item: "reports.dim_item",
  line_type: "reports.dim_line_type",
  status: "reports.dim_status",
  type: "reports.dim_type",
  area: "reports.dim_area",
};

export const AGE_BUCKETS = ["0_30", "31_60", "61_90", "91_180", "181_plus"] as const;

export type AgeBucket = (typeof AGE_BUCKETS)[number];

export function ageBucket(daysLate: number): AgeBucket {
  if (daysLate <= 30) return "0_30";
  if (daysLate <= 60) return "31_60";
  if (daysLate <= 90) return "61_90";
  if (daysLate <= 180) return "91_180";
  return "181_plus";
}

export function withoutTime(filter: DimensionFilter): DimensionFilter {
  const rest = { ...filter };
  delete rest.time;
  return rest;
}

export function namesFrom<R>(
  rows: readonly R[],
  pick: (row: R) => [string | null, string | null | undefined][],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const row of rows) {
    for (const [key, name] of pick(row)) if (key && name) names.set(key, name);
  }
  return names;
}
