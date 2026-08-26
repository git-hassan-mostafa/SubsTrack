import { useState } from "react";
import { View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { COLORS } from "@/src/shared/constants";
import type { DebtItem, DebtPaymentItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
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
  onComplete?: (item: DebtItem) => void;
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
  onComplete,
  onVoidItem,
  onVoidPayment,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const target = findCurrency(currencies, displayCurrencyId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  // The debts history can be long — keep it off the open path.
  const bodyReady = useAfterFirstFrame();

  const net = sumDebtNetUsd(items, payments).netUsd;
  const isCredit = net < -1e-9;
  const netLabel = formatMoney(Math.abs(net), null, target);

  const lockedCustomer = { id: customerId, name: customerName };

  return (
    <>
      <AppBottomSheet visible onDismiss={onDismiss} variant="full">
        <ResponsiveContainer className="flex-1">
          <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
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
          </SheetDragArea>

          <BottomSheetScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 48,
            }}
          >
            {bodyReady ? (
              <DebtList
                items={items}
                payments={payments}
                onPay={onPay}
                onComplete={onComplete}
                onVoidItem={onVoidItem}
                onVoidPayment={onVoidPayment}
              />
            ) : null}
          </BottomSheetScrollView>
        </ResponsiveContainer>
      </AppBottomSheet>

      <ActionMenu
        visible={menuOpen}
        title={t("debts.add")}
        onDismiss={() => setMenuOpen(false)}
        actions={[
          {
            key: "custom_debt",
            label: t("debts.add_custom_debt"),
            icon: "document-text-outline",
            iconBadge: "add",
            onPress: () => setCustomDebtOpen(true),
          },
          {
            key: "payment",
            label: t("debts.record_debt_payment"),
            icon: "cash-outline",
            iconBadge: "add",
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
    </>
  );
}
