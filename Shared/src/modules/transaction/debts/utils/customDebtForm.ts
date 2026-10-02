import type { AuthUser, Currency, Customer, OpenItem } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import type {
  CreateManualChargeInput,
  UpdateManualChargeInput,
} from "@shared/modules/ledger/services/ChargeService";

const MONEY_TOLERANCE = 1e-6;

// A debtor row only knows the customer's id and name, never the full record.
export type CustomDebtCustomer = Pick<Customer, "id" | "name"> &
  Partial<Pick<Customer, "branchId" | "phoneNumber">>;

export interface CustomDebtDraft {
  amount: number | null;
  currencyId: string | null;
  description: string;
  dueDate: string;
}

export function customDebtDraftOf(
  item: OpenItem | null,
  today: string,
): CustomDebtDraft {
  return {
    amount: item?.amount ?? null,
    currencyId: item?.currencyId ?? null,
    description: item?.charge?.description ?? "",
    dueDate: item?.dueDate ?? today,
  };
}

export function editedDebtCustomer(item: OpenItem): CustomDebtCustomer {
  return { id: item.customerId, name: item.customerName, branchId: item.branchId };
}

export function isEditableCustomDebt(item: OpenItem): boolean {
  return item.kind === "manual" && item.chargeId !== null;
}

// Money on the bill freezes its currency and rate with the amount (gotcha #126).
export function isDebtCurrencyLocked(collected: number): boolean {
  return collected > 0;
}

export function isBelowCollected(amount: number | null, collected: number): boolean {
  return amount !== null && amount + MONEY_TOLERANCE < collected;
}

export function canSaveCustomDebt(
  draft: CustomDebtDraft,
  customer: CustomDebtCustomer | null,
  collected: number,
): boolean {
  return (
    customer !== null &&
    draft.amount !== null &&
    draft.amount > 0 &&
    !isBelowCollected(draft.amount, collected)
  );
}

export function customDebtBranchId(
  customer: CustomDebtCustomer,
  user: Pick<AuthUser, "branchId">,
): string | null {
  return customer.branchId ?? user.branchId;
}

export function newCustomDebtInput(
  draft: CustomDebtDraft & { amount: number },
  customer: CustomDebtCustomer,
  user: Pick<AuthUser, "id" | "tenantId" | "branchId">,
  currencies: Currency[],
): CreateManualChargeInput {
  const currency = findCurrency(currencies, draft.currencyId);
  return {
    tenantId: user.tenantId,
    customerId: customer.id,
    branchId: customDebtBranchId(customer, user),
    description: draft.description.trim() || null,
    amount: draft.amount,
    currencyId: currency?.id ?? null,
    ratePerUsdSnapshot: currency?.ratePerUsd ?? 1,
    dueDate: draft.dueDate,
    recordedByUserId: user.id,
  };
}

// The rate is re-frozen only when the currency itself moves.
export function customDebtEdit(
  draft: CustomDebtDraft & { amount: number },
  item: OpenItem,
  currencies: Currency[],
): UpdateManualChargeInput {
  const edit: UpdateManualChargeInput = {
    description: draft.description.trim(),
    amount: draft.amount,
    dueDate: draft.dueDate,
  };
  if ((draft.currencyId ?? null) === (item.currencyId ?? null)) return edit;
  const currency = findCurrency(currencies, draft.currencyId);
  return {
    ...edit,
    currencyId: currency?.id ?? null,
    ratePerUsdSnapshot: currency?.ratePerUsd ?? 1,
  };
}
