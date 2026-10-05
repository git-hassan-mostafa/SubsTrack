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
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { useCollectSheet, useOpenBill } from "@/src/modules/ledger";
import { owedUsd } from "@shared/modules/ledger/utils/debtRule";
import { useCustomerDebts } from "@shared/modules/transaction/debts/hooks/useCustomerDebts";
import { useDebtRowActions } from "../hooks/useDebtRowActions";
import { useDebtScope } from "@shared/modules/transaction/debts/hooks/useDebtScope";
import { debtorActions } from "@shared/modules/transaction/debts/utils/debtorView";
import { toActionMenuItems } from "@/src/shared/lib/menuActions";
import { DEBTOR_ACTION_ICONS } from "../utils/debtorActionIcons";
import { DebtScopeFilter } from "./DebtScopeFilter";
import { DebtList } from "./DebtList";
import { CustomDebtFormSheet } from "./CustomDebtFormSheet";

interface Props {
  customer: Customer;
  onOpenSale?: (saleId: string) => Promise<void> | void;
}

// Plain unpaid months stay out: the month grid above already shows them.
export function CustomerDebtsPanel({ customer, onOpenSale }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  const { items, loading, refresh } = useCustomerDebts(
    customer.id,
    customer.name,
  );
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
  } = useDebtRowActions();
  const openBill = useOpenBill({ onOpenSale });

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const target = findCurrency(currencies, displayCurrencyId);
  const totalUsd = owedUsd(items);

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
          onRevertWriteOff={revertWriteOffItem}
          onOpenItem={openBill.openOwed}
          openingItemKey={openBill.loadingId}
        />
      ) : (
        <DebtList
          items={items}
          loading={loading}
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
        actions={toActionMenuItems(debtorActions(items), t, {
          icons: DEBTOR_ACTION_ICONS,
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
