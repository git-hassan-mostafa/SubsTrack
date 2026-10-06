import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { FAB } from "@/src/shared/components/FAB";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { useDebounce } from "@shared/shared/hooks/useDebounce";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { formatMoney } from "@shared/core/utils/currency";
import type { CustomerDebts } from "@shared/core/types";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useCollectSheet, useOpenBill } from "@/src/modules/ledger";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import {
  debtorActions,
  debtorOwedItems,
  filterDebtors,
} from "@shared/modules/transaction/debts/utils/debtorView";
import { toActionMenuItems } from "@/src/shared/lib/menuActions";
import { DEBTOR_ACTION_ICONS } from "../utils/debtorActionIcons";
import { useDebtRowActions } from "../hooks/useDebtRowActions";
import { DebtorCard } from "../components/DebtorCard";
import { DebtorDetailSheet } from "../components/DebtorDetailSheet";
import { CustomDebtFormSheet } from "../components/CustomDebtFormSheet";
import { AllDebtsSheet } from "../components/AllDebtsSheet";
import { DebtHistorySheet } from "../components/DebtHistorySheet";

interface Props {
  onOpenSale?: (saleId: string) => Promise<void> | void;
}

// One row per customer who still owes, all from ONE read of the open bills.
export function DebtsPanel({ onOpenSale }: Props = {}) {
  const { t } = useTranslation();

  const view = useLedgerSlice((s) => s.debts);
  const loading = useLedgerSlice((s) => s.loading);
  const error = useLedgerSlice((s) => s.error);
  const fetchDebts = useLedgerSlice((s) => s.fetchDebts);
  const ensureDebts = useLedgerSlice((s) => s.ensureDebts);
  const clearError = useLedgerSlice((s) => s.clearError);

  const branchFilter = useEffectiveBranchFilter();
  const refresh = useCallback(
    () => void fetchDebts(branchFilter),
    [fetchDebts, branchFilter],
  );
  const ensure = useCallback(
    () => void ensureDebts(branchFilter),
    [ensureDebts, branchFilter],
  );

  const collectSheet = useCollectSheet();
  const {
    voidItem,
    writeOffItem,
    revertWriteOffItem,
    writeOffDebtor,
    editItem,
    editSheet,
  } = useDebtRowActions();
  const openBill = useOpenBill({ onOpenSale });
  useOwedChanged(ensure);

  const [debtorSearch, setDebtorSearch] = useState("");
  const debouncedDebtorSearch = useDebounce(debtorSearch);
  const [openDebtorId, setOpenDebtorId] = useState<string | null>(null);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [allDebtsOpen, setAllDebtsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuDebtor, setMenuDebtor] = useState<CustomerDebts | null>(null);

  useEffect(() => {
    ensure();
  }, [ensure]);

  const target = useDisplayCurrency();
  const debtors = useMemo(() => view?.customers ?? [], [view]);

  const visibleDebtors = useMemo(
    () => filterDebtors(debtors, debouncedDebtorSearch),
    [debtors, debouncedDebtorSearch],
  );

  const openDebtor = useMemo(
    () => debtors.find((d) => d.customerId === openDebtorId) ?? null,
    [debtors, openDebtorId],
  );

  const totalLabel = formatMoney(view?.summary.totalUsd ?? 0, null, target);

  function debtorMenu(debtor: CustomerDebts) {
    const owed = debtorOwedItems(debtor);
    return toActionMenuItems(debtorActions(owed), t, {
      icons: DEBTOR_ACTION_ICONS,
      run: {
        collect_all: () =>
          collectSheet.open(debtor.customerId, debtor.customerName, owed),
        write_off_all: () => void writeOffDebtor(debtor),
      },
    });
  }

  return (
    <View className="flex-1">
      <ResponsiveContainer className="flex-1">
        <View className="px-4 pt-3 flex-row items-center justify-between">
          <View className="flex-1 pe-2">
            <Text
              fontWeight="Bold"
              accessibilityLabel={t("debts.total_outstanding")}
              className="text-2xl text-gray-900"
              numberOfLines={1}
            >
              {totalLabel}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              {t("ledger.owed_by_n_customers", {
                count: view?.summary.customerCount ?? 0,
              })}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <PressableOpacity
              onPress={() => setAllDebtsOpen(true)}
              accessibilityLabel={t("debts.all_debts_title")}
              className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
            >
              <Ionicons name="list-outline" size={18} color={COLORS.gray600} />
            </PressableOpacity>
            <PressableOpacity
              onPress={() => setHistoryOpen(true)}
              accessibilityLabel={t("debts.history_title")}
              className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
            >
              <Ionicons name="time-outline" size={18} color={COLORS.gray600} />
            </PressableOpacity>
          </View>
        </View>

        <View className="px-4 pt-2">
          <SearchTextBox
            searchText={debtorSearch}
            setSearchText={setDebtorSearch}
            placeholder={t("debts.search_debtors_hint")}
          />
        </View>

        {error && collectSheet.sheet == null ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}

        {loading && debtors.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={visibleDebtors}
            keyExtractor={(d) => d.customerId}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 96,
              flexGrow: 1,
            }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={refresh}
                tintColor={COLORS.primary}
              />
            }
            renderItem={({ item: d }) => (
              <DebtorCard
                debtor={d}
                onPress={() => setOpenDebtorId(d.customerId)}
                onMenu={() => setMenuDebtor(d)}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                message={t("debts.no_debtors")}
                subMessage={
                  debouncedDebtorSearch.trim()
                    ? t("debts.no_debtors_search")
                    : t("debts.no_debtors_hint")
                }
              />
            }
          />
        )}

        <FAB
          onPress={() => setCustomDebtOpen(true)}
          accessibilityLabel={t("debts.add_custom_debt")}
        />
      </ResponsiveContainer>

      <ActionMenu
        visible={!!menuDebtor}
        title={menuDebtor?.customerName}
        onDismiss={() => setMenuDebtor(null)}
        actions={menuDebtor ? debtorMenu(menuDebtor) : []}
      />

      {openDebtor && (
        <DebtorDetailSheet
          debtor={openDebtor}
          onDismiss={() => setOpenDebtorId(null)}
          onCollectAll={(items) =>
            collectSheet.open(
              openDebtor.customerId,
              openDebtor.customerName,
              items,
            )
          }
          onCollectItem={(item) =>
            collectSheet.openOne(openDebtor.customerName, item)
          }
          onEditItem={editItem}
          onVoidItem={voidItem}
          onWriteOff={writeOffItem}
          onRevertWriteOff={revertWriteOffItem}
          onWriteOffAll={writeOffDebtor}
          onOpenItem={openBill.openOwed}
          openingItemKey={openBill.loadingId}
        />
      )}

      {customDebtOpen && (
        <CustomDebtFormSheet onDismiss={() => setCustomDebtOpen(false)} />
      )}

      {allDebtsOpen && (
        <AllDebtsSheet
          view={view}
          onDismiss={() => setAllDebtsOpen(false)}
          onCollectItem={(item) =>
            collectSheet.openOne(item.customerName, item)
          }
          onEditItem={editItem}
          onVoidItem={voidItem}
          onWriteOff={writeOffItem}
          onRevertWriteOff={revertWriteOffItem}
          onOpenItem={openBill.openOwed}
          openingItemKey={openBill.loadingId}
        />
      )}

      {historyOpen && (
        <DebtHistorySheet
          onDismiss={() => setHistoryOpen(false)}
          onOpenItem={openBill.openOwed}
          openingItemKey={openBill.loadingId}
        />
      )}

      {editSheet}
      {collectSheet.sheet}
      {openBill.sheet}
    </View>
  );
}
