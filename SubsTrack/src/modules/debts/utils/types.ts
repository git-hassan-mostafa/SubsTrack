import type { BranchFilter } from '@/src/core/constants';
import type {
  Currency,
  DebtItem,
  DebtPaymentItem,
  DebtSummary,
} from '@/src/core/types';

// Form input for a hand-typed custom debt. `currency` null = USD (we snapshot
// ratePerUsd from it, mirroring SaleService / PaymentService).
export interface CreateCustomDebtInput {
  customerId: string;
  amount: number;
  description: string | null;
  currency: Currency | null;
  recordedByUserId: string | null;
  tenantId: string;
}

// Form input for a debt payment. Tied only to a customer.
export interface CreateDebtPaymentInput {
  customerId: string;
  amount: number;
  notes: string | null;
  currency: Currency | null;
  receivedByUserId: string | null;
  tenantId: string;
}

// Scope of a Debts fetch. Category filtering is done client-side on the result.
export interface DebtsFilter {
  branchFilter?: BranchFilter;
  customerId?: string | null;
}

// Everything the Debts panel needs from one fetch: the debt items (months +
// sales + custom), the debt payments, and the net summary for the scope.
export interface DebtsView {
  items: DebtItem[];
  payments: DebtPaymentItem[];
  summary: DebtSummary;
}
