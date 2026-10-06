import type { Currency, Customer, CustomerPlan } from "@shared/core/types";
import { findCurrency, toUsd } from "@shared/core/utils/currency";
import { previousPeriod, toRange, type DateRange, type ReportPeriod } from "@shared/core/utils/dateRange";
import { delta } from "@shared/modules/reports/utils/aggregate";
import {
  applyFilter,
  filterOptions,
  groupRows,
  NO_KEY,
  type KeyOf,
  type ReportGroup,
} from "@shared/modules/reports/utils/analysis";
import { resolveLinePrice } from "@shared/modules/customer/customer-plans/utils/linePrice";
import type { AnalysisView, SectionViewState } from "@shared/modules/reports/utils/reportDimensions";
import { count, money, type ReportKpi } from "@shared/modules/reports/utils/reportKpis";
import {
  bucketOf,
  defaultGrain,
  periodBuckets,
  type TimeGrain,
} from "@shared/modules/reports/utils/timeBuckets";
import type { CustomersReport } from "@shared/modules/reports/utils/types";

export const CUSTOMER_DIMENSIONS = ["plan", "status", "type", "area", "branch"] as const;

export type CustomerDimension = (typeof CUSTOMER_DIMENSIONS)[number];

export const CUSTOMER_FILTERS: readonly CustomerDimension[] = ["plan", "status", "type", "area"];

export const CUSTOM_PRICE_KEY = "__custom__";

export interface CustomerGroupFigures {
  active: number;
  joined: number;
  left: number;
  monthlyUsd: number;
}

export interface CustomerTrendRow {
  key: string;
  joined: number;
  left: number;
  net: number;
}

export interface CustomersAnalysis extends AnalysisView<Customer, CustomerDimension> {
  figures: ReadonlyMap<string, CustomerGroupFigures>;
  trend: CustomerTrendRow[];
  unpricedLines: number;
}

const inRange = (iso: string | null, range: DateRange) =>
  iso !== null && iso >= range.startIso && iso < range.endExclusiveIso;

// A cancelled customer keeps the plans it had, so "who left, on which plan" still reads.
function linesOf(customer: Customer): CustomerPlan[] {
  const lines = customer.customerPlans ?? [];
  return customer.active ? lines.filter((line) => line.active) : lines;
}

export const customerKeyOf: KeyOf<Customer, CustomerDimension> = (customer, dim) => {
  switch (dim) {
    case "plan": {
      const keys = linesOf(customer).map((line) => line.planId ?? CUSTOM_PRICE_KEY);
      return keys.length > 0 ? [...new Set(keys)] : NO_KEY;
    }
    case "status":
      return customer.active ? "active" : "cancelled";
    case "type":
      return customer.isRegular ? "regular" : "occasional";
    case "area":
      return customer.area?.trim() || NO_KEY;
    case "branch":
      return customer.branchId ?? NO_KEY;
  }
};

// Projected at today's rates from set prices; a line priced at collection adds nothing.
export function expectedMonthlyUsd(customer: Customer, currencies: Currency[]): number {
  if (!customer.active) return 0;
  return linesOf(customer).reduce((sum, line) => {
    const price = resolveLinePrice(line);
    if (price.amount === null) return sum;
    const usd = toUsd(price.amount, findCurrency(currencies, price.currencyId));
    return sum + usd / price.durationMonths;
  }, 0);
}

function figuresOf(
  rows: readonly Customer[],
  range: DateRange,
  currencies: Currency[],
): CustomerGroupFigures {
  return {
    active: rows.filter((c) => c.active).length,
    joined: rows.filter((c) => inRange(c.createdAt, range)).length,
    left: rows.filter((c) => !c.active && inRange(c.cancelledAt, range)).length,
    monthlyUsd: rows.reduce((sum, c) => sum + expectedMonthlyUsd(c, currencies), 0),
  };
}

export function customersTrend(
  customers: readonly Customer[],
  period: ReportPeriod,
  grain: TimeGrain,
): CustomerTrendRow[] {
  const range = toRange(period);
  const rows = new Map(
    periodBuckets(period, grain).map((key) => [key, { key, joined: 0, left: 0, net: 0 }]),
  );
  const add = (iso: string, field: "joined" | "left") => {
    const row = rows.get(bucketOf(iso, grain));
    if (row) row[field] += 1;
  };
  for (const customer of customers) {
    if (inRange(customer.createdAt, range)) add(customer.createdAt, "joined");
    if (!customer.active && customer.cancelledAt && inRange(customer.cancelledAt, range))
      add(customer.cancelledAt, "left");
  }
  return [...rows.values()].map((row) => ({ ...row, net: row.joined - row.left }));
}

export function customersAnalysis(
  report: CustomersReport,
  state: SectionViewState,
  period: ReportPeriod,
  currencies: Currency[],
): CustomersAnalysis {
  const grain = state.grain ?? defaultGrain(period);
  const groupBy = state.groupBy as CustomerDimension;
  const range = toRange(period);
  const prevRange = toRange(previousPeriod(period));
  const rows = applyFilter(report.customers, state.filter, customerKeyOf);
  const now = figuresOf(rows, range, currencies);
  const before = figuresOf(rows, prevRange, currencies);
  const activeLines = rows
    .filter((c) => c.active)
    .flatMap((c) => linesOf(c));
  const kpis: ReportKpi[] = [
    { key: "active", labelKey: "reports.active_customers", value: count(now.active), tone: "indigo" },
    {
      key: "joined",
      labelKey: "reports.joined",
      value: count(now.joined),
      tone: "emerald",
      delta: delta(now.joined, before.joined),
    },
    {
      key: "left",
      labelKey: "reports.left",
      value: count(now.left),
      tone: now.left > 0 ? "red" : "gray",
      delta: delta(now.left, before.left),
      higherIsBetter: false,
    },
    {
      key: "net",
      labelKey: "reports.net_change",
      value: count(now.joined - now.left),
      tone: now.joined - now.left < 0 ? "red" : "gray",
    },
    { key: "lines", labelKey: "reports.active_lines", value: count(activeLines.length), tone: "gray" },
    {
      key: "monthly",
      labelKey: "reports.expected_monthly",
      value: money(now.monthlyUsd),
      hintKey: "reports.expected_monthly_hint",
      tone: "emerald",
    },
  ];
  const groups: ReportGroup<Customer>[] = groupRows(rows, groupBy, customerKeyOf, () => 1);
  return {
    kpis,
    groups,
    rows,
    options: Object.fromEntries(
      CUSTOMER_FILTERS.map((dim) => [
        dim,
        filterOptions(report.customers, state.filter, dim, customerKeyOf),
      ]),
    ),
    names: new Map(),
    grain,
    figures: new Map(groups.map((g) => [g.key, figuresOf(g.rows, range, currencies)])),
    trend: customersTrend(rows, period, grain),
    unpricedLines: activeLines.filter((line) => resolveLinePrice(line).amount === null).length,
  };
}
