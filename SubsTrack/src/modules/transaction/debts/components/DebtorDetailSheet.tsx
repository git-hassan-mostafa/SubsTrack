import { useState } from "react";
import { View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { CustomerDebts, OpenItem } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import { useDebtScope } from "@shared/modules/transaction/debts/hooks/useDebtScope";
import {
  debtorActions,
  debtorOwedItems,
  debtorOwedUsd,
} from "@shared/modules/transaction/debts/utils/debtorView";
import { toActionMenuItems } from "@/src/shared/lib/menuActions";
import { DEBTOR_ACTION_ICONS } from "../utils/debtorActionIcons";
import { DebtScopeFilter } from "./DebtScopeFilter";
import { DebtList } from "./DebtList";
import { CustomDebtFormSheet } from "./CustomDebtFormSheet";

interface Props {
  debtor: CustomerDebts;
  onDismiss: () => void;
  onCollectAll: (items: OpenItem[]) => void;
  onCollectItem: (item: OpenItem) => void;
  onEditItem?: (item: OpenItem) => void;
  onVoidItem?: (item: OpenItem) => void;
  onWriteOff?: (item: OpenItem) => void;
  onRevertWriteOff?: (item: OpenItem) => void;
  onWriteOffAll?: (debtor: CustomerDebts) => void;
  onOpenItem?: (item: OpenItem) => void;
  openingItemKey?: string | null;
}

// Collect pours money over the debts AND the part-paid months, oldest first.
export function DebtorDetailSheet({
  debtor,
  onDismiss,
  onCollectAll,
  onCollectItem,
  onEditItem,
  onVoidItem,
  onWriteOff,
  onRevertWriteOff,
  onWriteOffAll,
  onOpenItem,
  openingItemKey,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const target = findCurrency(currencies, displayCurrencyId);

  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bodyReady = useAfterFirstFrame();
  const { scope, setScope, showingWrittenOff, writtenOff } = useDebtScope(
    debtor.customerId,
    debtor.customerName,
  );

  const owed = debtorOwedItems(debtor);
  const totalUsd = debtorOwedUsd(debtor);

  return (
    <>
      <AppBottomSheet
        visible
        onDismiss={onDismiss}
        variant="full"
        dismissOnBackdropPress={false}
      >
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
                fontWeight="SemiBold"
                className="text-sm text-gray-500 mt-0.5"
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
              {onWriteOffAll && owed.length > 0 ? (
                <PressableOpacity
                  onPress={() => setMenuOpen(true)}
                  accessibilityLabel={t("common.more_actions")}
                  className="w-8 h-8 rounded-full items-center justify-center"
                >
                  <Ionicons
                    name="ellipsis-vertical"
                    size={18}
                    color={COLORS.gray500}
                  />
                </PressableOpacity>
              ) : null}
              <PressableOpacity onPress={onDismiss}>
                <Text fontWeight="Medium" className="text-base text-primary">
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
                <DebtScopeFilter
                  value={scope}
                  onChange={setScope}
                  className="mb-4"
                />

                {showingWrittenOff && writtenOff.error ? (
                  <ErrorBanner
                    message={writtenOff.error}
                    onDismiss={writtenOff.clearError}
                  />
                ) : null}

                {showingWrittenOff ? (
                  <DebtList
                    items={writtenOff.items}
                    loading={writtenOff.loading}
                    emptyMessage={t("debts.no_written_off")}
                    onRevertWriteOff={onRevertWriteOff}
                    onOpenItem={onOpenItem}
                    openingItemKey={openingItemKey}
                  />
                ) : (
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
                      onCollect={onCollectItem}
                      onEditItem={onEditItem}
                      onVoidItem={onVoidItem}
                      onWriteOff={onWriteOff}
                      onOpenItem={onOpenItem}
                      openingItemKey={openingItemKey}
                    />
                  </>
                )}
              </>
            ) : null}
          </BottomSheetScrollView>
        </ResponsiveContainer>
      </AppBottomSheet>

      <ActionMenu
        visible={menuOpen}
        title={debtor.customerName}
        onDismiss={() => setMenuOpen(false)}
        actions={toActionMenuItems(debtorActions(owed), t, {
          icons: DEBTOR_ACTION_ICONS,
          run: {
            write_off_all: onWriteOffAll ? () => onWriteOffAll(debtor) : undefined,
          },
        })}
      />

      {customDebtOpen && (
        <CustomDebtFormSheet
          initialCustomer={{ id: debtor.customerId, name: debtor.customerName }}
          onDismiss={() => setCustomDebtOpen(false)}
        />
      )}
    </>
  );
}
