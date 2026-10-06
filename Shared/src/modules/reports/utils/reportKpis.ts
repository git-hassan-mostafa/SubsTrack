import type { Currency } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { delta, type Delta } from "@shared/modules/reports/utils/aggregate";
import type { DebtsReport, MoneyReport } from "@shared/modules/reports/utils/types";
import type { Tone } from "@shared/shared/lib/tone";

export type KpiValue =
  | { kind: "money"; usd: number }
  | { kind: "count"; value: number }
  | { kind: "percent"; ratio: number | null };

export interface ReportKpi {
  key: string;
  labelKey: string;
  value: KpiValue;
  tone: Tone;
  hintKey?: string;
  delta?: Delta;
  higherIsBetter?: boolean;
}

type MoneyTotals = Pick<
  MoneyReport,
  "collectedUsd" | "spentUsd" | "netUsd" | "prevCollectedUsd" | "prevSpentUsd" | "prevNetUsd"
>;

const NO_VALUE = "—";

export function money(usd: number): KpiValue {
  return { kind: "money", usd };
}

export function count(value: number): KpiValue {
  return { kind: "count", value };
}

export function ratioOf(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

// A loss reads with a true minus sign in front of the currency, never inside it.
export function formatKpiValue(value: KpiValue, display: Currency | null): string {
  if (value.kind === "money") {
    const shown = formatMoney(Math.abs(value.usd), null, display);
    return value.usd < 0 ? `−${shown}` : shown;
  }
  if (value.kind === "count") return String(value.value);
  return value.ratio === null ? NO_VALUE : `${Math.round(value.ratio * 100)}%`;
}

export function formatKpiValues(
  values: Record<string, KpiValue> | undefined,
  display: Currency | null,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([key, value]) => [key, formatKpiValue(value, display)]),
  );
}

export function moneyKpis(totals: MoneyTotals): ReportKpi[] {
  return [
    {
      key: "collected",
      labelKey: "reports.collected",
      value: money(totals.collectedUsd),
      tone: "emerald",
      delta: delta(totals.collectedUsd, totals.prevCollectedUsd),
    },
    {
      key: "spent",
      labelKey: "reports.spent",
      value: money(totals.spentUsd),
      tone: "amber",
      delta: delta(totals.spentUsd, totals.prevSpentUsd),
      higherIsBetter: false,
    },
    {
      key: "net",
      labelKey: "reports.net",
      value: money(totals.netUsd),
      tone: totals.netUsd < 0 ? "red" : "indigo",
      delta: delta(totals.netUsd, totals.prevNetUsd),
    },
    {
      key: "margin",
      labelKey: "reports.margin",
      value: { kind: "percent", ratio: ratioOf(totals.netUsd, totals.collectedUsd) },
      tone: "gray",
    },
  ];
}

// "Behind on payments" counts to today, never to the period — gotcha #91.
export function debtsKpis(report: DebtsReport): ReportKpi[] {
  return [
    {
      key: "outstanding",
      labelKey: "reports.outstanding",
      value: money(report.outstandingUsd),
      hintKey: "reports.outstanding_hint",
      tone: report.outstandingUsd > 0 ? "red" : "emerald",
    },
    {
      key: "collected",
      labelKey: "reports.debt_collected",
      value: money(report.collectedUsd),
      hintKey: "reports.debt_collected_hint",
      tone: "emerald",
      delta: delta(report.collectedUsd, report.prevCollectedUsd),
    },
    {
      key: "debtors",
      labelKey: "reports.customers_in_debt",
      value: count(report.debtorCount),
      tone: "gray",
    },
    {
      key: "overdue",
      labelKey: "reports.overdue_customers",
      value: count(report.aging.length),
      hintKey: "reports.overdue_hint",
      tone: report.aging.length > 0 ? "amber" : "emerald",
    },
  ];
}
