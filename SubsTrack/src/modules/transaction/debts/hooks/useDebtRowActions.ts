import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { DebtItem, DebtPaymentItem } from "@/src/core/types";
import { confirm } from "@/src/shared/lib/confirm";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useDebtSlice } from "@/src/state/hooks/useDebtSlice";
import { useAuth } from "@/src/modules/authentication/auth";

interface Options {
  // Called after a successful mutation, for surfaces that keep their own copy of
  // the data (the customer-detail panel reads the service directly, so the
  // slice refresh the actions trigger never reaches it).
  onChanged?: () => void;
}

// The debt row actions (pay a debt / remove a custom debt / remove a debt
// payment), shared by every surface that lists debt rows: the Debts tab, the
// debtor modal, and the customer-detail panel. Each confirms first, then goes
// through the debts slice so the branch-wide list and the customer-list debt
// flag stay correct.
export function useDebtRowActions({ onChanged }: Options = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const addDebtPayment = useDebtSlice((s) => s.addDebtPayment);
  const voidCustomDebt = useDebtSlice((s) => s.voidCustomDebt);
  const voidDebtPayment = useDebtSlice((s) => s.voidDebtPayment);

  const target = findCurrency(currencies, displayCurrencyId);

  // Pay off a debt row by recording a debt payment equal to its remaining
  // amount, in the row's own currency. This never touches the underlying
  // payment/sale — it only offsets the customer's runtime debt total.
  const payItem = useCallback(
    async (item: DebtItem) => {
      if (!user) return;
      const source = findCurrency(currencies, item.currencyId);
      const ok = await confirm({
        title: t("debts.pay_title"),
        message: t("debts.pay_message", {
          amount: formatMoney(item.remaining, source, target),
          customer: item.customerName,
        }),
        confirmLabel: t("debts.pay"),
      });
      if (!ok) return;
      await addDebtPayment({
        customerId: item.customerId,
        amount: item.remaining,
        notes: null,
        currency: source,
        receivedByUserId: user.id,
        tenantId: user.tenantId,
      });
      onChanged?.();
    },
    [user, currencies, target, t, addDebtPayment, onChanged],
  );

  const voidItem = useCallback(
    async (item: DebtItem) => {
      if (!user || item.category !== "custom") return;
      const ok = await confirm({
        title: t("debts.void_custom_title"),
        message: t("debts.void_custom_message"),
        confirmLabel: t("common.delete"),
        destructive: true,
      });
      if (!ok) return;
      await voidCustomDebt(item.id, user.id, null);
      onChanged?.();
    },
    [user, t, voidCustomDebt, onChanged],
  );

  const voidPayment = useCallback(
    async (payment: DebtPaymentItem) => {
      if (!user) return;
      const ok = await confirm({
        title: t("debts.void_payment_title"),
        message: t("debts.void_payment_message"),
        confirmLabel: t("common.delete"),
        destructive: true,
      });
      if (!ok) return;
      await voidDebtPayment(payment.id, user.id, null);
      onChanged?.();
    },
    [user, t, voidDebtPayment, onChanged],
  );

  return { payItem, voidItem, voidPayment };
}
