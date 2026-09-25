import type { ChargeKind, ChargeStatus, DebtHistoryItem } from "@/src/core/types";
import type {
  BalanceScope,
  ChargeSortField,
  WriteOffScope,
} from "@/src/modules/ledger/repository/IChargeRepository";
import type { SortDirection } from "@/src/modules/ledger/repository/ICollectionRepository";
import { chargeStatusOf } from "@/src/modules/ledger/utils/billState";
import { daysLate } from "@/src/core/utils/date";
import { periodFromPreset, type ReportPeriod } from "@/src/core/utils/dateRange";

export type HistoryOutcome = "settled" | "partial" | "open" | "written_off";
export type HistorySort =
  | "created"
  | "updated"
  | "newest"
  | "oldest"
  | "largest"
  | "smallest";

const SORT_FIELDS: Record<HistorySort, ChargeSortField> = {
  created: "created_at",
  updated: "updated_at",
  newest: "due_date",
  oldest: "due_date",
  largest: "amount",
  smallest: "amount",
};

// A period the reader has to ASK for: the whole point of this list is old
// debts, so it opens on everything and narrows from there.
export type HistoryPeriodPreset =
  | "all"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "this_year";

export const HISTORY_PERIOD_PRESETS: HistoryPeriodPreset[] = [
  "all",
  "this_month",
  "last_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "this_year",
];

// A customer is PICKED, never typed: the list pages, so a name typed into it
// could only filter the page already fetched. The id filters the query.
export interface DebtHistoryFilters {
  customerId: string | null;
  period: HistoryPeriodPreset;
  outcome: HistoryOutcome | null;
  kind: ChargeKind | null;
  sort: HistorySort;
}

export const DEFAULT_DEBT_HISTORY_FILTERS: DebtHistoryFilters = {
  customerId: null,
  period: "all",
  outcome: null,
  kind: null,
  sort: "created",
};

export function hasActiveHistoryFilters(f: DebtHistoryFilters): boolean {
  return (
    f.customerId !== null ||
    f.period !== DEFAULT_DEBT_HISTORY_FILTERS.period ||
    f.outcome !== null ||
    f.kind !== null ||
    f.sort !== DEFAULT_DEBT_HISTORY_FILTERS.sort
  );
}

// A void never reaches this list — `charge_balances` drops it at source — so the
// four outcomes below are exhaustive for a history row.
export function historyOutcomeOf(item: DebtHistoryItem): HistoryOutcome {
  const status: ChargeStatus = chargeStatusOf({
    voided: item.charge?.voidedAt != null,
    writtenOff: item.charge?.writtenOffAt != null,
    amount: item.amount,
    collected: item.paid,
  });
  return status === "void" ? "open" : status;
}

// How late the money was, counted to the day it arrived. Null when the bill
// never settled or settled on time — a row only says "late" when it IS late.
export function daysLateSettling(item: DebtHistoryItem): number | null {
  if (!item.settledAt) return null;
  const late = daysLate(item.dueDate, new Date(item.settledAt));
  return late > 0 ? late : null;
}

/** How long a still-owed bill has been overdue; null once it is settled. */
export function daysOverdue(
  item: DebtHistoryItem,
  today: Date = new Date(),
): number | null {
  if (item.balance <= 0) return null;
  const late = daysLate(item.dueDate, today);
  return late > 0 ? late : null;
}

// Every filter reaches the QUERY, so a page is never thinned after it arrives —
// that would strand a short page the list could not scroll far enough to extend.
export function toReadScopes(filters: DebtHistoryFilters): {
  balanceScope: BalanceScope;
  writeOffScope: WriteOffScope;
  sortField: ChargeSortField;
  sortDirection: SortDirection;
} {
  return {
    balanceScope:
      filters.outcome === "settled"
        ? "settled"
        : filters.outcome === "partial"
          ? "partial"
          : filters.outcome === "open"
            ? "unpaid"
            : "any",
    // A write-off outranks the money on a bill, so the three money outcomes
    // must exclude written-off rows or the list would contradict its own filter.
    writeOffScope:
      filters.outcome === "written_off"
        ? "written_off"
        : filters.outcome === null
          ? "any"
          : "live",
    sortField: SORT_FIELDS[filters.sort],
    sortDirection:
      filters.sort === "oldest" || filters.sort === "smallest" ? "asc" : "desc",
  };
}

/** Bare YYYY-MM-DD bounds, because `due_date` is a DATE, not an instant. */
export function toDueDateRange(preset: HistoryPeriodPreset): {
  fromDate?: string;
  toDate?: string;
} {
  if (preset === "all") return {};
  const period: ReportPeriod = periodFromPreset(preset);
  return { fromDate: period.fromDate, toDate: period.toDate };
}

// `open` and `partial` share one server scope (both still owe), so the page
// still has to be split by money once it arrives.
export function matchesOutcome(
  item: DebtHistoryItem,
  outcome: HistoryOutcome | null,
): boolean {
  return outcome === null || historyOutcomeOf(item) === outcome;
}
