import type { Expense, ExpenseCategory } from '@/src/core/types';
import type { DbExpense } from '@/src/core/types/db';
import { isExpenseCategory } from './expenseCategories';

export function mapDbExpenseToExpense(db: DbExpense): Expense {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    branchId: db.branch_id,
    // The column is free text so a new category needs no migration; anything
    // this build doesn't know falls back to "other" rather than breaking a label.
    category: (isExpenseCategory(db.category) ? db.category : 'other') as ExpenseCategory,
    description: db.description,
    amount: Number(db.amount),
    currencyId: db.currency_id,
    ratePerUsdSnapshot: Number(db.rate_per_usd_snapshot),
    recordedByUserId: db.recorded_by_user_id,
    incurredAt: db.incurred_at,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    voidedAt: db.voided_at,
    voidedBy: db.voided_by,
    voidReason: db.void_reason,
    notes: db.notes,
  };
}
