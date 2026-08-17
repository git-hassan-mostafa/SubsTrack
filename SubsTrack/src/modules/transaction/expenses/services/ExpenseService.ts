import type { Expense, ExpenseItem, ExpensesView } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
// Deep import (not the module barrel) — the barrel re-exports product screens,
// and a service must not drag UI into its graph.
import productService from '@/src/modules/admin/products/services/ProductService';
import repository from '../repository/ExpenseRepository';
import { mapDbExpenseToExpense } from '../utils/mapper';
import { expenseCategoryLabelKey } from '../utils/expenseCategories';
import type { CreateExpenseInput, ExpensesFilter } from '../utils/types';

// Sums money rows in USD via each row's frozen snapshot rate (drift-free) —
// same principle as DashboardService.sumInUsd / DebtService.sumUsd.
function sumUsd(rows: { amount: number; ratePerUsdSnapshot: number }[]): number {
  return rows.reduce((s, r) => s + r.amount / r.ratePerUsdSnapshot, 0);
}

/**
 * Money out. Composes the two sources into one uniform view — the same shape as
 * DebtService (stored rows + a derived stream from another service):
 *
 *   • stored  — hand-typed rows in the `expenses` table
 *   • derived — stock purchases, from stock_movements.unit_cost
 *
 * CASH BASIS: a purchase counts in the month it was PAID FOR. Everything is
 * summed in USD via each row's frozen rate; the screen formats for display.
 */
class ExpenseService {
  /** One fetch for the Expenses panel: both sources merged, newest first. */
  async getExpensesView(filter: ExpensesFilter): Promise<ExpensesView> {
    const branchFilter = filter.branchFilter ?? null;
    const [stored, stockCosts] = await Promise.all([
      repository.findInRange(filter.startIso, filter.endExclusiveIso, branchFilter),
      productService.getStockCostsInRange(
        filter.startIso,
        filter.endExclusiveIso,
        branchFilter,
      ),
    ]);

    const manual: ExpenseItem[] = stored.map((row) => {
      const e = mapDbExpenseToExpense(row);
      return {
        id: `exp:${e.id}`,
        source: 'manual',
        category: e.category,
        // No description falls back to the category name, so a row is never blank.
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
    });

    const stock: ExpenseItem[] = stockCosts.map((s) => ({
      id: `stock:${s.movementId}`,
      source: 'stock',
      category: 'stock',
      label: `${s.productName} ×${s.quantity}`,
      amount: s.amount,
      currencyId: s.currencyId,
      ratePerUsdSnapshot: s.ratePerUsdSnapshot,
      date: s.occurredAt,
      branchId: s.branchId,
      recordedByUserId: s.recordedByUserId,
      productId: s.productId,
      // There is no expense row to void — correct it with a stock adjustment.
      canVoid: false,
    }));

    const items = [...manual, ...stock].sort((a, b) => b.date.localeCompare(a.date));
    const manualUsd = sumUsd(manual);
    const stockUsd = sumUsd(stock);
    return {
      items,
      summary: { totalUsd: manualUsd + stockUsd, manualUsd, stockUsd },
    };
  }

  /**
   * The dashboard aggregate — the same two sources, but only the USD totals.
   * Kept separate from getExpensesView so the dashboard never builds view models
   * it won't render.
   */
  async getTotalsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ totalUsd: number; customUsd: number; stockUsd: number }> {
    const [stored, stockCosts] = await Promise.all([
      repository.totalsInRange(startIso, endExclusiveIso, branchFilter),
      productService.getStockCostsInRange(startIso, endExclusiveIso, branchFilter),
    ]);
    const customUsd = sumUsd(stored);
    const stockUsd = sumUsd(stockCosts);
    return { totalUsd: customUsd + stockUsd, customUsd, stockUsd };
  }

  /**
   * Per-month USD totals for the revenue trend, keyed 'YYYY-MM'. One pass over
   * both sources, bucketed by when the money went out (incurred_at/occurred_at)
   * — the mirror of how the three cash-in streams bucket by paid_at/sold_at.
   */
  async getMonthlyTotalsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<Record<string, number>> {
    const [stored, stockCosts] = await Promise.all([
      repository.totalsInRange(startIso, endExclusiveIso, branchFilter),
      productService.getStockCostsInRange(startIso, endExclusiveIso, branchFilter),
    ]);
    const buckets: Record<string, number> = {};
    const add = (iso: string, amount: number, rate: number) => {
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = (buckets[key] ?? 0) + amount / rate;
    };
    for (const r of stored) add(r.incurredAt, r.amount, r.ratePerUsdSnapshot);
    for (const r of stockCosts) add(r.occurredAt, r.amount, r.ratePerUsdSnapshot);
    return buckets;
  }

  async addExpense(input: CreateExpenseInput): Promise<Expense> {
    this.validateAmount(input.amount);
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) throw new Error(i18n.t('errors.rate_snapshot_positive'));
    const row = await repository.create({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      category: input.category,
      description: input.description?.trim() || null,
      amount: input.amount,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      recorded_by_user_id: input.recordedByUserId,
      incurred_at: input.incurredAt ?? new Date().toISOString(),
      notes: null,
    });
    return mapDbExpenseToExpense(row);
  }

  async voidExpense(id: string, voidedBy: string, reason: string | null): Promise<Expense> {
    const row = await repository.void(id, voidedBy, reason?.trim() || null);
    return mapDbExpenseToExpense(row);
  }

  private validateAmount(amount: number): void {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      throw new Error(i18n.t('errors.expense_amount_positive'));
    }
  }
}

export default new ExpenseService();
