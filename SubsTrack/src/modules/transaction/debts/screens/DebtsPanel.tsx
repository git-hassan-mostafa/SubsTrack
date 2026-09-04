import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { FAB } from "@/src/shared/components/FAB";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import type { CustomerDebts } from "@/src/core/types";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useCollectSheet, useOpenBill, useOwedChanged } from "@/src/modules/ledger";
import { useDebtRowActions } from "../hooks/useDebtRowActions";
import { DebtorCard } from "../components/DebtorCard";
import { DebtorDetailSheet } from "../components/DebtorDetailSheet";
import { CustomDebtFormSheet } from "../components/CustomDebtFormSheet";

interface Props {
  onOpenSale?: (saleId: string) => Promise<void> | void;
}

/**
 * The Debts segment of the Transactions hub: one row per customer who still
 * owes money, sorted by how far behind they are.
 *
 * Every figure comes from ONE query over `charges` joined to what has been
 * collected — no category merging and no net-vs-gross subtraction, so the
 * breakdown adds up to the total exactly.
 */
export function DebtsPanel({ onOpenSale }: Props = {}) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  const view = useLedgerSlice((s) => s.debts);
  const loading = useLedgerSlice((s) => s.loading);
  const error = useLedgerSlice((s) => s.error);
  const fetchDebts = useLedgerSlice((s) => s.fetchDebts);
  const clearError = useLedgerSlice((s) => s.clearError);

  const branchFilter = useEffectiveBranchFilter();
  const refresh = useCallback(
    () => void fetchDebts(branchFilter),
    [fetchDebts, branchFilter],
  );

  const collectSheet = useCollectSheet();
  const { voidItem, writeOffItem } = useDebtRowActions();
  const openBill = useOpenBill({ onOpenSale });
  useOwedChanged(refresh);

  const [debtorSearch, setDebtorSearch] = useState("");
  const debouncedDebtorSearch = useDebounce(debtorSearch);
  const [openDebtorId, setOpenDebtorId] = useState<string | null>(null);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [menuDebtor, setMenuDebtor] = useState<CustomerDebts | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const target = findCurrency(currencies, displayCurrencyId);
  const debtors = useMemo(() => view?.customers ?? [], [view]);

  const visibleDebtors = useMemo(() => {
    const q = debouncedDebtorSearch.trim().toLowerCase();
    if (!q) return debtors;
    return debtors.filter((d) => d.customerName.toLowerCase().includes(q));
  }, [debtors, debouncedDebtorSearch]);

  const openDebtor = useMemo(
    () => debtors.find((d) => d.customerId === openDebtorId) ?? null,
    [debtors, openDebtorId],
  );

  const totalLabel = formatMoney(view?.summary.totalUsd ?? 0, null, target);

  return (
    <View className="flex-1">
      <ResponsiveContainer className="flex-1">
        <View className="px-4 pt-3">
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

        {/* Search — by customer name. */}
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
        actions={[
          {
            key: "collect",
            label: t("payments.collect"),
            icon: "cash-outline",
            onPress: () => {
              if (!menuDebtor) return;
              const debtor = menuDebtor;
              setMenuDebtor(null);
              collectSheet.open(debtor.customerId, debtor.customerName, [
                ...debtor.items,
                ...debtor.unpaidMonths,
              ]);
            },
          },
        ]}
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
          onVoidItem={voidItem}
          onWriteOff={writeOffItem}
          onOpenItem={openBill.openOwed}
          openingItemKey={openBill.loadingId}
        />
      )}

      {customDebtOpen && (
        <CustomDebtFormSheet onDismiss={() => setCustomDebtOpen(false)} />
      )}

      {collectSheet.sheet}
      {openBill.sheet}
    </View>
  );
}
