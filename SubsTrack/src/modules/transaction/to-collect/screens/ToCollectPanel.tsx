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
import type { RenderPageHeader } from "@/src/shared/components/PageHeader";
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
  owingCustomerActions,
  filterOwingCustomers,
  showOwed,
  type OwedShow,
} from "@shared/modules/transaction/to-collect/utils/toCollectView";
import { customerOwedItems } from "@shared/modules/ledger/utils/owedView";
import { toActionMenuItems } from "@/src/shared/lib/menuActions";
import { OWING_CUSTOMER_ACTION_ICONS } from "../utils/owingCustomerActionIcons";
import { useOwedRowActions } from "../hooks/useOwedRowActions";
import { OwingCustomerCard } from "../components/OwingCustomerCard";
import { OwingCustomerSheet } from "../components/OwingCustomerSheet";
import { CustomDebtFormSheet } from "../../debts/components/CustomDebtFormSheet";
import { AllItemsSheet } from "../components/AllItemsSheet";
import { DebtHistorySheet } from "../../debts/components/DebtHistorySheet";
import { OwedShowFilter } from "../components/OwedShowFilter";
import { KEYBOARD_SAFE_LIST } from "@/src/shared/lib/keyboardSafeList";

interface Props {
  header: RenderPageHeader;
  onOpenSale?: (saleId: string) => Promise<void> | void;
}

// One row per customer with anything to collect; the filter is a view, never a read.
export function ToCollectPanel({ header, onOpenSale }: Props) {
  const { t } = useTranslation();

  const fullView = useLedgerSlice((s) => s.toCollect);
  const loading = useLedgerSlice((s) => s.loading);
  const error = useLedgerSlice((s) => s.error);
  const fetchToCollect = useLedgerSlice((s) => s.fetchToCollect);
  const ensureToCollect = useLedgerSlice((s) => s.ensureToCollect);
  const clearError = useLedgerSlice((s) => s.clearError);

  const branchFilter = useEffectiveBranchFilter();
  const refresh = useCallback(
    () => void fetchToCollect(branchFilter),
    [fetchToCollect, branchFilter],
  );
  const ensure = useCallback(
    () => void ensureToCollect(branchFilter),
    [ensureToCollect, branchFilter],
  );
  const [show, setShow] = useState<OwedShow>("all");
  const view = useMemo(
    () => (fullView ? showOwed(fullView, show) : null),
    [fullView, show],
  );

  const collectSheet = useCollectSheet();
  const {
    voidItem,
    writeOffItem,
    revertWriteOffItem,
    writeOffDebtor,
    editItem,
    editSheet,
  } = useOwedRowActions();
  const openBill = useOpenBill({ onOpenSale });
  useOwedChanged(ensure);

  const [debtorSearch, setDebtorSearch] = useState("");
  const debouncedDebtorSearch = useDebounce(debtorSearch);
  const [openDebtorId, setOpenDebtorId] = useState<string | null>(null);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [allItemsOpen, setAllItemsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuDebtor, setMenuDebtor] = useState<CustomerDebts | null>(null);

  useEffect(() => {
    ensure();
  }, [ensure]);

  const target = useDisplayCurrency();
  const debtors = useMemo(() => view?.customers ?? [], [view]);

  const visibleDebtors = useMemo(
    () => filterOwingCustomers(debtors, debouncedDebtorSearch),
    [debtors, debouncedDebtorSearch],
  );

  const openDebtor = useMemo(
    () => debtors.find((d) => d.customerId === openDebtorId) ?? null,
    [debtors, openDebtorId],
  );

  const totalLabel = formatMoney(view?.summary.totalUsd ?? 0, null, target);

  function debtorMenu(debtor: CustomerDebts) {
    const owed = customerOwedItems(debtor);
    return toActionMenuItems(owingCustomerActions(owed), t, {
      icons: OWING_CUSTOMER_ACTION_ICONS,
      run: {
        collect_all: () =>
          collectSheet.open(debtor.customerId, debtor.customerName, owed),
        write_off_all: () => void writeOffDebtor(debtor),
      },
    });
  }

  return (
    <View className="flex-1">
      {header({
        search: {
          value: debtorSearch,
          onChange: setDebtorSearch,
          placeholder: t("debts.search_debtors_hint"),
        },
      })}
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
              onPress={() => setAllItemsOpen(true)}
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
          <OwedShowFilter value={show} onChange={setShow} />
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
            {...KEYBOARD_SAFE_LIST}
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
              <OwingCustomerCard
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
        <OwingCustomerSheet
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

      {allItemsOpen && (
        <AllItemsSheet
          view={view}
          onDismiss={() => setAllItemsOpen(false)}
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
