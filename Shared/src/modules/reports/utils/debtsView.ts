import type { CashRow, OpenItem } from "@shared/core/types";
import { currentDate, daysLate } from "@shared/core/utils/date";
import type { ReportPeriod } from "@shared/core/utils/dateRange";
import {
  applyFilter,
  filterOptions,
  groupRows,
  isFiltered,
  NO_KEY,
  type KeyOf,
} from "@shared/modules/reports/utils/analysis";
import { balanceUsd } from "@shared/modules/ledger/utils/debtRule";
import {
  AGE_BUCKETS,
  ageBucket,
  namesFrom,
  type AnalysisView,
  type DimensionFilter,
  type SectionViewState,
} from "@shared/modules/reports/utils/reportDimensions";
import { count, debtsKpis, money, type ReportKpi } from "@shared/modules/reports/utils/reportKpis";
import { snapshotUsd } from "@shared/core/utils/currency";
import { defaultGrain } from "@shared/modules/reports/utils/timeBuckets";
import type { DebtsReport } from "@shared/modules/reports/utils/types";

export const DEBT_DIMENSIONS = ["customer", "kind", "plan", "branch", "age"] as const;

export type DebtDimension = (typeof DEBT_DIMENSIONS)[number];

export const DEBT_FILTERS: readonly DebtDimension[] = ["kind", "plan", "age"];

export interface DebtsAnalysis extends AnalysisView<OpenItem, DebtDimension> {
  monthsBehind: ReadonlyMap<string, number>;
  oldestDaysLate: ReadonlyMap<string, number>;
}

// The period never scopes what is owed, so ageing reads today — gotcha #91.
export function debtKeyOf(today: Date): KeyOf<OpenItem, DebtDimension> {
  return (item, dim) => {
    switch (dim) {
      case "customer":
        return item.customerId;
      case "kind":
        return item.kind;
      case "plan":
        return item.planId ?? NO_KEY;
      case "branch":
        return item.branchId ?? NO_KEY;
      case "age":
        return ageBucket(daysLate(item.dueDate, today));
    }
  };
}

const owedUsd = (item: OpenItem) => balanceUsd(item.balance, item.ratePerUsdSnapshot);

// Cash on debts carries the same customer, kind, plan and branch as the bill it paid.
function collectedInScope(rows: readonly CashRow[], filter: DimensionFilter): CashRow[] {
  return rows.filter(
    (row) =>
      (filter.customer === undefined || row.customerId === filter.customer) &&
      (filter.kind === undefined || row.stream === filter.kind) &&
      (filter.plan === undefined || (row.planId ?? NO_KEY) === filter.plan) &&
      (filter.branch === undefined || (row.branchId ?? NO_KEY) === filter.branch),
  );
}

function scopedKpis(report: DebtsReport, items: OpenItem[], filter: DimensionFilter): ReportKpi[] {
  const outstandingUsd = items.reduce((sum, item) => sum + owedUsd(item), 0);
  const kpis: ReportKpi[] = [
    {
      key: "outstanding",
      labelKey: "reports.outstanding",
      value: money(outstandingUsd),
      hintKey: "reports.outstanding_hint",
      tone: outstandingUsd > 0 ? "red" : "emerald",
    },
    {
      key: "debtors",
      labelKey: "reports.customers_in_debt",
      value: count(new Set(items.map((i) => i.customerId)).size),
      tone: "gray",
    },
    {
      key: "bills",
      labelKey: "reports.open_bills",
      value: count(items.length),
      tone: "gray",
    },
  ];
  if (filter.age === undefined) {
    const collected = collectedInScope(report.collected, filter);
    const collectedUsd = collected.reduce((sum, row) => sum + snapshotUsd(row), 0);
    kpis.splice(1, 0, {
      key: "collected",
      labelKey: "reports.debt_collected",
      value: money(collectedUsd),
      hintKey: "reports.debt_collected_hint",
      tone: "emerald",
    });
  }
  return kpis;
}

export function debtsAnalysis(
  report: DebtsReport,
  state: SectionViewState,
  period: ReportPeriod,
): DebtsAnalysis {
  const keyOf = debtKeyOf(currentDate());
  const groupBy = state.groupBy as DebtDimension;
  const all = report.debtors.flatMap((debtor) => debtor.items);
  const items = applyFilter(all, state.filter, keyOf);
  const kpis = isFiltered(state.filter)
    ? scopedKpis(report, items, state.filter)
    : [
        ...debtsKpis(report),
        {
          key: "written_off",
          labelKey: "reports.written_off",
          value: money(report.writtenOffUsd),
          hintKey: "reports.debt_collected_hint",
          tone: report.writtenOffUsd > 0 ? "orange" : "gray",
        } satisfies ReportKpi,
      ];
  return {
    kpis,
    groups: groupRows(
      items,
      groupBy,
      keyOf,
      owedUsd,
      groupBy === "age" ? AGE_BUCKETS : undefined,
    ),
    rows: items,
    options: Object.fromEntries(
      DEBT_FILTERS.map((dim) => [dim, filterOptions(all, state.filter, dim, keyOf)]),
    ),
    names: namesFrom(all, (i) => [[i.customerId, i.customerName]]),
    grain: defaultGrain(period),
    monthsBehind: new Map(report.aging.map((a) => [a.customerId, a.months])),
    oldestDaysLate: new Map(report.debtors.map((d) => [d.customerId, d.oldestDaysLate])),
  };
}
