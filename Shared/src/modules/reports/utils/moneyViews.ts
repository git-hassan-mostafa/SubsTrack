import type { CashRow, ExpenseItem } from "@shared/core/types";
import type { ReportPeriod } from "@shared/core/utils/dateRange";
import { delta } from "@shared/modules/reports/utils/aggregate";
import {
  applyFilter,
  filterOptions,
  groupRows,
  NO_KEY,
  type KeyOf,
  type ReportGroup,
} from "@shared/modules/reports/utils/analysis";
import {
  namesFrom,
  withoutTime,
  type AnalysisView,
  type SectionViewState,
} from "@shared/modules/reports/utils/reportDimensions";
import {
  count,
  money,
  moneyKpis,
  ratioOf,
  type ReportKpi,
} from "@shared/modules/reports/utils/reportKpis";
import { snapshotUsd, sumUsd } from "@shared/core/utils/currency";
import {
  bucketOf,
  defaultGrain,
  periodBuckets,
  type TimeGrain,
} from "@shared/modules/reports/utils/timeBuckets";
import type { MoneyReport } from "@shared/modules/reports/utils/types";

export const CASH_DIMENSIONS = [
  "stream",
  "collector",
  "customer",
  "plan",
  "currency",
  "branch",
  "time",
] as const;

export type CashDimension = (typeof CASH_DIMENSIONS)[number];

export const CASH_FILTERS: readonly CashDimension[] = [
  "stream",
  "collector",
  "customer",
  "plan",
  "currency",
];

export const EXPENSE_DIMENSIONS = [
  "category",
  "source",
  "recorded_by",
  "branch",
  "time",
] as const;

export type ExpenseDimension = (typeof EXPENSE_DIMENSIONS)[number];

export const EXPENSE_FILTERS: readonly ExpenseDimension[] = [
  "category",
  "source",
  "recorded_by",
];

export interface TrendRow {
  key: string;
  inUsd: number;
  outUsd: number;
  netUsd: number;
}

export function cashKeyOf(grain: TimeGrain): KeyOf<CashRow, CashDimension> {
  return (row, dim) => {
    switch (dim) {
      case "stream":
        return row.stream;
      case "collector":
        return row.receivedByUserId ?? NO_KEY;
      case "customer":
        return row.customerId ?? NO_KEY;
      case "plan":
        return row.planId ?? NO_KEY;
      case "currency":
        return row.currencyId ?? NO_KEY;
      case "branch":
        return row.branchId ?? NO_KEY;
      case "time":
        return bucketOf(row.date, grain);
    }
  };
}

export function expenseKeyOf(grain: TimeGrain): KeyOf<ExpenseItem, ExpenseDimension> {
  return (row, dim) => {
    switch (dim) {
      case "category":
        return row.category;
      case "source":
        return row.source;
      case "recorded_by":
        return row.recordedByUserId ?? NO_KEY;
      case "branch":
        return row.branchId ?? NO_KEY;
      case "time":
        return bucketOf(row.date, grain);
    }
  };
}

const distinct = (keys: (string | null)[]) => new Set(keys.filter((k) => k !== null)).size;

// Money in and out side by side per bucket; empty buckets stay as zero rows.
export function moneyTrend(
  report: Pick<MoneyReport, "cash" | "expenses">,
  period: ReportPeriod,
  grain: TimeGrain,
): TrendRow[] {
  const rows = new Map(
    periodBuckets(period, grain).map((key) => [key, { key, inUsd: 0, outUsd: 0, netUsd: 0 }]),
  );
  const at = (iso: string) => {
    const key = bucketOf(iso, grain);
    const row = rows.get(key) ?? { key, inUsd: 0, outUsd: 0, netUsd: 0 };
    rows.set(key, row);
    return row;
  };
  for (const cash of report.cash) at(cash.date).inUsd += snapshotUsd(cash);
  for (const expense of report.expenses) at(expense.date).outUsd += snapshotUsd(expense);
  return [...rows.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({ ...row, netUsd: row.inUsd - row.outUsd }));
}

export interface OverviewAnalysis {
  kpis: ReportKpi[];
  trend: TrendRow[];
  streams: ReportGroup<CashRow>[];
  categories: ReportGroup<ExpenseItem>[];
  grain: TimeGrain;
}

export function overviewAnalysis(
  report: MoneyReport,
  state: SectionViewState,
  period: ReportPeriod,
): OverviewAnalysis {
  const grain = state.grain ?? defaultGrain(period);
  return {
    kpis: moneyKpis(report),
    trend: moneyTrend(report, period, grain),
    streams: groupRows(report.cash, "stream", cashKeyOf(grain), snapshotUsd),
    categories: groupRows(report.expenses, "category", expenseKeyOf(grain), snapshotUsd),
    grain,
  };
}

// A time filter has no twin in the previous period, so it drops the comparison.
export function moneyInView(
  report: MoneyReport,
  state: SectionViewState,
  period: ReportPeriod,
): AnalysisView<CashRow, CashDimension> {
  const grain = state.grain ?? defaultGrain(period);
  const keyOf = cashKeyOf(grain);
  const groupBy = state.groupBy as CashDimension;
  const rows = applyFilter(report.cash, state.filter, keyOf);
  const comparable = state.filter.time === undefined;
  const prev = applyFilter(report.prevCash, withoutTime(state.filter), keyOf);
  const collectedUsd = sumUsd(rows);
  const handOvers = distinct(rows.map((r) => r.collectionId));
  const prevHandOvers = distinct(prev.map((r) => r.collectionId));
  const kpis: ReportKpi[] = [
    {
      key: "collected",
      labelKey: "reports.collected",
      value: money(collectedUsd),
      tone: "emerald",
      delta: comparable ? delta(collectedUsd, sumUsd(prev)) : undefined,
    },
    {
      key: "hand_overs",
      labelKey: "reports.hand_overs",
      value: count(handOvers),
      tone: "indigo",
      delta: comparable ? delta(handOvers, prevHandOvers) : undefined,
    },
    {
      key: "payers",
      labelKey: "reports.customers_paid",
      value: count(distinct(rows.map((r) => r.customerId))),
      tone: "gray",
    },
    {
      key: "average",
      labelKey: "reports.average_hand_over",
      value: money(ratioOf(collectedUsd, handOvers) ?? 0),
      tone: "gray",
    },
  ];
  return {
    kpis,
    groups: groupRows(
      rows,
      groupBy,
      keyOf,
      snapshotUsd,
      groupBy === "time" ? periodBuckets(period, grain) : undefined,
    ),
    rows,
    options: Object.fromEntries(
      CASH_FILTERS.map((dim) => [dim, filterOptions(report.cash, state.filter, dim, keyOf)]),
    ),
    names: namesFrom(report.cash, (r) => [[r.customerId, r.customerName]]),
    grain,
  };
}

export function moneyOutView(
  report: MoneyReport,
  state: SectionViewState,
  period: ReportPeriod,
): AnalysisView<ExpenseItem, ExpenseDimension> {
  const grain = state.grain ?? defaultGrain(period);
  const keyOf = expenseKeyOf(grain);
  const groupBy = state.groupBy as ExpenseDimension;
  const rows = applyFilter(report.expenses, state.filter, keyOf);
  const comparable = state.filter.time === undefined;
  const prev = applyFilter(report.prevExpenses, withoutTime(state.filter), keyOf);
  const spentUsd = sumUsd(rows);
  const kpis: ReportKpi[] = [
    {
      key: "spent",
      labelKey: "reports.spent",
      value: money(spentUsd),
      tone: "amber",
      delta: comparable ? delta(spentUsd, sumUsd(prev)) : undefined,
      higherIsBetter: false,
    },
    {
      key: "entries",
      labelKey: "reports.entries",
      value: count(rows.length),
      tone: "gray",
    },
    {
      key: "stock",
      labelKey: "reports.stock_purchases",
      value: money(sumUsd(rows.filter((r) => r.source === "stock"))),
      tone: "gray",
    },
    {
      key: "other",
      labelKey: "reports.other_expenses",
      value: money(sumUsd(rows.filter((r) => r.source === "manual"))),
      tone: "gray",
    },
  ];
  return {
    kpis,
    groups: groupRows(
      rows,
      groupBy,
      keyOf,
      snapshotUsd,
      groupBy === "time" ? periodBuckets(period, grain) : undefined,
    ),
    rows,
    options: Object.fromEntries(
      EXPENSE_FILTERS.map((dim) => [dim, filterOptions(report.expenses, state.filter, dim, keyOf)]),
    ),
    names: new Map(),
    grain,
  };
}
