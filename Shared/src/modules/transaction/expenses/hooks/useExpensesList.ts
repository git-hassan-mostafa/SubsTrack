import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ExpenseItem } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useExpenseStore } from "@shared/modules/transaction/expenses/state/expenseStore";
import {
  EXPENSE_DEFAULT_PRESET,
  expenseListView,
} from "@shared/modules/transaction/expenses/utils/expenseList";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { confirm } from "@shared/shared/lib/confirm";

// Re-reads on every open: a restock elsewhere changes the derived stock half.
export function useExpensesList(search: string) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const branch = useEffectiveBranchFilter();
  const items = useExpenseStore((s) => s.items);
  const summary = useExpenseStore((s) => s.summary);
  const loaded = useExpenseStore((s) => s.loaded);
  const loading = useExpenseStore((s) => s.loading);
  const error = useExpenseStore((s) => s.error);
  const period = useExpenseStore((s) => s.period);
  const category = useExpenseStore((s) => s.categoryFilter);
  const fetchExpenses = useExpenseStore((s) => s.fetchExpenses);
  const setPeriod = useExpenseStore((s) => s.setPeriod);
  const setCategory = useExpenseStore((s) => s.setCategoryFilter);
  const clearFilters = useExpenseStore((s) => s.clearFilters);
  const voidExpense = useExpenseStore((s) => s.voidExpense);
  const clearError = useExpenseStore((s) => s.clearError);

  useEffect(() => {
    void fetchExpenses();
  }, [branch, fetchExpenses]);

  const view = useMemo(
    () => expenseListView(items, summary, { search, category }),
    [items, summary, search, category],
  );

  const remove = useCallback(
    async (item: ExpenseItem) => {
      if (!user || !item.canVoid) return;
      await confirm({
        title: t("expenses.remove_title"),
        message: t("expenses.remove_message", { label: item.label }),
        confirmLabel: t("expenses.remove"),
        destructive: true,
        onConfirm: async () => {
          await voidExpense(item, user.id);
        },
      });
    },
    [user, t, voidExpense],
  );

  return {
    ...view,
    loaded,
    loading,
    error,
    clearError,
    period,
    setPeriod,
    category,
    setCategory,
    hasActiveFilters: category !== "all",
    filtersChanged:
      category !== "all" || period.preset !== EXPENSE_DEFAULT_PRESET,
    clearFilters,
    reload: fetchExpenses,
    remove,
  };
}
