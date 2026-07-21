import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useHorizontalSwipe } from "@/src/shared/hooks/useHorizontalSwipe";
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
import type { Customer, CustomerPlan, MonthEntry } from "@/src/core/types";
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
import { useAuth } from "@/src/modules/authentication/auth";
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
import {
  expandSelectionUnit,
  groupPayableBlocks,
} from "../utils/monthSelection";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { SelectionAction } from "@/src/shared/components/PageHeader";
import { UpgradePromptModal } from "@/src/modules/admin/subscription";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { getStore } from "@/src/state/globalStore";

interface CustomerPaymentPanelProps {
  customer: Customer;
}

const EMPTY_GRID: MonthEntry[] = [];

// Label for a service line tab/header: its plan name, else a "no plan" tag.
function lineLabel(line: CustomerPlan, noPlan: string): string {
  return line.plan?.name || noPlan;
}

// A single at-a-glance payment status for a line's tab, derived from the viewed
// year's grid (reuses buildMonthGrid's statuses — no status logic here). Worst
// state wins so an overdue plan is flagged first: unpaid > paid (a partial
// payment reports as paid). Null means nothing is due yet this year (all future
// / before start) → no dot.
type LineIndicator = "paid" | "unpaid";

const INDICATOR_DOT: Record<LineIndicator, string> = {
  paid: "bg-green-500",
  unpaid: "bg-red-500",
};

function lineIndicatorStatus(grid: MonthEntry[]): LineIndicator | null {
  let hasPaid = false;
  for (const m of grid) {
    if (m.status === "unpaid") return "unpaid";
    if (m.status === "paid") hasPaid = true;
  }
  if (hasPaid) return "paid";
  return null;
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

  // All of the customer's service lines (active + cancelled). Grids are built
  // for every line so a cancelled line's history stays viewable.
  const lines = useMemo(
    () => customer.customerPlans ?? [],
    [customer.customerPlans],
  );
  const linesKey = lines
    .map((l) => `${l.id}:${l.active}:${l.startDate}:${l.planId}`)
    .join(",");

  const [year, setYear] = useState(getCurrentYearMonth().year);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<MonthEntry | null>(null);
  const [menuEntry, setMenuEntry] = useState<MonthEntry | null>(null);
  const [quickPayMonth, setQuickPayMonth] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [voidVisible, setVoidVisible] = useState(false);
  const quickPayHandledRef = useRef(false);

  const selection = useSelection();
  useSelectionBackHandler(selection.active, selection.clear);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPayVisible, setBulkPayVisible] = useState(false);
  const [bulkVoidIds, setBulkVoidIds] = useState<string[] | null>(null);

  // Keep a valid line selected as lines load / change (prefer active lines).
  useEffect(() => {
    if (lines.length === 0) {
      setSelectedLineId(null);
      return;
    }
    if (!selectedLineId || !lines.some((l) => l.id === selectedLineId)) {
      const firstActive = lines.find((l) => l.active) ?? lines[0];
      setSelectedLineId(firstActive.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey]);

  const selectedLine = lines.find((l) => l.id === selectedLineId) ?? null;
  const plan = selectedLine?.plan ?? null;
  const grid = selectedLine
    ? (paymentStore.monthGridsByLine[selectedLine.id] ?? EMPTY_GRID)
    : EMPTY_GRID;

  // Loads every line's payments once per customer; switching years/lines
  // rebuilds the grids from the store instead of re-fetching.
  useEffect(() => {
    if (lines.length > 0) {
      paymentStore.getPayments(customer.id, lines, year, graceDays);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id, year, linesKey]);

  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, selectedLineId]);

  useEffect(() => {
    return () => paymentStore.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?quickPay=1 handshake from the customer list: open the form for the current
  // month of the (first) selected line once its grid is ready. Fires at most once.
  useEffect(() => {
    if (quickPay !== "1" || quickPayHandledRef.current) return;
    if (paymentStore.loading || grid.length === 0) return;
    const { year: cy, month: cm } = getCurrentYearMonth();
    const currentEntry = grid.find((m) => m.year === cy && m.month === cm);
    if (!currentEntry) return;
    quickPayHandledRef.current = true;
    setSelectedEntry(currentEntry);
    setFormVisible(true);
    router.setParams({ quickPay: undefined });
  }, [quickPay, paymentStore.loading, grid, router]);

  const lineActive = selectedLine?.active ?? false;

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
    // Future months are blocked when either the customer OR the line is inactive.
    if ((!customer.active || !lineActive) && isFutureMonth) {
      void confirm({
        title: t("common.not_available"),
        message: t("payments.inactive_future_blocked"),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
      return;
    }

    setSelectedEntry(entry);

    if (entry.status === "paid" && entry.payment) {
      setDetailVisible(true);
    } else {
      setFormVisible(true);
    }
  }

  function handleVoidPress() {
    setVoidVisible(true);
  }

  // Quick Pay is available on unpaid + future (prepay) months of an active line
  // with a fixed-price plan — custom-price / planless fall back to the form.
  function canQuickPay(entry: MonthEntry): boolean {
    return (
      customer.active &&
      lineActive &&
      (entry.status === "unpaid" || entry.status === "future") &&
      plan != null &&
      !plan.isCustomPrice &&
      plan.price !== null
    );
  }

  function hasActivePayment(entry: MonthEntry): boolean {
    return (
      entry.status === "paid" &&
      entry.payment != null &&
      entry.payment.voidedAt === null
    );
  }

  async function handleQuickPay(entry: MonthEntry) {
    if (
      !selectedLine ||
      !plan ||
      plan.isCustomPrice ||
      plan.price === null ||
      !user
    ) {
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
          months: getBlockRangeLabel(
            entry.billingMonth,
            plan.durationMonths,
            t,
          ),
        }),
        confirmLabel: t("payments.quick_pay.confirm"),
      });
      if (!ok) return;
      setQuickPayMonth(entry.billingMonth);
      try {
        await paymentStore.createMultiMonthPayment(
          entry.billingMonth,
          customer,
          selectedLine.id,
          plan,
          planCurrency,
          plan.price,
          user.id,
          null,
          user.tenantId,
          false,
          lines,
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
          customerPlanId: selectedLine.id,
          planId: plan.id,
          receivedByUserId: user.id,
          tenantId: user.tenantId,
          notes: null,
        },
        planCurrency,
        lines,
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
        icon: "close-circle-outline",
        destructive: true,
        onPress: () => {
          setSelectedEntry(entry);
          setVoidVisible(true);
        },
      });
    }
    return items;
  }

  async function handleEditAmount(next: { amountPaid: number }) {
    if (!selectedEntry?.payment) return;
    await paymentStore.updatePayment(
      selectedEntry.payment.id,
      next.amountPaid,
      lines,
      year,
      graceDays,
    );
    if (!getStore().getState().payments.error) setDetailVisible(false);
  }

  // --- Multi-select (bulk) ---------------------------------------------------

  const selectedEntries = grid.filter((m) =>
    selection.selectedIds.has(m.billingMonth),
  );
  const payableEntries = selectedEntries.filter(
    (e) =>
      e.status === "unpaid" ||
      (e.status === "future" && customer.active && lineActive),
  );
  const voidableEntries = selectedEntries.filter(
    (e) =>
      e.status === "paid" && e.payment != null && e.payment.voidedAt === null,
  );

  function handleCellToggle(entry: MonthEntry) {
    if (!selectedLine) return;
    const unit = expandSelectionUnit(entry, grid, selectedLine);
    if (unit.length > 0) selection.toggleMany(unit);
  }

  function handleCellLongPress(entry: MonthEntry) {
    if (!selectedLine) return;
    const unit = expandSelectionUnit(entry, grid, selectedLine);
    if (unit.length > 0) selection.enterWith(unit);
  }

  function bulkSucceeded(): boolean {
    const ps = getStore().getState().payments;
    return !ps.error && !ps.tierLimitError;
  }

  function runBulkPay() {
    if (bulkBusy || payableEntries.length === 0) return;
    if (!plan || plan.isCustomPrice) {
      setBulkPayVisible(true);
    } else if (plan.durationMonths > 1) {
      void runBulkMultiMonthPay();
    } else {
      void runBulkFixedPay();
    }
  }

  async function runBulkFixedPay() {
    if (!user || !selectedLine || !plan || plan.price === null) return;
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
      customerPlanId: selectedLine.id,
      planId: plan.id,
      receivedByUserId: user.id,
      tenantId: user.tenantId,
      notes: null,
    }));
    paymentStore.clearError();
    setBulkBusy(true);
    try {
      await paymentStore.createPayments(
        inputs,
        planCurrency,
        lines,
        year,
        graceDays,
      );
    } finally {
      setBulkBusy(false);
    }
    if (bulkSucceeded()) selection.clear();
  }

  async function runBulkMultiMonthPay() {
    if (!user || !selectedLine || !plan || plan.price === null || !currentTier)
      return;
    const blocks = groupPayableBlocks(payableEntries, selectedLine);
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
        selectedLine.id,
        plan,
        planCurrency,
        plan.price,
        user.id,
        null,
        user.tenantId,
        lines,
        year,
        graceDays,
        currentTier,
      );
    } finally {
      setBulkBusy(false);
    }
    if (bulkSucceeded()) selection.clear();
  }

  async function runBulkCustomPay(values: BulkPaymentValues) {
    if (!user || !selectedLine) return;
    const currency = findCurrency(currencies, values.currencyId);
    const inputs = payableEntries.map((e) => ({
      billingMonth: e.billingMonth,
      amountDue: values.amountDue,
      amountPaid: values.amountPaid,
      durationMonths: 1,
      currencyId: values.currencyId,
      customerId: customer.id,
      customerPlanId: selectedLine.id,
      planId: selectedLine.planId,
      receivedByUserId: user.id,
      tenantId: user.tenantId,
      notes: null,
    }));
    paymentStore.clearError();
    setBulkBusy(true);
    try {
      await paymentStore.createPayments(
        inputs,
        currency,
        lines,
        year,
        graceDays,
      );
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
      icon: "close-circle-outline",
      label: t("payments.void_payment"),
      destructive: true,
      disabled: bulkBusy,
      onPress: runBulkVoid,
    });
  }

  const { year: cy, month: cm } = getCurrentYearMonth();
  const currentMonthEntry = grid.find((m) => m.year === cy && m.month === cm);
  const showUnpaidBanner =
    customer.isRegular &&
    lineActive &&
    currentMonthEntry?.status === "unpaid" &&
    year === cy;
  const daysIntoMonth = new Date().getDate();

  const paidCount = grid.filter((m) => m.status === "paid").length;
  const unpaidCount = grid.filter((m) => m.status === "unpaid").length;
  const collectedTotalUsd = paymentStore.items
    .filter(
      (p) =>
        !p.voidedAt &&
        p.customerPlanId === selectedLine?.id &&
        p.billingMonth.startsWith(String(year)),
    )
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

  const canEditAmount =
    selectedEntry?.payment != null &&
    !selectedEntry.isGroupSecondary &&
    selectedEntry.payment.voidedAt === null;

  const minYear = selectedLine
    ? new Date(selectedLine.startDate).getFullYear()
    : new Date(customer.startDate).getFullYear();

  // Swipe left/right on the grid steps the year (forward = next year, back =
  // previous, clamped at the line's start year like the chevron buttons).
  const stepYear = useCallback(
    (delta: number) =>
      setYear((y) => (delta < 0 && y <= minYear ? y : y + delta)),
    [minYear],
  );
  const yearSwipe = useHorizontalSwipe({
    onNext: () => stepYear(1),
    onPrev: () => stepYear(-1),
  });

  // Empty state — a customer with no service lines (rare: every customer keeps
  // ≥1 line, managed from the customer form's Plans editor).
  if (lines.length === 0) {
    return (
      <View className="bg-white mx-4 mt-4 rounded-2xl border border-gray-100 px-4 py-8 items-center">
        <Ionicons name="albums-outline" size={28} color={COLORS.gray400} />
        <Text className="text-sm text-gray-500 mt-2 text-center">
          {t("subscriptions.empty")}
        </Text>
      </View>
    );
  }

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

      {/* Service-line selector — view only (add/edit/remove plans from the
          customer form). Hidden when there's a single line so a one-plan
          customer looks exactly like before. */}
      {lines.length > 1 && (
        <View className="mx-4 mt-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {lines.map((line) => {
              const isSel = line.id === selectedLineId;
              const dot = lineIndicatorStatus(
                paymentStore.monthGridsByLine[line.id] ?? EMPTY_GRID,
              );
              return (
                <PressableOpacity
                  key={line.id}
                  onPress={() => setSelectedLineId(line.id)}
                  className={`flex-row items-center rounded-full px-3 py-1.5 border ${
                    isSel
                      ? "bg-gray-900 border-gray-900"
                      : "bg-white border-gray-200"
                  } ${line.active ? "" : "opacity-50"}`}
                >
                  {dot ? (
                    <View
                      className={`w-2 h-2 rounded-full me-1.5 ${INDICATOR_DOT[dot]}`}
                    />
                  ) : null}
                  <Text
                    fontWeight="SemiBold"
                    className={`text-xs ${isSel ? "text-white" : "text-gray-700"}`}
                    numberOfLines={1}
                  >
                    {lineLabel(line, t("common.no_plan"))}
                    {line.active ? "" : ` · ${t("subscriptions.cancelled")}`}
                  </Text>
                </PressableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Year card */}
      <GestureDetector gesture={yearSwipe}>
        <View className="bg-white mx-4 mt-3 rounded-2xl border border-gray-100 overflow-hidden">
          <View className="relative">
            <View className="px-4 pt-4 pb-2">
              {/* Selected line header (the plan this grid is for) — shown only
                when the customer has more than one line. */}
              {lines.length > 1 && selectedLine ? (
                <View className="mb-1">
                  <Text
                    fontWeight="SemiBold"
                    className="text-sm text-gray-700"
                    numberOfLines={1}
                  >
                    {lineLabel(selectedLine, t("common.no_plan"))}
                    {selectedLine.active
                      ? ""
                      : ` · ${t("subscriptions.cancelled")}`}
                  </Text>
                </View>
              ) : null}

              {/* Row 1 — year + year navigation */}
              <View className="flex-row items-center justify-between">
                <Text fontWeight="Bold" className="text-2xl text-gray-900">
                  {year}
                </Text>
                <View className="flex-row gap-2">
                  <PressableOpacity
                    onPress={() => setYear((y) => y - 1)}
                    disabled={year <= minYear}
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: COLORS.primaryLight,
                      opacity: year <= minYear ? 0.35 : 1,
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
              {/* Row 2 — year summary chips */}
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
              months={grid}
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
      </GestureDetector>

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

      {formVisible && selectedEntry && selectedLine && (
        <PaymentFormSheet
          entry={selectedEntry}
          customer={customer}
          line={selectedLine}
          lines={lines}
          graceDays={graceDays}
          monthGrid={grid}
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
          lines={lines}
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
          lines={lines}
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
