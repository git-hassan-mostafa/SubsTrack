import { useEffect, useState } from "react";
import type { Charge, Currency, Customer, OpenItem } from "@shared/core/types";
import { formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { getTodayDateString } from "@shared/core/utils/date";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  canSaveCustomDebt,
  customDebtDraftOf,
  customDebtEdit,
  editedDebtCustomer,
  isBelowCollected,
  isDebtCurrencyLocked,
  newCustomDebtInput,
  type CustomDebtCustomer,
} from "@shared/modules/transaction/debts/utils/customDebtForm";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";

interface CustomDebtFormOptions {
  item?: OpenItem | null;
  initialCustomer?: CustomDebtCustomer | null;
  onSaved: (charge: Charge) => void | Promise<void>;
}

export interface CustomDebtForm {
  editing: boolean;
  customer: CustomDebtCustomer | null;
  customerLocked: boolean;
  picked: Customer | null;
  setPicked: (customer: Customer | null) => void;
  amount: number | null;
  currencyId: string | null;
  setMoney: (next: { amount: number | null; currencyId: string | null }) => void;
  description: string;
  setDescription: (description: string) => void;
  dueDate: string;
  setDueDate: (dueDate: string) => void;
  currencies: Currency[];
  currencyLocked: boolean;
  belowCollected: boolean;
  collectedLabel: string;
  canSave: boolean;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  clearError: () => void;
  save: () => Promise<void>;
}

// No "created" callback is needed for lists: the write bumps owedVersion.
export function useCustomDebtForm({
  item = null,
  initialCustomer = null,
  onSaved,
}: CustomDebtFormOptions): CustomDebtForm {
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const addManualCharge = useLedgerSlice((s) => s.addManualCharge);
  const updateManualCharge = useLedgerSlice((s) => s.updateManualCharge);
  const saving = useLedgerSlice((s) => s.loading);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);

  const [draft, setDraft] = useState(() =>
    customDebtDraftOf(item, getTodayDateString()),
  );
  const [picked, setPicked] = useState<Customer | null>(null);

  const collected = item?.paid ?? 0;
  const lockedCustomer = item ? editedDebtCustomer(item) : initialCustomer;
  const customer: CustomDebtCustomer | null = lockedCustomer ?? picked;
  const billCurrency = item ? snapshotCurrency(item, currencies) : null;

  const dirty = useDirtyForm({
    pickedId: picked?.id ?? null,
    amount: draft.amount,
    currencyId: draft.amount === null ? null : draft.currencyId,
    description: draft.description,
    dueDate: draft.dueDate,
  });

  useEffect(() => {
    clearError();
  }, [clearError]);

  const canSave = canSaveCustomDebt(draft, customer, collected);

  const save = async () => {
    if (!user || !customer || !canSave || draft.amount === null) return;
    const filled = { ...draft, amount: draft.amount };
    const saved = item?.chargeId
      ? await updateManualCharge(
          item.chargeId,
          customDebtEdit(filled, item, currencies),
        )
      : await addManualCharge(
          newCustomDebtInput(filled, customer, user, currencies),
        );
    if (saved) await onSaved(saved);
  };

  return {
    editing: item !== null,
    customer,
    customerLocked: lockedCustomer !== null,
    picked,
    setPicked,
    amount: draft.amount,
    currencyId: draft.currencyId,
    setMoney: (next) => setDraft((prev) => ({ ...prev, ...next })),
    description: draft.description,
    setDescription: (description) =>
      setDraft((prev) => ({ ...prev, description })),
    dueDate: draft.dueDate,
    setDueDate: (dueDate) => setDraft((prev) => ({ ...prev, dueDate })),
    currencies,
    currencyLocked: isDebtCurrencyLocked(collected),
    belowCollected: isBelowCollected(draft.amount, collected),
    collectedLabel: item ? formatMoney(collected, billCurrency, billCurrency) : "",
    canSave,
    dirty,
    saving,
    error,
    clearError,
    save,
  };
}
