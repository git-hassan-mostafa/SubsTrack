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
  cash: CashRow[];
  expenses: ExpenseItem[];
  collectedUsd: number;
  spentUsd: number;
  netUsd: number;
  prevCollectedUsd: number;
  prevSpentUsd: number;
  prevNetUsd: number;
  streamEntries: Entry[];
  categoryEntries: Entry[];
  byCurrency: { currencyId: string | null; amount: number; usd: number }[];
}

// How far behind a customer is, in whole months.
export interface AgingRow {
  customerId: string;
  customerName: string;
  months: number;
}

export interface DebtsReport {
  outstandingUsd: number;
  writtenOffUsd: number;
  debtorCount: number;
  topDebtors: CustomerDebts[];
  categoryEntries: Entry[];
  collected: CashRow[];
  collectedUsd: number;
  prevCollectedUsd: number;
  aging: AgingRow[];
}
