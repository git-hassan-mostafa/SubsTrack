import type { Expense, ExpenseCategory, ExpenseItem } from '@/src/core/types';
import type { DbExpense } from '@/src/core/types/db';
import i18n from '@/src/core/i18n';
import { expenseCategoryLabelKey, isExpenseCategory } from './expenseCategories';

export function mapDbExpenseToExpense(db: DbExpense): Expense {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    branchId: db.branch_id,
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

/**
 * One stored expense as a row of the merged view. Shared by the read (which
 * composes both sources) and the slice (which patches a single write in), so a
 * hand-typed expense looks the same however it got on screen.
 */
export function expenseToItem(e: Expense): ExpenseItem {
  return {
    id: `exp:${e.id}`,
    source: 'manual',
    category: e.category,
    label: e.description?.trim() || i18n.t(expenseCategoryLabelKey(e.category)),
    amount: e.amount,
    currencyId: e.currencyId,
    ratePerUsdSnapshot: e.ratePerUsdSnapshot,
    date: e.incurredAt,
    branchId: e.branchId,
    recordedByUserId: e.recordedByUserId,
    productId: null,
    canVoid: true,
  };
}
