import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "expo-router";
import { Text } from "@/src/shared/components/Text";
import type {
  Customer,
  DebtItem,
  DebtPaymentItem,
  DebtSummary,
} from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import debtService from "../services/DebtService";
import { DebtList } from "./DebtList";

interface Props {
  customer: Customer;
}

const EMPTY_SUMMARY: DebtSummary = { grossUsd: 0, paymentsUsd: 0, netUsd: 0 };

// Renders on the customer detail screen. Shows this customer's outstanding debts
// (partial months, partial sales, custom debts) and the debt payments recorded
// against them, with the net still-owed figure. Reads independently from the
// global `debts` slice (via the service) so the customer-scoped view never
// collides with the Transactions → Debts tab's filter/list state — same pattern
// as CustomerSalesPanel. Read-only: mutations live in the Debts tab.
export function CustomerDebtsPanel({ customer }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();

  const [items, setItems] = useState<DebtItem[]>([]);
  const [payments, setPayments] = useState<DebtPaymentItem[]>([]);
  const [summary, setSummary] = useState<DebtSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  // Discards out-of-order responses if focus fires refresh while one is in flight.
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    try {
      // Not branch-scoped: show all of this customer's debts regardless of the
      // admin's current branch view (mirrors CustomerSalesPanel).
      const view = await debtService.getDebtsView({ customerId: customer.id });
      if (tokenRef.current !== token) return;
      setItems(view.items);
      setPayments(view.payments);
      setSummary(view.summary);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [customer.id]);

  // Refresh on focus so debts/payments recorded in the Debts tab show on return.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const target = findCurrency(currencies, displayCurrencyId);
  const net = summary.netUsd;
  const isCredit = net < -1e-9;
  const netLabel = formatMoney(Math.abs(net), null, target);
  const isEmpty = items.length === 0 && payments.length === 0;

  return (
    <View className="px-4 mt-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {t("debts.customer_panel_title")}
        </Text>
        {!isEmpty ? (
          <View className="items-end">
            <Text
              fontWeight="Bold"
              className={`text-base ${isCredit ? "text-green-600" : "text-gray-900"}`}
            >
              {isCredit ? `- ${netLabel}` : netLabel}
            </Text>
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {isCredit ? t("debts.credit") : t("debts.total_outstanding")}
            </Text>
          </View>
        ) : null}
      </View>

      <DebtList items={items} payments={payments} loading={loading} />
    </View>
  );
}
