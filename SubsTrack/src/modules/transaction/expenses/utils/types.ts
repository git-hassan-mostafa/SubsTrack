import type { BranchFilter } from '@/src/core/constants';
import type { Currency, ExpenseCategory } from '@/src/core/types';

// Form input for a hand-typed expense. `currency` null = USD (we snapshot
// ratePerUsd from it, mirroring DebtService / SaleService / PaymentService).
export interface CreateExpenseInput {
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  currency: Currency | null;
  // null = a company-wide expense, not charged to one branch.
  branchId: string | null;
  // When the money went out. Defaults to now in the service when omitted.
  incurredAt?: string;
  recordedByUserId: string | null;
  tenantId: string;
}

// Scope of an Expenses fetch. The range is REQUIRED — expenses are read a month
// (or a few) at a time, never all-time, so the derived stock half stays cheap.
export interface ExpensesFilter {
  // Inclusive start / exclusive end, ISO.
  startIso: string;
  endExclusiveIso: string;
  branchFilter?: BranchFilter;
}
