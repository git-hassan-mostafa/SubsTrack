import { ScrollView, View } from "react-native";
import { SheetModal } from "@/src/shared/components/SheetModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import type { DebtItem, DebtPaymentItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { sumDebtNetUsd } from "../utils/debtAggregations";
import { DebtList } from "./DebtList";

interface Props {
  customerName: string;
  // Already filtered to this customer by the parent (derived from the slice each
  // render, so a pay/void re-fetch flows straight back into the open modal).
  items: DebtItem[];
  payments: DebtPaymentItem[];
  onDismiss: () => void;
  // Optional row actions — the debtor modal wires these to the Debts-tab handlers.
  onPay?: (item: DebtItem) => void;
  onVoidItem?: (item: DebtItem) => void;
  onVoidPayment?: (payment: DebtPaymentItem) => void;
}

// The debtor detail modal (opened from a Debtors-tab row): the customer's net
// still-owed figure plus the shared DebtList (their debts + debt payments).
// Interactive — pay a debt / void a payment right here.
export function DebtorDetailSheet({
  customerName,
  items,
  payments,
  onDismiss,
  onPay,
  onVoidItem,
  onVoidPayment,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const target = findCurrency(currencies, displayCurrencyId);

  const net = sumDebtNetUsd(items, payments).netUsd;
  const isCredit = net < -1e-9;
  const netLabel = formatMoney(Math.abs(net), null, target);

  return (
    <SheetModal onDismiss={onDismiss}>
      <SafeAreaView className="flex-1 bg-white">
        <ResponsiveContainer className="flex-1">
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-gray-300" />
          </View>
          <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <View className="flex-1 pe-2">
              <Text
                fontWeight="Bold"
                className="text-lg text-gray-900"
                numberOfLines={1}
              >
                {customerName}
              </Text>
              <Text
                className={`text-sm font-semibold mt-0.5 ${isCredit ? "text-green-600" : "text-gray-500"}`}
                numberOfLines={1}
              >
                {(isCredit ? "- " : "") + netLabel} ·{" "}
                {isCredit ? t("debts.credit") : t("debts.total_outstanding")}
              </Text>
            </View>
            <PressableOpacity onPress={onDismiss}>
              <Text className="text-base text-primary font-medium">
                {t("common.close")}
              </Text>
            </PressableOpacity>
          </View>

          <ScrollView
            className="flex-1 px-6 pt-4"
            contentContainerStyle={{ paddingBottom: 48 }}
          >
            <DebtList
              items={items}
              payments={payments}
              onPay={onPay}
              onVoidItem={onVoidItem}
              onVoidPayment={onVoidPayment}
            />
          </ScrollView>
        </ResponsiveContainer>
      </SafeAreaView>
    </SheetModal>
  );
}
