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
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { PeriodPicker } from "@/src/shared/components/PeriodPicker";
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
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import type {
  CollectionItem,
  CollectionListItem,
  WalletSource,
} from "@/src/core/types";
import type {
  CollectionSortField,
  SortDirection,
} from "../repository/ICollectionRepository";
import type { CollectionStatus } from "@/src/modules/ledger/state/collectionsListStore";
import { useCollectionsListStore } from "@/src/modules/ledger/state/collectionsListStore";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useAuth } from "@/src/modules/authentication/auth";
import { CollectionCard } from "../components/CollectionCard";
import { CollectionSplitSheet } from "../components/CollectionSplitSheet";
import { CollectionsVoidDialog } from "../components/CollectionsVoidDialog";
import { useOpenBill } from "../hooks/useOpenBill";
import { collectionService } from "../services/CollectionService";

interface Props {
  onOpenSale?: (saleId: string) => Promise<void> | void;
}

/**
 * The money-in history: every hand-over of cash, newest first.
 *
 * ONE list where there used to be two (payments and debt payments) — a month, a
 * sale and a custom fee are all settled the same way now, so there is nothing
 * left to merge. Tapping a row opens what it settled: the bill itself, or the
 * split sheet when one hand-over closed several.
 */
export function CollectionsPanel({ onOpenSale }: Props = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const items = useCollectionsListStore((s) => s.items);
  const monthlyTotals = useCollectionsListStore((s) => s.monthlyTotals);
  const loading = useCollectionsListStore((s) => s.loading);
  const loadingMore = useCollectionsListStore((s) => s.loadingMore);
  const error = useCollectionsListStore((s) => s.error);
  const hasMore = useCollectionsListStore((s) => s.hasMore);
  const fetchCollections = useCollectionsListStore((s) => s.fetchCollections);
  const fetchMore = useCollectionsListStore((s) => s.fetchMoreCollections);
  const customerFilter = useCollectionsListStore((s) => s.customerFilter);
  const setCustomerFilter = useCollectionsListStore((s) => s.setCustomerFilter);
  const receivedByUserId = useCollectionsListStore((s) => s.receivedByUserId);
  const setReceivedByUserId = useCollectionsListStore(
    (s) => s.setReceivedByUserId,
  );
  const period = useCollectionsListStore((s) => s.period);
  const setPeriod = useCollectionsListStore((s) => s.setPeriod);
  const kind = useCollectionsListStore((s) => s.kind);
  const setKind = useCollectionsListStore((s) => s.setKind);
  const status = useCollectionsListStore((s) => s.status);
  const setStatus = useCollectionsListStore((s) => s.setStatus);
  const sortField = useCollectionsListStore((s) => s.sortField);
  const setSortField = useCollectionsListStore((s) => s.setSortField);
  const sortDirection = useCollectionsListStore((s) => s.sortDirection);
  const setSortDirection = useCollectionsListStore((s) => s.setSortDirection);
  const clearFilters = useCollectionsListStore((s) => s.clearFilters);
  const clearError = useCollectionsListStore((s) => s.clearError);
  const applyVoided = useCollectionsListStore((s) => s.applyVoided);
  const refreshNetByCustomer = useLedgerSlice((s) => s.fetchNetByCustomer);

  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const branchFilter = useEffectiveBranchFilter();
  const { canSend, sendCollectionInvoice } = useSendInvoice();

  const [voidIds, setVoidIds] = useState<string[] | null>(null);
  const [split, setSplit] = useState<CollectionListItem | null>(null);
  const openBill = useOpenBill({
    onOpenSale,
    onChanged: (voided) => {
      applyVoided(voided);
      void refreshNetByCustomer(branchFilter);
    },
  });

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

  useEffect(() => {
    void getUsers();
  }, [getUsers]);

  const userOptions: DropdownOption<string>[] = useMemo(
    () => users.map((u) => ({ label: u.fullName, value: u.id })),
    [users],
  );

  const kindOptions: DropdownOption<WalletSource>[] = useMemo(
    () =>
      (["month", "sale", "manual", "mixed"] as WalletSource[]).map((k) => ({
        label: t(`ledger.kind_${k}`),
        value: k,
      })),
    [t],
  );

  const statusOptions: DropdownOption<CollectionStatus>[] = useMemo(
    () => [
      { label: t("ledger.status_live"), value: "live" },
      { label: t("ledger.status_voided"), value: "voided" },
    ],
    [t],
  );

  const sortFieldOptions: DropdownOption<CollectionSortField>[] = useMemo(
    () => [
      { label: t("ledger.sort_by_received"), value: "received_at" },
      { label: t("ledger.sort_by_recorded"), value: "created_at" },
      { label: t("ledger.sort_by_updated"), value: "updated_at" },
    ],
    [t],
  );

  const sortOptions: DropdownOption<SortDirection>[] = useMemo(
    () => [
      { label: t("ledger.sort_newest"), value: "desc" },
      { label: t("ledger.sort_oldest"), value: "asc" },
    ],
    [t],
  );

  const hasActiveFilters =
    !!customerFilter ||
    !!receivedByUserId ||
    !!kind ||
    !!status ||
    sortField !== "received_at" ||
    sortDirection !== "desc" ||
    period.preset !== "this_month";

  const selected = items.filter((c) => selectedIds.has(c.id));

  const periodTotalUsd = useMemo(
    () => Object.values(monthlyTotals).reduce((sum, v) => sum + v, 0),
    [monthlyTotals],
  );

  const sections = useMemo(
    () =>
      groupByMonth(
        items,
        (c) => c.receivedAt,
        t,
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

  /** One bill behind a hand-over. Its label was frozen by the list read. */
  function openItem(
    item: CollectionItem,
    label: string,
    customerName?: string | null,
  ) {
    if (!item.charge) return;
    void openBill.open(item.charge, label, customerName);
  }

  function openCollection(row: CollectionListItem) {
    if (row.itemCount > 1 || row.voidedAt !== null) {
      setSplit(row);
      return;
    }
    const first = row.items[0];
    if (first) openItem(first, row.itemLabels[0] ?? "", row.customerName);
  }

  function buildSelectionActions(
    rows: CollectionListItem[],
  ): SelectionAction[] {
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
          <View>
            <PeriodPicker value={period} onChange={setPeriod} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              className="mt-2"
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
              <Dropdown<WalletSource>
                placeholder={t("ledger.filter_by_type")}
                options={kindOptions}
                value={kind}
                onChange={(k) => setKind(k)}
                nullable
                nullLabel={t("ledger.all_types")}
                triggerStyle="chip"
              />
              <Dropdown<CollectionStatus>
                placeholder={t("ledger.filter_by_status")}
                options={statusOptions}
                value={status}
                onChange={(s) => setStatus(s)}
                nullable
                nullLabel={t("ledger.all_statuses")}
                triggerStyle="chip"
              />
              <Dropdown<CollectionSortField>
                placeholder={t("ledger.sort_by_label")}
                options={sortFieldOptions}
                value={sortField}
                onChange={(f) => setSortField(f ?? "received_at")}
                triggerStyle="chip"
              />
              <Dropdown<SortDirection>
                placeholder={t("ledger.sort_label")}
                options={sortOptions}
                value={sortDirection}
                onChange={(d) => setSortDirection(d ?? "desc")}
                triggerStyle="chip"
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

            <View className="mt-3 flex-row items-baseline justify-between border-t border-gray-100 px-4 pt-3">
              <Text className="text-xs uppercase tracking-wide text-gray-500">
                {t("ledger.total_in_period")}
              </Text>
              <Text fontWeight="SemiBold" className="text-sm text-emerald-700">
                {formatMoney(periodTotalUsd, null, displayCurrency)}
              </Text>
            </View>
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
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 96,
              flexGrow: 1,
            }}
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
                total={formatMoney(
                  section.totalUsd ?? 0,
                  null,
                  displayCurrency,
                )}
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
                onSendInvoice={
                  canSend(item.customerPhone)
                    ? (c) => void sendOne(c)
                    : undefined
                }
                onOpen={openCollection}
                loading={
                  item.itemCount === 1 &&
                  openBill.loadingId === item.items[0]?.chargeId
                }
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
            setVoidIds(null);
            clearSelection();
          }}
          onDismiss={() => setVoidIds(null)}
        />
      ) : null}

      <CollectionSplitSheet
        collection={split}
        onDismiss={() => setSplit(null)}
        onOpenItem={(item) => {
          const i = split?.items.indexOf(item) ?? -1;
          openItem(item, split?.itemLabels[i] ?? "", split?.customerName);
        }}
        loadingItemId={
          split?.items.find((i) => i.chargeId === openBill.loadingId)?.id ??
          null
        }
      />

      {openBill.sheet}
    </View>
  );
}
