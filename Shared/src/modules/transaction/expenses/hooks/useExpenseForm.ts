import { useEffect, useState } from "react";
import type { Currency, ExpenseCategory } from "@shared/core/types";
import { getTodayDateString } from "@shared/core/utils/date";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useExpenseStore } from "@shared/modules/transaction/expenses/state/expenseStore";
import {
  canSaveExpense,
  expenseDraftOf,
  newExpenseInput,
} from "@shared/modules/transaction/expenses/utils/expenseForm";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";

export interface ExpenseForm {
  category: ExpenseCategory;
  setCategory: (category: ExpenseCategory) => void;
  amount: number | null;
  currencyId: string | null;
  setMoney: (next: { amount: number | null; currencyId: string | null }) => void;
  description: string;
  setDescription: (description: string) => void;
  day: string;
  setDay: (day: string) => void;
  today: string;
  branchId: string | null;
  setBranchId: (branchId: string | null) => void;
  currencies: Currency[];
  canSave: boolean;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  clearError: () => void;
  save: () => Promise<void>;
}

// The day the money left, capped at today: last month's rent stays in last month.
export function useExpenseForm({ onSaved }: { onSaved: () => void }): ExpenseForm {
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const addExpense = useExpenseStore((s) => s.addExpense);
  const saving = useExpenseStore((s) => s.loading);
  const error = useExpenseStore((s) => s.error);
  const clearError = useExpenseStore((s) => s.clearError);

  const [today] = useState(getTodayDateString);
  const [draft, setDraft] = useState(() => expenseDraftOf(today, user));
  const dirty = useDirtyForm({ ...draft }, ["currencyId"]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const canSave = canSaveExpense(draft);

  const save = async () => {
    if (!user || !canSave || draft.amount === null) return;
    const ok = await addExpense(
      newExpenseInput({ ...draft, amount: draft.amount }, user, currencies),
    );
    if (ok) onSaved();
  };

  const patch = (next: Partial<typeof draft>) =>
    setDraft((prev) => ({ ...prev, ...next }));

  return {
    category: draft.category,
    setCategory: (category) => patch({ category }),
    amount: draft.amount,
    currencyId: draft.currencyId,
    setMoney: (next) => patch(next),
    description: draft.description,
    setDescription: (description) => patch({ description }),
    day: draft.day,
    setDay: (day) => patch({ day }),
    today,
    branchId: draft.branchId,
    setBranchId: (branchId) => patch({ branchId }),
    currencies,
    canSave,
    dirty,
    saving,
    error,
    clearError,
    save,
  };
}
