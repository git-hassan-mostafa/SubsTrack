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
import { MONTHS } from "@/src/core/constants";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
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
import {
  getDateMonthsAgoString,
  getTodayDateString,
} from "@/src/core/utils/date";
import type { MonthEntry } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { usePaymentsListSlice } from "@/src/state/hooks/usePaymentsListSlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { getStore } from "@/src/state/globalStore";
import type { PaymentListItem, PaymentStatusFilter } from "../utils/types";
import { PaymentListCard } from "../components/PaymentListCard";
import { PaymentDetailSheet } from "../components/PaymentDetailSheet";
import { PaymentListVoidSheet } from "../components/PaymentListVoidSheet";

function toEntry(p: PaymentListItem): MonthEntry {
  const [year, month] = p.billingMonth.split("-").map(Number);
  return {
    year,
    month,
    label: MONTHS[month - 1],
    billingMonth: p.billingMonth,
    status: p.balance > 0 ? "partial" : "paid",
    payment: p,
    isGroupSecondary: false,
    balance: p.balance,
  };
}

export function PaymentsPanel() {
  const { t } = useTranslation();
  const items = usePaymentsListSlice((s) => s.items);
  const monthlyTotals = usePaymentsListSlice((s) => s.monthlyTotals);
  const loading = usePaymentsListSlice((s) => s.loading);
  const loadingMore = usePaymentsListSlice((s) => s.loadingMore);
  const loadingUpdate = usePaymentsListSlice((s) => s.loadingUpdate);
  const error = usePaymentsListSlice((s) => s.error);
  const hasMore = usePaymentsListSlice((s) => s.hasMore);
  const fetchPayments = usePaymentsListSlice((s) => s.fetchPayments);
  const fetchMorePayments = usePaymentsListSlice((s) => s.fetchMorePayments);
  const customerFilter = usePaymentsListSlice((s) => s.customerFilter);
  const setCustomerFilter = usePaymentsListSlice((s) => s.setCustomerFilter);
  const paidByUserId = usePaymentsListSlice((s) => s.paidByUserId);
  const setPaidByUserId = usePaymentsListSlice((s) => s.setPaidByUserId);
  const paidFrom = usePaymentsListSlice((s) => s.paidFrom);
  const setPaidFrom = usePaymentsListSlice((s) => s.setPaidFrom);
  const paidTo = usePaymentsListSlice((s) => s.paidTo);
  const setPaidTo = usePaymentsListSlice((s) => s.setPaidTo);
  const billingMonth = usePaymentsListSlice((s) => s.billingMonth);
  const setBillingMonth = usePaymentsListSlice((s) => s.setBillingMonth);
  const statusFilter = usePaymentsListSlice((s) => s.statusFilter);
  const setStatusFilter = usePaymentsListSlice((s) => s.setStatusFilter);
  const clearFilters = usePaymentsListSlice((s) => s.clearFilters);
  const updatePayment = usePaymentsListSlice((s) => s.updatePayment);
  const clearError = usePaymentsListSlice((s) => s.clearError);

  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const branchFilter = useEffectiveBranchFilter();

  const [activePayment, setActivePayment] = useState<PaymentListItem | null>(
    null,
  );
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
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  // Paid-by dropdown needs the user list (this tab doesn't load it otherwise).
  useEffect(() => {
    if (users.length === 0) void getUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userOptions: DropdownOption<string>[] = useMemo(
    () => users.map((u) => ({ label: u.fullName, value: u.id })),
    [users],
  );
  const statusOptions: DropdownOption<string>[] = useMemo(
    () => [
      { label: t("common.paid"), value: "paid" },
      { label: t("common.partial"), value: "partial" },
    ],
    [t],
  );

  const hasActiveFilters =
    !!customerFilter ||
    !!paidByUserId ||
    !!billingMonth ||
    statusFilter !== "all" ||
    paidFrom !== getDateMonthsAgoString(1) ||
    paidTo !== getTodayDateString();

  const selectedPayments = items.filter((p) => selectedIds.has(p.id));

  // Bucket the already-paid_at-desc payments into month sections (This Month / June 2026),
  // each carrying the section's total amount paid (USD, via each row's snapshot rate).
  const sections = useMemo(
    () =>
      groupByMonth(
        items,
        (p) => p.paidAt,
        t,
        (p) => p.amountPaid / p.ratePerUsdSnapshot,
        monthlyTotals,
      ),
    [items, t, monthlyTotals],
  );

  function buildSelectionActions(
    selected: PaymentListItem[],
  ): SelectionAction[] {
    if (selected.length === 0) return [];
    return [
      {
        key: "void",
        icon: "close-circle-outline",
        label: t("payments.void_payment"),
        destructive: true,
        onPress: () => setVoidIds(selected.map((p) => p.id)),
      },
    ];
  }

  async function handleEdit(next: { amountPaid: number }) {
    if (!activePayment) return;
    await updatePayment(activePayment.id, next.amountPaid);
    if (!getStore().getState().paymentsList.error) setActivePayment(null);
  }

  return (
    <View className="flex-1">
      <ResponsiveContainer className="flex-1">
        {/* Filters hide while selecting; the single selection toolbar takes over. */}
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
                value={paidByUserId}
                onChange={(id) => setPaidByUserId(id)}
                nullable
                nullLabel={t("payments.all_users")}
                triggerStyle="chip"
              />
              <DatePickerInput
                placeholder={t("payments.paid_from")}
                value={paidFrom ?? ""}
                onChange={(v) => setPaidFrom(v || null)}
                maxDate={paidTo ?? undefined}
                triggerStyle="chip"
                clearable
              />
              <DatePickerInput
                placeholder={t("payments.paid_to")}
                value={paidTo ?? ""}
                onChange={(v) => setPaidTo(v || null)}
                minDate={paidFrom ?? undefined}
                triggerStyle="chip"
                clearable
              />
              <DatePickerInput
                placeholder={t("payments.billing_month")}
                value={billingMonth ?? ""}
                onChange={(v) => setBillingMonth(v || null)}
                monthOnly
                triggerStyle="chip"
                clearable
              />
              <Dropdown<string>
                placeholder={t("payments.filter_by_status")}
                options={statusOptions}
                value={statusFilter === "all" ? null : statusFilter}
                onChange={(v) =>
                  setStatusFilter((v ?? "all") as PaymentStatusFilter)
                }
                nullable
                nullLabel={t("payments.all_statuses")}
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
          </View>
        ) : (
          <SelectionBar
            count={selection.count}
            actions={buildSelectionActions(selectedPayments)}
            onClose={clearSelection}
            allSelected={
              items.length > 0 && selectedPayments.length === items.length
            }
            onToggleAll={() => toggleManySelect(items.map((p) => p.id))}
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
            keyExtractor={(p) => p.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 96,
              flexGrow: 1,
            }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={fetchPayments}
                tintColor={COLORS.primary}
              />
            }
            onEndReached={() => {
              if (hasMore && !loadingMore) void fetchMorePayments();
            }}
            onEndReachedThreshold={0.3}
            renderSectionHeader={({ section }) => (
              <MonthSectionHeader
                title={section.title}
                count={section.data.length}
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
              <PaymentListCard
                payment={item}
                onPress={setActivePayment}
                selectionMode={selectionActive}
                selected={selectedIds.has(item.id)}
                onToggleSelect={(p) => toggleSelect(p.id)}
                onEnterSelection={(p) => enterSelection(p.id)}
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

      {activePayment ? (
        <PaymentDetailSheet
          entry={toEntry(activePayment)}
          customerName={activePayment.customerName}
          onVoid={() => setVoidIds([activePayment.id])}
          onEdit={handleEdit}
          editLoading={loadingUpdate}
          onDismiss={() => setActivePayment(null)}
        />
      ) : null}

      {voidIds ? (
        <PaymentListVoidSheet
          paymentIds={voidIds}
          onVoided={() => {
            setVoidIds(null);
            setActivePayment(null);
            clearSelection();
          }}
          onDismiss={() => setVoidIds(null)}
        />
      ) : null}
    </View>
  );
}
