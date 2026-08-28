import type { BranchFilter } from '@/src/core/constants';
import type { CashRow, CustomerDebts, ExpenseItem } from '@/src/core/types';
import type { ReportPeriod } from '@/src/core/utils/dateRange';
import type { Entry } from './aggregate';

export interface ReportsFilter {
  period: ReportPeriod;
  branchFilter: BranchFilter;
}

// What the drill-down sheet renders — deliberately source-agnostic, so one
// sheet serves a stream row, a category row and a debtor alike.
export interface RecordRow {
  id: string;
  title: string;
  subtitle: string | null;
  date: string;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
}

export interface MoneyReport {
  // Raw rows, kept so every drill-down is a filter — never a second query.
  cash: CashRow[];
  expenses: ExpenseItem[];
  collectedUsd: number;
  spentUsd: number;
  netUsd: number;
  // Same three figures for the comparison period (same length, immediately
  // before) — the only reason the previous window is fetched at all.
  prevCollectedUsd: number;
  prevSpentUsd: number;
  prevNetUsd: number;
  streamEntries: Entry[];
  categoryEntries: Entry[];
  // What was PHYSICALLY collected, per currency.
  byCurrency: { currencyId: string | null; amount: number; usd: number }[];
}

// How far behind a customer is, in whole months.
export interface AgingRow {
  customerId: string;
  customerName: string;
  months: number;
}

export interface DebtsReport {
  // OUTSTANDING debt is ALL-TIME — DebtsFilter has no date scope and must not
  // grow one. The period below applies only to debt COLLECTED.
  outstandingUsd: number;
  // Money given up on in the period — a recorded loss, never counted as owed.
  writtenOffUsd: number;
  debtorCount: number;
  topDebtors: CustomerDebts[];
  categoryEntries: Entry[];
  // Debt cash collected IN the period — the one period-scoped figure here.
  collected: CashRow[];
  collectedUsd: number;
  prevCollectedUsd: number;
  aging: AgingRow[];
}
