import type { BranchFilter } from '@/src/core/constants';
import type { DbExpense } from '@/src/core/types/db';

/** A hand-typed expense to store. `id`, timestamps and the void fields are
 *  filled in by the repository — an expense is never born voided. */
export type CreateExpensePayload = Pick<
  DbExpense,
  | 'tenant_id'
  | 'branch_id'
  | 'category'
  | 'description'
  | 'amount'
  | 'currency_id'
  | 'rate_per_usd_snapshot'
  | 'recorded_by_user_id'
  | 'incurred_at'
  | 'notes'
>;

/** Just enough of a row to sum it in USD, for the dashboard aggregates. */
export interface ExpenseAmountRow {
  incurredAt: string;
  amount: number;
  ratePerUsdSnapshot: number;
}

/**
 * The Expense repository contract. Both the Supabase (online/web) class and the
 * offline SQLite class implement this — the compiler keeps the two in lockstep.
 *
 * It owns ONLY the stored `expenses` table. Stock purchase costs are derived
 * from stock_movements and composed in by ExpenseService.
 */
export interface IExpenseRepository {
  findInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter?: BranchFilter,
  ): Promise<DbExpense[]>;
  create(payload: CreateExpensePayload): Promise<DbExpense>;
  void(id: string, voidedBy: string, reason: string | null): Promise<DbExpense>;
  totalsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter?: BranchFilter,
  ): Promise<ExpenseAmountRow[]>;
}
