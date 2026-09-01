import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Dropdown, type DropdownOption } from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { MonthSectionHeader } from "@/src/shared/components/MonthSectionHeader";
import { groupByMonth } from "@/src/shared/lib/monthSections";
import {
  SelectionBar,
  type SelectionAction,
} from "@/src/shared/components/SelectionBar";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { CustomerPicker } from "@/src/modules/customer/customers";
import { useSendInvoice } from "@/src/modules/invoicing";
import { getDateMonthsAgoString, getTodayDateString } from "@/src/core/utils/date";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import type { CollectionListItem } from "@/src/core/types";
import { useCollectionsListSlice } from "@/src/state/hooks/useCollectionsListSlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useAuth } from "@/src/modules/authentication/auth";
import { CollectionCard } from "../components/CollectionCard";
import { CollectionsVoidDialog } from "../components/CollectionsVoidDialog";
import { collectionService } from "../services/CollectionService";

/**
 * The money-in history: every hand-over of cash, newest first.
 *
 * ONE list where there used to be two (payments and debt payments) — a month, a
 * sale and a custom fee are all settled the same way now, so there is nothing
 * left to merge. A row that settled several bills expands to show the split.
 */
export function CollectionsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const items = useCollectionsListSlice((s) => s.items);
  const monthlyTotals = useCollectionsListSlice((s) => s.monthlyTotals);
  const loading = useCollectionsListSlice((s) => s.loading);
  const loadingMore = useCollectionsListSlice((s) => s.loadingMore);
  const error = useCollectionsListSlice((s) => s.error);
  const hasMore = useCollectionsListSlice((s) => s.hasMore);
  const fetchCollections = useCollectionsListSlice((s) => s.fetchCollections);
  const fetchMore = useCollectionsListSlice((s) => s.fetchMoreCollections);
  const customerFilter = useCollectionsListSlice((s) => s.customerFilter);
  const setCustomerFilter = useCollectionsListSlice((s) => s.setCustomerFilter);
  const receivedByUserId = useCollectionsListSlice((s) => s.receivedByUserId);
  const setReceivedByUserId = useCollectionsListSlice((s) => s.setReceivedByUserId);
  const receivedFrom = useCollectionsListSlice((s) => s.receivedFrom);
  const setReceivedFrom = useCollectionsListSlice((s) => s.setReceivedFrom);
  const receivedTo = useCollectionsListSlice((s) => s.receivedTo);
  const setReceivedTo = useCollectionsListSlice((s) => s.setReceivedTo);
  const clearFilters = useCollectionsListSlice((s) => s.clearFilters);
  const clearError = useCollectionsListSlice((s) => s.clearError);

  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const branchFilter = useEffectiveBranchFilter();
  const { canSend, sendCollectionInvoice } = useSendInvoice();

  const [voidIds, setVoidIds] = useState<string[] | null>(null);

  const selection = useSelection();
  const {
    active: selectionActive,
    selectedIds,
    toggle: toggleSelect,
    toggleMany: toggleManySelect,
    enterWith: enterSelection,
    clear: clearSelection,
  } = selection;
  useSelectionBackHandler(selectionActive, clearSelection);

  useEffect(() => {
    clearSelection();
    void fetchCollections();
  }, [branchFilter, clearSelection, fetchCollections]);

  // The received-by dropdown needs the user list (this screen loads nothing
  // else). `getUsers` self-guards on the slice's `loaded` flag.
  useEffect(() => {
    void getUsers();
  }, [getUsers]);

  const userOptions: DropdownOption<string>[] = useMemo(
    () => users.map((u) => ({ label: u.fullName, value: u.id })),
    [users],
  );

  const hasActiveFilters =
    !!customerFilter ||
    !!receivedByUserId ||
    receivedFrom !== getDateMonthsAgoString(1) ||
    receivedTo !== getTodayDateString();

  const selected = items.filter((c) => selectedIds.has(c.id));

  // Bucket the already-received_at-desc rows into month sections, each carrying
  // that month's true total (USD, at each row's own frozen rate).
  const sections = useMemo(
    () =>
      groupByMonth(
        items,
        (c) => c.receivedAt,
        t,
        // A voided hand-over stays visible but contributes nothing — the header
        // is money collected, and the totals query skips them server-side too.
        (c) => (c.voidedAt ? 0 : c.amount / c.ratePerUsdSnapshot),
        monthlyTotals,
      ),
    [items, t, monthlyTotals],
  );

  /**
   * One receipt per hand-over — there is no multi-row receipt here, because a
   * collection already IS the whole hand-over and its split is listed inside.
   * The list read is lean, so the full record (with its items) is fetched now.
   */
  async function sendOne(row: CollectionListItem) {
    if (!canSend(row.customerPhone)) return;
    const full = await collectionService.getById(row.id);
    if (!full) return;
    await sendCollectionInvoice({
      phone: row.customerPhone,
      customerName: row.customerName ?? "",
      collection: full,
    });
  }

  function buildSelectionActions(rows: CollectionListItem[]): SelectionAction[] {
    // Already-voided rows are visible in the list, so a mixed selection must
    // only void the live ones; an all-voided selection offers nothing.
    const live = rows.filter((c) => c.voidedAt === null);
    if (live.length === 0) return [];
    return [
      {
        key: "void",
        icon: "close-circle-outline",
        label: t("ledger.void_payment"),
        destructive: true,
        onPress: () => setVoidIds(live.map((c) => c.id)),
      },
    ];
  }

  return (
    <View className="flex-1 py-3">
      <ResponsiveContainer className="flex-1">
        {/* Filters hide while selecting; the selection toolbar takes over. */}
        {!selectionActive ? (
          <View className="px-4">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              className="-mx-4"
              contentContainerStyle={{
                paddingHorizontal: 16,
                gap: 8,
                alignItems: "center",
              }}
            >
              <CustomerPicker
                placeholder={t("sales.filter_by_customer")}
                value={customerFilter}
                onChange={setCustomerFilter}
                nullable
                nullLabel={t("sales.all_customers")}
                triggerStyle="chip"
              />
              <Dropdown<string>
                placeholder={t("payments.filter_by_user")}
                options={userOptions}
                value={receivedByUserId}
                onChange={(id) => setReceivedByUserId(id)}
                nullable
                nullLabel={t("payments.all_users")}
                triggerStyle="chip"
              />
              <DatePickerInput
                placeholder={t("payments.paid_from")}
                value={receivedFrom ?? ""}
                onChange={(v) => setReceivedFrom(v || null)}
                maxDate={receivedTo ?? undefined}
                triggerStyle="chip"
                clearable
              />
              <DatePickerInput
                placeholder={t("payments.paid_to")}
                value={receivedTo ?? ""}
                onChange={(v) => setReceivedTo(v || null)}
                minDate={receivedFrom ?? undefined}
                triggerStyle="chip"
                clearable
              />
              {hasActiveFilters ? (
                <PressableOpacity
                  onPress={clearFilters}
                  className="flex-row items-center gap-x-1 rounded-full px-3 py-1.5"
                >
                  <Ionicons name="close" size={14} color={COLORS.gray500} />
                  <Text className="text-sm font-medium text-gray-500">
                    {t("common.clear_filters")}
                  </Text>
                </PressableOpacity>
              ) : null}
            </ScrollView>
          </View>
        ) : (
          <SelectionBar
            count={selection.count}
            actions={buildSelectionActions(selected)}
            onClose={clearSelection}
            allSelected={items.length > 0 && selected.length === items.length}
            onToggleAll={() => toggleManySelect(items.map((c) => c.id))}
          />
        )}

        {error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}

        {loading && items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(c) => c.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 96, flexGrow: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={fetchCollections}
                tintColor={COLORS.primary}
              />
            }
            onEndReached={() => {
              if (hasMore && !loadingMore) void fetchMore();
            }}
            onEndReachedThreshold={0.3}
            renderSectionHeader={({ section }) => (
              <MonthSectionHeader
                title={section.title}
                count={section.data.length}
                first={section.key === sections[0]?.key}
                total={formatMoney(section.totalUsd ?? 0, null, displayCurrency)}
              />
            )}
            ListFooterComponent={
              loadingMore ? (
                <View className="py-4 items-center">
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <CollectionCard
                item={item}
                selectionMode={selectionActive}
                selected={selectedIds.has(item.id)}
                onToggleSelect={(c) => toggleSelect(c.id)}
                onEnterSelection={(c) => enterSelection(c.id)}
                onVoid={(c) => setVoidIds([c.id])}
                onSendInvoice={canSend(item.customerPhone) ? (c) => void sendOne(c) : undefined}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                message={t("payments.no_payments")}
                subMessage={t("payments.no_payments_hint")}
              />
            }
          />
        )}
      </ResponsiveContainer>

      {voidIds && user ? (
        <CollectionsVoidDialog
          collectionIds={voidIds}
          voidedBy={user.id}
          onVoided={() => {
            // The slice marks the rows voided and takes them out of the month
            // totals — there is nothing left to re-read.
            setVoidIds(null);
            clearSelection();
          }}
          onDismiss={() => setVoidIds(null)}
        />
      ) : null}
    </View>
  );
}
