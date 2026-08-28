import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import type { Customer, OpenItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { chargeService, isDebtItem, useCollectSheet } from "@/src/modules/ledger";
import { useDebtRowActions } from "../hooks/useDebtRowActions";
import { DebtList } from "./DebtList";
import { CustomDebtFormSheet } from "./CustomDebtFormSheet";

interface Props {
  customer: Customer;
}

/**
 * This customer's open bills, on the customer detail screen.
 *
 * Reads the service directly rather than the global `ledger` slice, so the
 * customer-scoped view never collides with the Transactions → Debts tab's list
 * state — the same pattern as CustomerSalesPanel. Plain unpaid months are NOT
 * listed here: the month grid above already shows them.
 */
export function CustomerDebtsPanel({ customer }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  const [items, setItems] = useState<OpenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  // Discards out-of-order responses if focus fires refresh while one is in flight.
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    try {
      // Not branch-scoped: show all of this customer's bills regardless of the
      // admin's current branch view (mirrors CustomerSalesPanel).
      const open = await chargeService.getOpenCharges({ customerId: customer.id });
      if (tokenRef.current !== token) return;
      setItems(
        open
          .filter((i) => isDebtItem(i.kind, i.paid))
          .map((i) => ({ ...i, customerName: customer.name })),
      );
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [customer.id, customer.name]);

  const collectSheet = useCollectSheet({ onCollected: refresh });
  const { voidItem, writeOffItem } = useDebtRowActions({ onChanged: refresh });

  // Refresh on focus so bills raised elsewhere show on return.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const target = findCurrency(currencies, displayCurrencyId);
  const totalUsd = items.reduce((sum, i) => sum + i.balance / i.ratePerUsdSnapshot, 0);

  return (
    <View className="px-4 mt-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {t("debts.customer_panel_title")}
        </Text>
        <View className="flex-row items-center gap-3">
          {items.length > 0 ? (
            <Text fontWeight="Bold" className="text-base text-gray-900">
              {formatMoney(totalUsd, null, target)}
            </Text>
          ) : null}
          <PressableOpacity
            onPress={() => setCustomDebtOpen(true)}
            accessibilityLabel={t("debts.add_custom_debt")}
            className="w-8 h-8 rounded-full bg-indigo-50 items-center justify-center"
          >
            <Ionicons name="add" size={18} color={COLORS.primary} />
          </PressableOpacity>
        </View>
      </View>

      <DebtList
        items={items}
        loading={loading}
        onCollect={(item) => collectSheet.openOne(customer.name, item)}
        onVoidItem={voidItem}
        onWriteOff={writeOffItem}
      />

      {customDebtOpen && (
        <CustomDebtFormSheet
          initialCustomer={customer}
          onDismiss={() => setCustomDebtOpen(false)}
          onCreated={refresh}
        />
      )}

      {collectSheet.sheet}
    </View>
  );
}
