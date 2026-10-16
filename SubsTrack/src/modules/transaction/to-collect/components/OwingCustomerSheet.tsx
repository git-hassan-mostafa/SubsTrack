import { useState } from "react";
import { View } from "react-native";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { SheetScrollView } from "@/src/shared/components/SheetScrollComponents";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { IconButton } from "@/src/shared/components/IconButton";
import { SheetHeader } from "@/src/shared/components/SheetHeader";
import { Button } from "@/src/shared/components/Button";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { CustomerDebts, OpenItem } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import { useDebtScope } from "@shared/modules/transaction/debts/hooks/useDebtScope";
import { owingCustomerActions } from "@shared/modules/transaction/to-collect/utils/toCollectView";
import { customerOwedItems, customerOwedUsd } from "@shared/modules/ledger/utils/owedView";
import { toActionMenuItems } from "@/src/shared/lib/menuActions";
import { OWING_CUSTOMER_ACTION_ICONS } from "../utils/owingCustomerActionIcons";
import { DebtScopeFilter } from "../../debts/components/DebtScopeFilter";
import { OwedList } from "./OwedList";
import { CustomDebtFormSheet } from "../../debts/components/CustomDebtFormSheet";

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
export function OwingCustomerSheet({
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
  const target = useDisplayCurrency();

  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bodyReady = useAfterFirstFrame();
  const { scope, setScope, showingWrittenOff, writtenOff } = useDebtScope(
    debtor.customerId,
    debtor.customerName,
  );

  const owed = customerOwedItems(debtor);
  const totalUsd = customerOwedUsd(debtor);

  return (
    <>
      <AppBottomSheet
        visible
        onDismiss={onDismiss}
        variant="full"
        dismissOnBackdropPress={false}
      >
        <ResponsiveContainer className="flex-1">
          <SheetHeader
            subject={debtor.customerName}
            title={`${formatMoney(totalUsd, null, target)} · ${t("debts.total_outstanding")}`}
            onClose={onDismiss}
            actions={
              <>
                <IconButton
                  icon="add"
                  color={COLORS.primary}
                  onPress={() => setCustomDebtOpen(true)}
                  accessibilityLabel={t("debts.add_custom_debt")}
                />
                {onWriteOffAll && owed.length > 0 ? (
                  <IconButton
                    icon="ellipsis-vertical"
                    size={20}
                    color={COLORS.gray500}
                    onPress={() => setMenuOpen(true)}
                    accessibilityLabel={t("common.more_actions")}
                  />
                ) : null}
              </>
            }
          />

          <SheetScrollView
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
                  <OwedList
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
                    <OwedList
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
          </SheetScrollView>
        </ResponsiveContainer>
      </AppBottomSheet>

      <ActionMenu
        visible={menuOpen}
        title={debtor.customerName}
        onDismiss={() => setMenuOpen(false)}
        actions={toActionMenuItems(owingCustomerActions(owed), t, {
          icons: OWING_CUSTOMER_ACTION_ICONS,
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
