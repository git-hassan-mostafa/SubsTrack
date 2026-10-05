import type { AuthUser, Currency, ExpenseCategory } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import type { CreateExpenseInput } from "@shared/modules/transaction/expenses/utils/types";

export interface ExpenseDraft {
  category: ExpenseCategory;
  amount: number | null;
  currencyId: string | null;
  description: string;
  day: string;
  branchId: string | null;
}

// Starts in the user's own branch, else company-wide — never the only branch.
export function expenseDraftOf(
  today: string,
  user: Pick<AuthUser, "branchId"> | null,
): ExpenseDraft {
  return {
    category: "rent",
    amount: null,
    currencyId: null,
    description: "",
    day: today,
    branchId: user?.branchId ?? null,
  };
}

export function canSaveExpense(draft: Pick<ExpenseDraft, "amount">): boolean {
  return draft.amount !== null && draft.amount > 0;
}

// Midday keeps the picked day whichever way the device's UTC offset leans.
export function expenseDayToIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

export function newExpenseInput(
  draft: ExpenseDraft & { amount: number },
  user: Pick<AuthUser, "id" | "tenantId">,
  currencies: Currency[],
): CreateExpenseInput {
  return {
    category: draft.category,
    amount: draft.amount,
    description: draft.description.trim() || null,
    currency: findCurrency(currencies, draft.currencyId),
    branchId: draft.branchId,
    incurredAt: expenseDayToIso(draft.day),
    recordedByUserId: user.id,
    tenantId: user.tenantId,
  };
}
