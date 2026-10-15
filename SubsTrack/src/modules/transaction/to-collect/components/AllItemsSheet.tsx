import { useMemo } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { SheetFlatList } from "@/src/shared/components/SheetScrollComponents";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { COLORS } from "@/src/shared/constants";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import type { ChargeKind, DebtsView, OpenItem } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";
import {
  ALL_ITEMS_SORTS,
  ALL_ITEMS_STATUSES,
  OWED_KINDS,
  DEFAULT_ALL_ITEMS_FILTERS,
  type AllItemsSort,
  type AllItemsStatus,
} from "@shared/modules/transaction/to-collect/utils/allItemsFilter";
import { useAllItemsList } from "@shared/modules/transaction/to-collect/hooks/useAllItemsList";
import type { DebtScope } from "@shared/modules/transaction/debts/hooks/useWrittenOffDebts";
import { OwedItemCard } from "./OwedItemCard";
import { KEYBOARD_SAFE_LIST } from "@/src/shared/lib/keyboardSafeList";

interface Props {
  view: DebtsView | null;
  onDismiss: () => void;
  onCollectItem?: (item: OpenItem) => void;
  onEditItem?: (item: OpenItem) => void;
  onVoidItem?: (item: OpenItem) => void;
  onWriteOff?: (item: OpenItem) => void;
  onRevertWriteOff?: (item: OpenItem) => void;
  onOpenItem?: (item: OpenItem) => void;
  openingItemKey?: string | null;
}

// Reads the DebtsView the screen holds, never queries, so its totals agree.
export function AllItemsSheet({
  view,
  onDismiss,
  onCollectItem,
  onEditItem,
  onVoidItem,
  onWriteOff,
  onRevertWriteOff,
  onOpenItem,
  openingItemKey,
}: Props) {
  const { t } = useTranslation();
  const target = useDisplayCurrency();
  const branchFilter = useEffectiveBranchFilter();
  const bodyReady = useAfterFirstFrame();

  const {
    filters,
    patch,
    scope,
    setScope,
    showingWrittenOff,
    writtenOff,
    rows,
    totalUsd,
    dirty,
    clearAll,
  } = useAllItemsList(view, branchFilter, { debounceSearch: true });

  const scopeOptions: DropdownOption<DebtScope>[] = useMemo(
    () => [
      { label: t("debts.scope_live"), value: "live" },
      { label: t("debts.scope_written_off"), value: "written_off" },
    ],
    [t],
  );

  const kindOptions: DropdownOption<ChargeKind>[] = useMemo(
    () =>
      OWED_KINDS.map((k) => ({ label: t(`ledger.kind_${k}`), value: k })),
    [t],
  );

  const statusOptions: DropdownOption<AllItemsStatus>[] = useMemo(
    () =>
      ALL_ITEMS_STATUSES.map((s) => ({ label: t(`debts.status_${s}`), value: s })),
    [t],
  );

  const sortOptions: DropdownOption<AllItemsSort>[] = useMemo(
    () =>
      ALL_ITEMS_SORTS.map((s) => ({ label: t(`debts.sort_${s}`), value: s })),
    [t],
  );

  const shownTotal = formatMoney(totalUsd, null, target);

  return (
    <AppBottomSheet
      visible
      onDismiss={onDismiss}
      variant="full"
      dismissOnBackdropPress={false}
    >
      <ResponsiveContainer className="flex-1">
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <View className="flex-1 pe-2">
            <Text
              fontWeight="Bold"
              className="text-lg text-gray-900"
              numberOfLines={1}
            >
              {showingWrittenOff
                ? t("debts.scope_written_off")
                : t("debts.all_debts_title")}
            </Text>
            <Text
              fontWeight="SemiBold"
              className="text-sm text-gray-500 mt-0.5"
              numberOfLines={1}
            >
              {shownTotal} · {t("debts.n_bills", { count: rows.length })}
            </Text>
          </View>
          <PressableOpacity onPress={onDismiss}>
            <Text fontWeight="Medium" className="text-base text-primary">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </View>

        {bodyReady ? (
          <>
            <View className="px-6 pt-3">
              <SearchTextBox
                searchText={filters.search}
                setSearchText={(value) => patch({ search: value })}
                placeholder={t("debts.all_debts_search_hint")}
              />
            </View>

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
                <Dropdown<DebtScope>
                  placeholder={t("debts.filter_by_scope")}
                  options={scopeOptions}
                  value={scope}
                  onChange={(next) => setScope(next ?? "live")}
                  triggerStyle="chip"
                />
                <Dropdown<ChargeKind>
                  placeholder={t("ledger.filter_by_type")}
                  options={kindOptions}
                  value={filters.kind[0] ?? null}
                  onChange={(kind) => patch({ kind: kind ? [kind] : [] })}
                  nullable
                  nullLabel={t("ledger.all_types")}
                  triggerStyle="chip"
                />
                {!showingWrittenOff ? (
                  <Dropdown<AllItemsStatus>
                    placeholder={t("ledger.filter_by_status")}
                    options={statusOptions}
                    value={filters.status[0] ?? null}
                    onChange={(status) => patch({ status: status ? [status] : [] })}
                    nullable
                    nullLabel={t("ledger.all_statuses")}
                    triggerStyle="chip"
                  />
                ) : null}
                <Dropdown<AllItemsSort>
                  placeholder={t("ledger.sort_by_label")}
                  options={sortOptions}
                  value={filters.sort}
                  onChange={(sort) =>
                    patch({ sort: sort ?? DEFAULT_ALL_ITEMS_FILTERS.sort })
                  }
                  triggerStyle="chip"
                />
                {dirty ? (
                  <PressableOpacity
                    onPress={clearAll}
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

            {showingWrittenOff && writtenOff.error ? (
              <View className="px-6 pt-3">
                <ErrorBanner
                  message={writtenOff.error}
                  onDismiss={writtenOff.clearError}
                />
              </View>
            ) : null}

            <SheetFlatList
              {...KEYBOARD_SAFE_LIST}
              data={rows}
              keyExtractor={keyOf}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 16,
                paddingBottom: 48,
                flexGrow: 1,
              }}
              renderItem={({ item }) => (
                <OwedItemCard
                  item={item}
                  onCollect={showingWrittenOff ? undefined : onCollectItem}
                  onEdit={showingWrittenOff ? undefined : onEditItem}
                  onVoid={showingWrittenOff ? undefined : onVoidItem}
                  onWriteOff={showingWrittenOff ? undefined : onWriteOff}
                  onRevertWriteOff={
                    showingWrittenOff ? onRevertWriteOff : undefined
                  }
                  onOpen={onOpenItem}
                  loading={openingItemKey === keyOf(item)}
                />
              )}
              ListEmptyComponent={
                showingWrittenOff && writtenOff.loading ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator color={COLORS.primary} />
                  </View>
                ) : (
                  <EmptyState
                    message={
                      showingWrittenOff
                        ? t("debts.no_written_off_any")
                        : t("debts.no_debts")
                    }
                    subMessage={
                      showingWrittenOff ? undefined : t("debts.no_debts_hint")
                    }
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
