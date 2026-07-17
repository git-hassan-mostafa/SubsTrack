import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SheetModal } from "@/src/shared/components/SheetModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { COLORS } from "@/src/shared/constants";
import type { DebtItem, DebtPaymentItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { sumDebtNetUsd } from "../utils/debtAggregations";
import { DebtList } from "./DebtList";
import { CustomDebtFormSheet } from "./CustomDebtFormSheet";
import { DebtPaymentFormSheet } from "./DebtPaymentFormSheet";

interface Props {
  customerId: string;
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
// still-owed figure plus the shared DebtList (their debts history + debt
// payments history). Interactive — add a debt / debt payment, pay a debt, or
// void a payment right here (same add pattern as the customer-detail panel).
export function DebtorDetailSheet({
  customerId,
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const net = sumDebtNetUsd(items, payments).netUsd;
  const isCredit = net < -1e-9;
  const netLabel = formatMoney(Math.abs(net), null, target);

  const lockedCustomer = { id: customerId, name: customerName };

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
            <View className="flex-row items-center gap-3">
              <PressableOpacity
                onPress={() => setMenuOpen(true)}
                accessibilityLabel={t("debts.add")}
                className="w-8 h-8 rounded-full bg-indigo-50 items-center justify-center"
              >
                <Ionicons name="add" size={18} color={COLORS.primary} />
              </PressableOpacity>
              <PressableOpacity onPress={onDismiss}>
                <Text className="text-base text-primary font-medium">
                  {t("common.close")}
                </Text>
              </PressableOpacity>
            </View>
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

      <ActionMenu
        visible={menuOpen}
        title={t("debts.add")}
        onDismiss={() => setMenuOpen(false)}
        actions={[
          {
            key: "custom_debt",
            label: t("debts.add_custom_debt"),
            icon: "document-text-outline",
            onPress: () => setCustomDebtOpen(true),
          },
          {
            key: "payment",
            label: t("debts.record_debt_payment"),
            icon: "cash-outline",
            onPress: () => setPaymentOpen(true),
          },
        ]}
      />

      {customDebtOpen && (
        <CustomDebtFormSheet
          initialCustomer={lockedCustomer}
          onDismiss={() => setCustomDebtOpen(false)}
        />
      )}
      {paymentOpen && (
        <DebtPaymentFormSheet
          initialCustomer={lockedCustomer}
          onDismiss={() => setPaymentOpen(false)}
        />
      )}
    </SheetModal>
  );
}
