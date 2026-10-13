import { useCallback, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { Customer } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useCollectSheet, useOpenBill } from "@/src/modules/ledger";
import { customerOwedItems, customerOwedUsd } from "@shared/modules/ledger/utils/owedView";
import { useCustomerToCollect } from "@shared/modules/transaction/to-collect/hooks/useCustomerToCollect";
import { useOwedRowActions } from "../hooks/useOwedRowActions";
import { useDebtScope } from "@shared/modules/transaction/debts/hooks/useDebtScope";
import { owingCustomerActions } from "@shared/modules/transaction/to-collect/utils/toCollectView";
import { toActionMenuItems } from "@/src/shared/lib/menuActions";
import { OWING_CUSTOMER_ACTION_ICONS } from "../utils/owingCustomerActionIcons";
import { DebtScopeFilter } from "../../debts/components/DebtScopeFilter";
import { OwedList } from "./OwedList";
import { CustomDebtFormSheet } from "../../debts/components/CustomDebtFormSheet";

interface Props {
  customer: Customer;
  onOpenSale?: (saleId: string) => Promise<void> | void;
}

// The same rows as this customer's sheet on the To collect page.
export function CustomerToCollectPanel({ customer, onOpenSale }: Props) {
  const { t } = useTranslation();

  const { entry, loading, error, clearError, refresh } =
    useCustomerToCollect(customer);
  const items = customerOwedItems(entry);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scope, setScope, showingWrittenOff, writtenOff } = useDebtScope(
    customer.id,
    customer.name,
  );

  const collectSheet = useCollectSheet();
  const {
    voidItem,
    writeOffItem,
    revertWriteOffItem,
    writeOffAll,
    editItem,
    editSheet,
  } = useOwedRowActions();
  const openBill = useOpenBill({ onOpenSale });

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const target = useDisplayCurrency();
  const totalUsd = customerOwedUsd(entry);

  return (
    <View className="px-4 mt-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {t("customers.to_collect")}
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
          {items.length > 0 ? (
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
        </View>
      </View>

      <DebtScopeFilter value={scope} onChange={setScope} className="mb-3" />

      {!showingWrittenOff && error ? (
        <ErrorBanner message={error} onDismiss={clearError} />
      ) : null}

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
          onRevertWriteOff={revertWriteOffItem}
          onOpenItem={openBill.openOwed}
          openingItemKey={openBill.loadingId}
        />
      ) : (
        <OwedList
          items={entry.items}
          unpaidMonths={entry.unpaidMonths}
          loading={loading}
          emptyMessage={t("debts.no_debtors")}
          onCollect={(item) => collectSheet.openOne(customer.name, item)}
          onEditItem={editItem}
          onVoidItem={voidItem}
          onWriteOff={writeOffItem}
          onOpenItem={openBill.openOwed}
          openingItemKey={openBill.loadingId}
        />
      )}

      <ActionMenu
        visible={menuOpen}
        title={customer.name}
        onDismiss={() => setMenuOpen(false)}
        actions={toActionMenuItems(owingCustomerActions(items), t, {
          icons: OWING_CUSTOMER_ACTION_ICONS,
          run: {
            collect_all: () => collectSheet.open(customer.id, customer.name, items),
            write_off_all: () => void writeOffAll(customer.name, items),
          },
        })}
      />

      {customDebtOpen && (
        <CustomDebtFormSheet
          initialCustomer={customer}
          onDismiss={() => setCustomDebtOpen(false)}
        />
      )}

      {editSheet}
      {collectSheet.sheet}
      {openBill.sheet}
    </View>
  );
}
