import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CustomerPlan, MonthEntry, OpenItem } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { findCurrency } from "@shared/core/utils/currency";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  formatUnits,
  usageBillLine,
} from "@shared/modules/customer/customer-payments/utils/meterReadingText";
import {
  chargeUsageOf,
  workedOutBill,
} from "@shared/modules/customer/customer-payments/utils/usageBill";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";

// Retype one unpaid usage bill; typing the worked-out amount again goes back to it.
export function useUsageBillEdit(line: CustomerPlan, entry: MonthEntry, item: OpenItem) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const retypeUsageBill = useLedgerSlice((s) => s.retypeUsageBill);
  const saving = useLedgerSlice((s) => s.loading);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const [amount, setAmount] = useState<number | null>(item.amount);

  const fresh = workedOutBill(entry.usage);
  const parts = fresh ? chargeUsageOf(fresh) : (item.usage ?? null);
  const plan = line.plan?.usage ?? null;
  const currency = findCurrency(currencies, item.currencyId);
  const valid = amount !== null && Number.isFinite(amount) && amount > 0;
  const changed = amount !== item.amount;

  function edit(next: number | null) {
    setAmount(next);
    if (error) clearError();
  }

  async function save(): Promise<boolean> {
    if (!user || !parts || amount === null || !valid) return false;
    return retypeUsageBill({
      item: { ...item, usage: parts },
      amount,
      tenantId: user.tenantId,
      recordedByUserId: user.id,
    });
  }

  return {
    title: t("payments.usage_bill.title", { month: billingMonthLabel(entry.billingMonth) }),
    amountLabel: t("payments.usage_bill.amount", { currency: currency?.code ?? "USD" }),
    units: parts && plan ? formatUnits(parts.units, plan.unitName) : null,
    workedOut:
      parts && plan
        ? usageBillLine({ ...parts, amount: parts.computedAmount }, currency, plan.feeName, t)
        : null,
    amount,
    setAmount: edit,
    resetToWorkedOut: () => edit(parts?.computedAmount ?? null),
    canResetToWorkedOut: parts !== null && amount !== parts.computedAmount,
    saving,
    error,
    clearError,
    canSave: valid && changed && !saving,
    dirty: changed,
    save,
  };
}

export type UsageBillEditForm = ReturnType<typeof useUsageBillEdit>;
