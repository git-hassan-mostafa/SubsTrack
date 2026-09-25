import { useMemo, useState } from "react";
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
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { COLORS } from "@/src/shared/constants";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import type { ChargeKind, DebtsView, OpenItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { keyOf } from "@/src/modules/ledger/utils/waterfall";
import {
  DEFAULT_ALL_DEBTS_FILTERS,
  filterAndSortDebts,
  hasActiveAllDebtsFilters,
  selectAllDebts,
  totalUsdOf,
  type AllDebtsFilters,
  type AllDebtsSort,
  type AllDebtsStatus,
} from "../utils/allDebtsFilter";
import { useAllWrittenOffDebts } from "../hooks/useAllWrittenOffDebts";
import type { DebtScope } from "../hooks/useWrittenOffDebts";
import { DebtItemCard } from "./DebtItemCard";

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

/**
 * Every open bill of every customer in ONE list — the debtor list turned inside
 * out, so a collector can chase the oldest BILL in the branch rather than the
 * oldest customer.
 *
 * It reads the `DebtsView` the screen already holds and never queries, so the
 * figures here and the total behind it are the same numbers and cannot
 * disagree.
 */
export function AllDebtsSheet({
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
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const target = findCurrency(currencies, displayCurrencyId);
  const branchFilter = useEffectiveBranchFilter();
  const bodyReady = useAfterFirstFrame();

  const [filters, setFilters] = useState<AllDebtsFilters>(
    DEFAULT_ALL_DEBTS_FILTERS,
  );
  const [scope, setScope] = useState<DebtScope>("live");
  const debouncedSearch = useDebounce(filters.search);

  const showingWrittenOff = scope === "written_off";
  const writtenOff = useAllWrittenOffDebts(branchFilter);

  const scopeOptions: DropdownOption<DebtScope>[] = useMemo(
    () => [
      { label: t("debts.scope_live"), value: "live" },
      { label: t("debts.scope_written_off"), value: "written_off" },
    ],
    [t],
  );

  const kindOptions: DropdownOption<ChargeKind>[] = useMemo(
    () =>
      (["month", "sale", "manual"] as ChargeKind[]).map((k) => ({
        label: t(`ledger.kind_${k}`),
        value: k,
      })),
    [t],
  );

  const statusOptions: DropdownOption<AllDebtsStatus>[] = useMemo(
    () => [
      { label: t("debts.status_late"), value: "late" },
      { label: t("debts.status_not_late"), value: "not_late" },
      { label: t("debts.status_partial"), value: "partial" },
    ],
    [t],
  );

  const sortOptions: DropdownOption<AllDebtsSort>[] = useMemo(
    () => [
      { label: t("debts.sort_created"), value: "created" },
      { label: t("debts.sort_updated"), value: "updated" },
      { label: t("debts.sort_oldest"), value: "oldest" },
      { label: t("debts.sort_newest"), value: "newest" },
      { label: t("debts.sort_largest"), value: "largest" },
      { label: t("debts.sort_smallest"), value: "smallest" },
    ],
    [t],
  );

  // A written-off bill is not being chased, so "late" and "partly paid" are
  // not questions anyone asks of it — that filter is dropped with the scope.
  const active = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
      status: showingWrittenOff ? null : filters.status,
    }),
    [filters, debouncedSearch, showingWrittenOff],
  );

  const rows = useMemo(
    () =>
      showingWrittenOff
        ? filterAndSortDebts(writtenOff.items, active)
        : selectAllDebts(view, active),
    [showingWrittenOff, writtenOff.items, view, active],
  );

  const shownTotal = formatMoney(totalUsdOf(rows), null, target);
  const dirty = hasActiveAllDebtsFilters(active) || showingWrittenOff;

  function patch(next: Partial<AllDebtsFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  function clearAll() {
    setFilters(DEFAULT_ALL_DEBTS_FILTERS);
    setScope("live");
  }

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
        </SheetDragArea>

        {bodyReady ? (
          <>
            <View className="px-6 pt-3">
              <SearchTextBox
                searchText={filters.search}
                setSearchText={(value) => patch({ search: value })}
                placeholder={t("debts.all_debts_search_hint")}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              className="mt-2 grow-0"
              contentContainerStyle={{
                paddingHorizontal: 24,
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
                value={filters.kind}
                onChange={(kind) => patch({ kind })}
                nullable
                nullLabel={t("ledger.all_types")}
                triggerStyle="chip"
              />
              {!showingWrittenOff ? (
                <Dropdown<AllDebtsStatus>
                  placeholder={t("ledger.filter_by_status")}
                  options={statusOptions}
                  value={filters.status}
                  onChange={(status) => patch({ status })}
                  nullable
                  nullLabel={t("ledger.all_statuses")}
                  triggerStyle="chip"
                />
              ) : null}
              <Dropdown<AllDebtsSort>
                placeholder={t("ledger.sort_by_label")}
                options={sortOptions}
                value={filters.sort}
                onChange={(sort) =>
                  patch({ sort: sort ?? DEFAULT_ALL_DEBTS_FILTERS.sort })
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

            <BottomSheetFlatList
              data={rows}
              keyExtractor={keyOf}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 16,
                paddingBottom: 48,
                flexGrow: 1,
              }}
              renderItem={({ item }) => (
                <DebtItemCard
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
