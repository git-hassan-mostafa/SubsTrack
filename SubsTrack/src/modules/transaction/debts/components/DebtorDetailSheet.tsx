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
import { Button } from "@/src/shared/components/Button";
import { COLORS } from "@/src/shared/constants";
import type { CustomerDebts, OpenItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import { DebtList } from "./DebtList";
import { CustomDebtFormSheet } from "./CustomDebtFormSheet";

interface Props {
  debtor: CustomerDebts;
  onDismiss: () => void;
  /** Collect against this customer's whole pool, oldest bill first. */
  onCollectAll: (items: OpenItem[]) => void;
  /** Collect against one bill only. */
  onCollectItem: (item: OpenItem) => void;
  onVoidItem?: (item: OpenItem) => void;
  onWriteOff?: (item: OpenItem) => void;
  /** A custom fee was added — the parent refreshes. */
  onChanged?: () => void;
}

/**
 * Everything one customer owes.
 *
 * Two sections, and the split is the point: DEBTS are bills money is being
 * chased for; UNPAID MONTHS are owed but belong to the month grid. The collect
 * button pours money over BOTH, oldest first — which is exactly what happens
 * when a customer hands over cash without saying what it is for.
 */
export function DebtorDetailSheet({
  debtor,
  onDismiss,
  onCollectAll,
  onCollectItem,
  onVoidItem,
  onWriteOff,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const target = findCurrency(currencies, displayCurrencyId);

  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  // The list can be long — keep it off the sheet's open path.
  const bodyReady = useAfterFirstFrame();

  const owed = [...debtor.items, ...debtor.unpaidMonths];
  const totalUsd = debtor.debtUsd + debtor.unpaidMonthsUsd;

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
                {debtor.customerName}
              </Text>
              <Text
                className="text-sm font-semibold text-gray-500 mt-0.5"
                numberOfLines={1}
              >
                {formatMoney(totalUsd, null, target)} ·{" "}
                {t("debts.total_outstanding")}
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <PressableOpacity
                onPress={() => setCustomDebtOpen(true)}
                accessibilityLabel={t("debts.add_custom_debt")}
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
              <>
                <View className="mb-4">
                  <Button
                    label={t("ledger.collect_amount", {
                      amount: formatMoney(totalUsd, null, target),
                    })}
                    onPress={() => onCollectAll(owed)}
                    disabled={owed.length === 0}
                  />
                </View>
                <DebtList
                  items={debtor.items}
                  unpaidMonths={debtor.unpaidMonths}
                  newestFirst
                  onCollect={onCollectItem}
                  onVoidItem={onVoidItem}
                  onWriteOff={onWriteOff}
                />
              </>
            ) : null}
          </BottomSheetScrollView>
        </ResponsiveContainer>
      </AppBottomSheet>

      {customDebtOpen && (
        <CustomDebtFormSheet
          initialCustomer={{ id: debtor.customerId, name: debtor.customerName }}
          onDismiss={() => setCustomDebtOpen(false)}
          onCreated={onChanged}
        />
      )}
    </>
  );
}
