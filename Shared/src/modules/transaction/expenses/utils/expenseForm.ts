import type { AuthUser, Currency, ExpenseCategory } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import { pickedInstantIso } from "@shared/core/utils/date";
import type { CreateExpenseInput } from "@shared/modules/transaction/expenses/utils/types";

export interface ExpenseDraft {
  category: ExpenseCategory;
  amount: number | null;
  currencyId: string | null;
  description: string;
  at: string;
  atPicked: boolean;
  branchId: string | null;
}

// Starts in the user's own branch, else company-wide — never the only branch.
export function expenseDraftOf(
  now: string,
  user: Pick<AuthUser, "branchId"> | null,
): ExpenseDraft {
  return {
    category: "rent",
    amount: null,
    currencyId: null,
    description: "",
    at: now,
    atPicked: false,
    branchId: user?.branchId ?? null,
  };
}

export function canSaveExpense(draft: Pick<ExpenseDraft, "amount">): boolean {
  return draft.amount !== null && draft.amount > 0;
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
    incurredAt: pickedInstantIso(draft.at, draft.atPicked),
    recordedByUserId: user.id,
    tenantId: user.tenantId,
  };
}
