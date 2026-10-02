import { useEffect, useMemo } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { CustomerPicker } from "@/src/modules/customer/customers";
import { COLORS } from "@/src/shared/constants";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import type { ChargeKind, DebtHistoryItem } from "@shared/core/types";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { useDebtHistoryStore } from "@shared/modules/transaction/debts/state/debtHistoryStore";
import { DEBT_KINDS } from "@shared/modules/transaction/debts/utils/allDebtsFilter";
import {
  DEFAULT_DEBT_HISTORY_FILTERS,
  HISTORY_OUTCOMES,
  HISTORY_PERIOD_PRESETS,
  HISTORY_SORTS,
  hasActiveHistoryFilters,
  type HistoryOutcome,
  type HistoryPeriodPreset,
  type HistorySort,
} from "@shared/modules/transaction/debts/utils/debtHistory";
import { DebtHistoryCard } from "./DebtHistoryCard";

interface Props {
  onDismiss: () => void;
  onOpenItem?: (item: DebtHistoryItem) => void;
  openingItemKey?: string | null;
}

// Pages from the server: past bills are not bounded by what is owed now.
export function DebtHistorySheet({
  onDismiss,
  onOpenItem,
  openingItemKey,
}: Props) {
  const { t } = useTranslation();
  const bodyReady = useAfterFirstFrame();

  const items = useDebtHistoryStore((s) => s.items);
  const loading = useDebtHistoryStore((s) => s.loading);
  const loaded = useDebtHistoryStore((s) => s.loaded);
  const loadingMore = useDebtHistoryStore((s) => s.loadingMore);
  const hasMore = useDebtHistoryStore((s) => s.hasMore);
  const error = useDebtHistoryStore((s) => s.error);
  const customer = useDebtHistoryStore((s) => s.customer);
  const customerId = useDebtHistoryStore((s) => s.customerId);
  const period = useDebtHistoryStore((s) => s.period);
  const outcome = useDebtHistoryStore((s) => s.outcome);
  const kind = useDebtHistoryStore((s) => s.kind);
  const sort = useDebtHistoryStore((s) => s.sort);
  const fetchHistory = useDebtHistoryStore((s) => s.fetchHistory);
  const fetchMore = useDebtHistoryStore((s) => s.fetchMoreHistory);
  const setCustomer = useDebtHistoryStore((s) => s.setCustomer);
  const setPeriod = useDebtHistoryStore((s) => s.setPeriod);
  const setOutcome = useDebtHistoryStore((s) => s.setOutcome);
  const setKind = useDebtHistoryStore((s) => s.setKind);
  const setSort = useDebtHistoryStore((s) => s.setSort);
  const clearFilters = useDebtHistoryStore((s) => s.clearFilters);
  const clearError = useDebtHistoryStore((s) => s.clearError);
  const reset = useDebtHistoryStore((s) => s.reset);

  useEffect(() => {
    void fetchHistory();
    return reset;
  }, [fetchHistory, reset]);
  useOwedChanged(fetchHistory);

  const periodOptions: DropdownOption<HistoryPeriodPreset>[] = useMemo(
    () =>
      HISTORY_PERIOD_PRESETS.map((preset) => ({
        label:
          preset === "all"
            ? t("debts.period_all")
            : t(`reports.period_${preset}`),
        value: preset,
      })),
    [t],
  );

  const outcomeOptions: DropdownOption<HistoryOutcome>[] = useMemo(
    () =>
      HISTORY_OUTCOMES.map((value) => ({
        label: t(`debts.outcome_${value}`),
        value,
      })),
    [t],
  );

  const kindOptions: DropdownOption<ChargeKind>[] = useMemo(
    () =>
      DEBT_KINDS.map((k) => ({ label: t(`ledger.kind_${k}`), value: k })),
    [t],
  );

  const sortOptions: DropdownOption<HistorySort>[] = useMemo(
    () =>
      HISTORY_SORTS.map((s) => ({ label: t(`debts.sort_${s}`), value: s })),
    [t],
  );

  const dirty = hasActiveHistoryFilters({
    customerId,
    period,
    outcome,
    kind,
    sort,
  });

  return (
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
              {t("debts.history_title")}
            </Text>
            <Text
              fontWeight="SemiBold"
              className="text-sm text-gray-500 mt-0.5"
              numberOfLines={1}
            >
              {t("debts.n_bills_debt", { count: items.length })}
            </Text>
          </View>
          <PressableOpacity onPress={onDismiss}>
            <Text fontWeight="Medium" className="text-base text-primary">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </SheetDragArea>

        {bodyReady ? (
          <>
            <View className="mt-3">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={{
                  paddingHorizontal: 24,
                  paddingVertical: 2,
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <Dropdown<HistoryPeriodPreset>
                  placeholder={t("debts.filter_by_period")}
                  options={periodOptions}
                  value={period}
                  onChange={(next) => void setPeriod(next ?? "all")}
                  triggerStyle="chip"
                />
                <CustomerPicker
                  placeholder={t("debts.filter_by_customer")}
                  value={customer}
                  onChange={(next) => void setCustomer(next)}
                  nullable
                  nullLabel={t("debts.all_customers")}
                  triggerStyle="chip"
                />
                <Dropdown<HistoryOutcome>
                  placeholder={t("debts.filter_by_outcome")}
                  options={outcomeOptions}
                  value={outcome}
                  onChange={(next) => void setOutcome(next)}
                  nullable
                  nullLabel={t("debts.all_outcomes")}
                  triggerStyle="chip"
                />
                <Dropdown<ChargeKind>
                  placeholder={t("ledger.filter_by_type")}
                  options={kindOptions}
                  value={kind}
                  onChange={(next) => void setKind(next)}
                  nullable
                  nullLabel={t("ledger.all_types")}
                  triggerStyle="chip"
                />
                <Dropdown<HistorySort>
                  placeholder={t("ledger.sort_by_label")}
                  options={sortOptions}
                  value={sort}
                  onChange={(next) =>
                    void setSort(next ?? DEFAULT_DEBT_HISTORY_FILTERS.sort)
                  }
                  triggerStyle="chip"
                />
                {dirty ? (
                  <PressableOpacity
                    onPress={() => void clearFilters()}
                    className="flex-row items-center gap-x-1 rounded-full px-3 py-1.5"
                  >
                    <Ionicons name="close" size={14} color={COLORS.gray500} />
                    <Text fontWeight="Medium" className="text-sm text-gray-500">
                      {t("common.clear_filters")}
                    </Text>
                  </PressableOpacity>
                ) : null}
              </ScrollView>
            </View>

            {error ? (
              <View className="px-6 pt-3">
                <ErrorBanner message={error} onDismiss={clearError} />
              </View>
            ) : null}

            <BottomSheetFlatList
              data={items}
              keyExtractor={keyOf}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 16,
                paddingBottom: 48,
                flexGrow: 1,
              }}
              onEndReached={() => {
                if (hasMore && !loadingMore && !loading) void fetchMore();
              }}
              onEndReachedThreshold={0.3}
              renderItem={({ item }) => (
                <DebtHistoryCard
                  item={item}
                  onOpen={onOpenItem}
                  loading={openingItemKey === keyOf(item)}
                />
              )}
              ListFooterComponent={
                loadingMore ? (
                  <View className="py-4 items-center">
                    <ActivityIndicator color={COLORS.primary} />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                loading || !loaded ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator color={COLORS.primary} />
                  </View>
                ) : (
                  <EmptyState
                    message={t("debts.history_empty")}
                    subMessage={t("debts.history_empty_hint")}
                  />
                )
              }
            />
          </>
        ) : null}
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
