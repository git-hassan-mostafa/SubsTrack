import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { confirm } from "@/src/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import type { Customer, MonthEntry } from "@/src/core/types";
import { getCurrentYearMonth, getDateLocale } from "@/src/core/utils/date";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
  toUsd,
} from "@/src/core/utils/currency";
import { COLORS } from "@/src/shared/constants";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import {
  useGraceDays,
  useSubscriptionSlice,
} from "@/src/state/hooks/useSubscriptionSlice";
import { useAuth } from "@/src/modules/auth";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";
import { MonthGrid } from "./MonthGrid";
import { PaymentDetailSheet } from "./PaymentDetailSheet";
import { PaymentFormSheet } from "./PaymentFormSheet";
import { VoidSheet } from "./VoidSheet";
import { GridSelectionToolbar } from "./GridSelectionToolbar";
import {
  BulkPaymentFormSheet,
  type BulkPaymentValues,
} from "./BulkPaymentFormSheet";
import { BulkVoidSheet } from "./BulkVoidSheet";
import { expandSelectionUnit, groupPayableBlocks } from "../utils/monthSelection";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { SelectionAction } from "@/src/shared/components/PageHeader";
import { UpgradePromptModal } from "@/src/modules/subscription";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { getStore } from "@/src/state/globalStore";

interface CustomerPaymentPanelProps {
  customer: Customer;
}

export function CustomerPaymentPanel({ customer }: CustomerPaymentPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const router = useRouter();
  const { quickPay } = useLocalSearchParams<{ quickPay?: string }>();
  const { user } = useAuth();
  const paymentStore = usePaymentSlice();
  const currencies = useCurrencySlice((s) => s.items);
  const currentTier = useSubscriptionSlice((s) => s.currentTier);
  const { displayCurrencyId } = useUiPrefStore();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const graceDays = useGraceDays();

  const [year, setYear] = useState(getCurrentYearMonth().year);
  const [selectedEntry, setSelectedEntry] = useState<MonthEntry | null>(null);
  const [menuEntry, setMenuEntry] = useState<MonthEntry | null>(null);
  const [quickPayMonth, setQuickPayMonth] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [voidVisible, setVoidVisible] = useState(false);
  const quickPayHandledRef = useRef(false);

  // Month-grid multi-select (ephemeral UI state).
  const selection = useSelection();
  useSelectionBackHandler(selection.active, selection.clear);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPayVisible, setBulkPayVisible] = useState(false);
  const [bulkVoidIds, setBulkVoidIds] = useState<string[] | null>(null);

  // Loads every year's payments once per customer; switching years rebuilds the
  // grid from the store instead of re-fetching.
  useEffect(() => {
    paymentStore.getPayments(customer.id, year, customer, graceDays);
  }, [customer.id, year, customer.startDate]);

  // Selected billing months belong to the viewed year only — drop the
  // selection when the year changes.
  useEffect(() => {
    selection.clear();
  }, [year]);

  useEffect(() => {
    return () => paymentStore.reset();
  }, []);

  // Handle ?quickPay=1 handshake from the customer list: auto-open the payment
  // form for the current month once the grid is ready. Fires at most once.
  useEffect(() => {
    if (quickPay !== "1" || quickPayHandledRef.current) return;
    if (paymentStore.loading || paymentStore.monthGrid.length === 0) return;
    const { year: cy, month: cm } = getCurrentYearMonth();
    const currentEntry = paymentStore.monthGrid.find(
      (m) => m.year === cy && m.month === cm,
    );
    if (!currentEntry) return;
    quickPayHandledRef.current = true;
    setSelectedEntry(currentEntry);
    setFormVisible(true);
    router.setParams({ quickPay: undefined });
  }, [quickPay, paymentStore.loading, paymentStore.monthGrid, router]);

  function handleCellPress(entry: MonthEntry) {
    if (entry.status === "before_start") {
      void confirm({
        title: t("common.not_available"),
        message: t("payments.before_start_date"),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
      return;
    }

    const { year: cy, month: cm } = getCurrentYearMonth();
    const isFutureMonth =
      entry.year > cy || (entry.year === cy && entry.month > cm);
    if (!customer.active && isFutureMonth) {
      void confirm({
        title: t("common.not_available"),
        message: t("payments.inactive_future_blocked"),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
      return;
    }

    setSelectedEntry(entry);

    if (
      (entry.status === "paid" || entry.status === "partial") &&
      entry.payment
    ) {
      // Both primary and secondary grouped months open the same detail sheet.
      setDetailVisible(true);
    } else {
      setFormVisible(true);
    }
  }

  function handleVoidPress() {
    setVoidVisible(true);
  }

  // Quick Pay is available on unpaid + future (prepay) months with a fixed-price
  // plan — custom-price or planless months fall back to the form (handled in
  // handleQuickPay).
  function canQuickPay(entry: MonthEntry): boolean {
    return (
      customer.active &&
      (entry.status === "unpaid" || entry.status === "future") &&
      customer.plan != null &&
      !customer.plan.isCustomPrice &&
      customer.plan.price !== null
    );
  }

  // A non-voided payment exists on this month (primary or grouped secondary cell).
  function hasActivePayment(entry: MonthEntry): boolean {
    return (
      (entry.status === "paid" || entry.status === "partial") &&
      entry.payment != null &&
      entry.payment.voidedAt === null
    );
  }

  // Records a full payment for the tapped month without opening the form, mirroring
  // the customer-list Quick Pay: single-month plans pay instantly, multi-month plans
  // confirm first, and custom-price / planless plans defer to the manual form.
  async function handleQuickPay(entry: MonthEntry) {
    const plan = customer.plan;
    if (!plan || plan.isCustomPrice || plan.price === null || !user) {
      setSelectedEntry(entry);
      setFormVisible(true);
      return;
    }
    const planCurrency = findCurrency(currencies, plan.currencyId);

    if (plan.durationMonths > 1) {
      if (!currentTier) return;
      const ok = await confirm({
        title: t("payments.quick_pay.confirm_multi_month_title"),
        message: t("payments.quick_pay.confirm_multi_month_message", {
          amount: formatMoney(plan.price, planCurrency, planCurrency),
          months: getBlockRangeLabel(entry.billingMonth, plan.durationMonths, t),
        }),
        confirmLabel: t("payments.quick_pay.confirm"),
      });
      if (!ok) return;
      setQuickPayMonth(entry.billingMonth);
      try {
        await paymentStore.createMultiMonthPayment(
          entry.billingMonth,
          customer,
          plan,
          planCurrency,
          plan.price,
          user.id,
          null,
          user.tenantId,
          false,
          year,
          graceDays,
          currentTier,
        );
      } finally {
        setQuickPayMonth(null);
      }
      return;
    }

    setQuickPayMonth(entry.billingMonth);
    try {
      await paymentStore.createPayment(
        {
          billingMonth: entry.billingMonth,
          amountDue: plan.price,
          amountPaid: plan.price,
          durationMonths: 1,
          currencyId: plan.currencyId,
          customerId: customer.id,
          planId: plan.id,
          receivedByUserId: user.id,
          tenantId: user.tenantId,
          notes: null,
        },
        planCurrency,
        customer,
        graceDays,
      );
    } finally {
      setQuickPayMonth(null);
    }
  }

  function buildMonthMenuActions(entry: MonthEntry | null): ActionMenuItem[] {
    if (!entry) return [];
    const items: ActionMenuItem[] = [
      {
        key: "open",
        label: t("common.open"),
        icon: "open-outline",
        onPress: () => handleCellPress(entry),
      },
    ];
    if (canQuickPay(entry)) {
      items.push({
        key: "quick-pay",
        label: t("payments.quick_pay.pay_now"),
        icon: "flash-outline",
        onPress: () => void handleQuickPay(entry),
      });
    }
    if (hasActivePayment(entry)) {
      items.push({
        key: "void",
        label: t("payments.void_payment"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => {
          setSelectedEntry(entry);
          setVoidVisible(true);
        },
      });
    }
    return items;
  }

  async function handleEditAmount(next: {
    amountDue: number;
    amountPaid: number;
    currencyId: string | null;
  }) {
    if (!selectedEntry?.payment) return;
    await paymentStore.updatePayment(
      selectedEntry.payment.id,
      next.amountDue,
      next.amountPaid,
      findCurrency(currencies, next.currencyId),
      customer,
      year,
      graceDays,
    );
    if (!getStore().getState().payments.error) setDetailVisible(false);
  }

  // --- Multi-select (bulk) ---------------------------------------------------

  const selectedEntries = paymentStore.monthGrid.filter((m) =>
    selection.selectedIds.has(m.billingMonth),
  );
  // Payable: unpaid (any time) or future on an active customer (prepay). An
  // inactive customer's future months stay blocked, matching the per-cell flow.
  const payableEntries = selectedEntries.filter(
    (e) => e.status === "unpaid" || (e.status === "future" && customer.active),
  );
  // Voidable: backed by a live payment (includes grouped secondary cells).
  const voidableEntries = selectedEntries.filter(
    (e) =>
      (e.status === "paid" || e.status === "partial") &&
      e.payment != null &&
      e.payment.voidedAt === null,
  );

  function handleCellToggle(entry: MonthEntry) {
    const unit = expandSelectionUnit(entry, paymentStore.monthGrid, customer);
    if (unit.length > 0) selection.toggleMany(unit);
  }

  function handleCellLongPress(entry: MonthEntry) {
    const unit = expandSelectionUnit(entry, paymentStore.monthGrid, customer);
    if (unit.length > 0) selection.enterWith(unit);
  }

  // True after a bulk action if the slice recorded an error/tier-limit. The
  // panel's ErrorBanner (and UpgradePromptModal) surface those automatically, so
  // we only need to know whether to keep the selection for a retry.
  function bulkSucceeded(): boolean {
    const ps = getStore().getState().payments;
    return !ps.error && !ps.tierLimitError;
  }

  function runBulkPay() {
    if (bulkBusy || payableEntries.length === 0) return;
    const plan = customer.plan;
    if (!plan || plan.isCustomPrice) {
      setBulkPayVisible(true);
    } else if (plan.durationMonths > 1) {
      void runBulkMultiMonthPay();
    } else {
      void runBulkFixedPay();
    }
  }

  // Fixed single-month plan: full plan price for each selected payable month,
  // recorded in one batch write.
  async function runBulkFixedPay() {
    const plan = customer.plan;
    if (!user || !plan || plan.price === null) return;
    const ok = await confirm({
      title: t("payments.quick_pay.pay_now"),
      message: t("payments.bulk_pay_message", { count: payableEntries.length }),
      confirmLabel: t("payments.quick_pay.pay_now"),
    });
    if (!ok) return;
    const planCurrency = findCurrency(currencies, plan.currencyId);
    const inputs = payableEntries.map((e) => ({
      billingMonth: e.billingMonth,
      amountDue: plan.price!,
      amountPaid: plan.price!,
      durationMonths: 1,
      currencyId: plan.currencyId,
      customerId: customer.id,
      planId: plan.id,
      receivedByUserId: user.id,
      tenantId: user.tenantId,
      notes: null,
    }));
    paymentStore.clearError();
    setBulkBusy(true);
    try {
      await paymentStore.createPayments(inputs, planCurrency, customer, year, graceDays);
    } finally {
      setBulkBusy(false);
    }
    if (bulkSucceeded()) selection.clear();
  }

  // Multi-month plan: one full-price block payment per distinct selected block,
  // all in one batch write.
  async function runBulkMultiMonthPay() {
    const plan = customer.plan;
    if (!user || !plan || plan.price === null || !currentTier) return;
    const blocks = groupPayableBlocks(payableEntries, customer);
    const ok = await confirm({
      title: t("payments.quick_pay.pay_now"),
      message: t("payments.bulk_pay_blocks_message", { count: blocks.length }),
      confirmLabel: t("payments.quick_pay.pay_now"),
    });
    if (!ok) return;
    const planCurrency = findCurrency(currencies, plan.currencyId);
    paymentStore.clearError();
    paymentStore.clearTierLimitError();
    setBulkBusy(true);
    try {
      await paymentStore.createMultiMonthPayments(
        blocks.map((b) => b.startBillingMonth),
        customer,
        plan,
        planCurrency,
        plan.price,
        user.id,
        null,
        user.tenantId,
        year,
        graceDays,
        currentTier,
      );
    } finally {
      setBulkBusy(false);
    }
    if (bulkSucceeded()) selection.clear();
  }

  // Custom / no-plan: the one amount from the popup is applied to every selected
  // month in one batch write.
  async function runBulkCustomPay(values: BulkPaymentValues) {
    if (!user) return;
    const currency = findCurrency(currencies, values.currencyId);
    const inputs = payableEntries.map((e) => ({
      billingMonth: e.billingMonth,
      amountDue: values.amountDue,
      amountPaid: values.amountPaid,
      durationMonths: 1,
      currencyId: values.currencyId,
      customerId: customer.id,
      planId: customer.planId,
      receivedByUserId: user.id,
      tenantId: user.tenantId,
      notes: null,
    }));
    paymentStore.clearError();
    setBulkBusy(true);
    try {
      await paymentStore.createPayments(inputs, currency, customer, year, graceDays);
    } finally {
      setBulkBusy(false);
    }
    if (bulkSucceeded()) {
      setBulkPayVisible(false);
      selection.clear();
    }
  }

  function runBulkVoid() {
    if (bulkBusy || voidableEntries.length === 0) return;
    const ids = Array.from(new Set(voidableEntries.map((e) => e.payment!.id)));
    setBulkVoidIds(ids);
  }

  const selectionActions: SelectionAction[] = [];
  if (payableEntries.length > 0) {
    selectionActions.push({
      key: "pay",
      icon: "flash-outline",
      label: t("payments.quick_pay.pay_now"),
      disabled: bulkBusy,
      onPress: runBulkPay,
    });
  }
  if (voidableEntries.length > 0) {
    selectionActions.push({
      key: "void",
      icon: "trash-outline",
      label: t("payments.void_payment"),
      destructive: true,
      disabled: bulkBusy,
      onPress: runBulkVoid,
    });
  }

  const { year: cy, month: cm } = getCurrentYearMonth();
  const currentMonthEntry = paymentStore.monthGrid.find(
    (m) => m.year === cy && m.month === cm,
  );
  const showUnpaidBanner =
    customer.isRegular && currentMonthEntry?.status === "unpaid" && year === cy;
  const daysIntoMonth = new Date().getDate();

  // Partial months count toward "paid" in the year summary — a payment exists,
  // even if the balance isn't fully settled. The partial signal is conveyed by
  // the amber cell in the grid itself.
  const paidCount = paymentStore.monthGrid.filter(
    (m) => m.status === "paid" || m.status === "partial",
  ).length;
  const unpaidCount = paymentStore.monthGrid.filter(
    (m) => m.status === "unpaid",
  ).length;
  // Sum payments across mixed currencies in USD using each payment's frozen
  // snapshot rate (drift-free historical total), then format in the user's
  // display currency.
  const collectedTotalUsd = paymentStore.items
    .filter((p) => !p.voidedAt && p.billingMonth.startsWith(String(year)))
    .reduce(
      (sum, p) =>
        sum + toUsd(p.amountPaid, paymentSnapshotCurrency(p, currencies)),
      0,
    );
  const collectedTotalLabel = formatMoney(
    collectedTotalUsd,
    null,
    displayCurrency,
  );

  // Edit (update amountPaid) is available for any active, non-secondary payment.
  const canEditAmount =
    selectedEntry?.payment != null &&
    !selectedEntry.isGroupSecondary &&
    selectedEntry.payment.voidedAt === null;

  return (
    <>
      {paymentStore.error ? (
        <View className="px-4 mt-4">
          <ErrorBanner
            message={paymentStore.error}
            onDismiss={paymentStore.clearError}
          />
        </View>
      ) : null}

      {/* Year card */}
      <View className="bg-white mx-4 mt-4 rounded-2xl border border-gray-100 overflow-hidden">
        {/* Header row — the selection toolbar overlays it (absolute) so entering
            selection never shifts the grid down under the user's finger. */}
        <View className="relative">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <View className="flex-1 pe-3">
            <Text fontWeight="Bold" className="text-2xl text-gray-900">
              {year}
            </Text>
            <View className="flex-row items-center flex-wrap mt-1.5 gap-1.5">
              <View className="flex-row items-center bg-gray-100 rounded-full px-2 py-0.5">
                <Text fontWeight="SemiBold" className="text-xs text-gray-900">
                  {paidCount}
                </Text>
                <Text className="text-xs text-gray-500 ms-1">
                  {t("customers.year_paid").toLowerCase()}
                </Text>
              </View>
              <View className="flex-row items-center bg-gray-100 rounded-full px-2 py-0.5">
                <Text fontWeight="SemiBold" className="text-xs text-gray-900">
                  {unpaidCount}
                </Text>
                <Text className="text-xs text-gray-500 ms-1">
                  {t("customers.year_unpaid").toLowerCase()}
                </Text>
              </View>
              <View className="flex-row items-center bg-gray-100 rounded-full px-2 py-0.5">
                <Text fontWeight="SemiBold" className="text-xs text-gray-900">
                  {collectedTotalLabel}
                </Text>
                <Text className="text-xs text-gray-500 ms-1">
                  {t("customers.year_collected").toLowerCase()}
                </Text>
              </View>
            </View>
          </View>
          <View className="flex-row gap-2">
            <PressableOpacity
              onPress={() => setYear((y) => y - 1)}
              disabled={year <= new Date(customer.startDate).getFullYear()}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{
                backgroundColor: COLORS.primaryLight,
                opacity:
                  year <= new Date(customer.startDate).getFullYear() ? 0.35 : 1,
              }}
            >
              <DirectionalIcon
                name="chevron-back"
                size={20}
                color={COLORS.primary}
              />
            </PressableOpacity>
            <PressableOpacity
              onPress={() => setYear((y) => y + 1)}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: COLORS.primaryLight }}
            >
              <DirectionalIcon
                name="chevron-forward"
                size={20}
                color={COLORS.primary}
              />
            </PressableOpacity>
          </View>
          </View>
          {selection.active ? (
            <View className="absolute inset-0 bg-white px-2 justify-center border-b border-gray-100">
              <GridSelectionToolbar
                count={selection.count}
                actions={selectionActions}
                onClose={selection.clear}
              />
            </View>
          ) : null}
        </View>

        {paymentStore.loading ? (
          <View className="h-40 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <MonthGrid
            months={paymentStore.monthGrid}
            onCellPress={handleCellPress}
            onCellMenu={setMenuEntry}
            loadingBillingMonth={quickPayMonth}
            isRegular={customer.isRegular}
            selectionMode={selection.active}
            isSelected={(bm) => selection.selectedIds.has(bm)}
            onCellToggle={handleCellToggle}
            onCellLongPress={handleCellLongPress}
          />
        )}
      </View>

      {/* Unpaid banner */}
      {showUnpaidBanner && currentMonthEntry ? (
        <View className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex-row items-center">
          <Text className="text-base me-2">⚠️</Text>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-red-600">
              {new Date().toLocaleDateString(locale, {
                month: "long",
                year: "numeric",
              })}{" "}
              {t("dashboard.unpaid")}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              {t("payments.amount_due")} · {daysIntoMonth} days into the month
            </Text>
          </View>
          <PressableOpacity
            onPress={() => handleCellPress(currentMonthEntry)}
            className="bg-red-500 rounded-xl px-3 py-2 ms-2"
          >
            <Text className="text-white text-sm font-semibold">
              {t("payments.collect")}
            </Text>
          </PressableOpacity>
        </View>
      ) : null}

      {formVisible && selectedEntry && (
        <PaymentFormSheet
          entry={selectedEntry}
          customer={customer}
          graceDays={graceDays}
          monthGrid={paymentStore.monthGrid}
          onDismiss={() => setFormVisible(false)}
        />
      )}
      {detailVisible && selectedEntry && (
        <PaymentDetailSheet
          entry={selectedEntry}
          onVoid={handleVoidPress}
          onEdit={canEditAmount ? handleEditAmount : undefined}
          editLoading={paymentStore.loadingUpdate}
          onDismiss={() => setDetailVisible(false)}
        />
      )}
      {voidVisible && selectedEntry && (
        <VoidSheet
          entry={selectedEntry}
          customer={customer}
          year={year}
          graceDays={graceDays}
          onDismiss={() => {
            setDetailVisible(false);
            setVoidVisible(false);
          }}
        />
      )}

      {bulkPayVisible && (
        <BulkPaymentFormSheet
          count={payableEntries.length}
          submitting={bulkBusy}
          onConfirm={runBulkCustomPay}
          onDismiss={() => setBulkPayVisible(false)}
        />
      )}
      {bulkVoidIds && (
        <BulkVoidSheet
          paymentIds={bulkVoidIds}
          customer={customer}
          year={year}
          graceDays={graceDays}
          onVoided={() => {
            setBulkVoidIds(null);
            selection.clear();
          }}
          onDismiss={() => setBulkVoidIds(null)}
        />
      )}

      <UpgradePromptModal
        payload={paymentStore.tierLimitError}
        onClose={paymentStore.clearTierLimitError}
      />

      <ActionMenu
        visible={menuEntry !== null}
        title={
          menuEntry
            ? `${t(`months.${menuEntry.label}`)} ${menuEntry.year}`
            : undefined
        }
        actions={buildMonthMenuActions(menuEntry)}
        onDismiss={() => setMenuEntry(null)}
      />
    </>
  );
}
