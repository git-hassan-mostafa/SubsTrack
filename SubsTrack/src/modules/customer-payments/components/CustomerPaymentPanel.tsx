import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { confirm } from "@/src/shared/lib/confirm";
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
import { useGraceDays } from "@/src/state/hooks/useSubscriptionSlice";
import { MonthGrid } from "./MonthGrid";
import { PaymentDetailSheet } from "./PaymentDetailSheet";
import { PaymentFormSheet } from "./PaymentFormSheet";
import { VoidSheet } from "./VoidSheet";
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
  const paymentStore = usePaymentSlice();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const graceDays = useGraceDays();

  const [year, setYear] = useState(getCurrentYearMonth().year);
  const [selectedEntry, setSelectedEntry] = useState<MonthEntry | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [voidVisible, setVoidVisible] = useState(false);
  const quickPayHandledRef = useRef(false);

  useEffect(() => {
    paymentStore.fetchPayments(customer.id, year, customer, graceDays);
  }, [customer.id, year, customer.startDate]);

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
      void confirm({ title: t("common.not_available"), message: t("payments.before_start_date"), confirmLabel: t("common.close"), hideCancel: true });
      return;
    }

    const { year: cy, month: cm } = getCurrentYearMonth();
    const isFutureMonth =
      entry.year > cy || (entry.year === cy && entry.month > cm);
    if (!customer.active && isFutureMonth) {
      void confirm({ title: t("common.not_available"), message: t("payments.inactive_future_blocked"), confirmLabel: t("common.close"), hideCancel: true });
      return;
    }

    setSelectedEntry(entry);

    if (entry.status === "paid" && entry.payment) {
      // Both primary and secondary grouped months open the same detail sheet.
      setDetailVisible(true);
    } else {
      setFormVisible(true);
    }
  }

  function handleVoidPress() {
    setVoidVisible(true);
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

  const { year: cy, month: cm } = getCurrentYearMonth();
  const currentMonthEntry = paymentStore.monthGrid.find(
    (m) => m.year === cy && m.month === cm,
  );
  const showUnpaidBanner =
    customer.isRegular && currentMonthEntry?.status === "unpaid" && year === cy;
  const daysIntoMonth = new Date().getDate();

  const paidCount = paymentStore.monthGrid.filter(
    (m) => m.status === "paid",
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
    locale,
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
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <View>
            <Text fontWeight="Bold" className="text-2xl text-gray-900">
              {year}
            </Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              {t("customers.year_summary", {
                paidCount,
                unpaidCount,
                collectedTotal: collectedTotalLabel,
              })}
            </Text>
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

        {paymentStore.loading ? (
          <View className="h-40 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <MonthGrid
            months={paymentStore.monthGrid}
            onCellPress={handleCellPress}
            isRegular={customer.isRegular}
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
    </>
  );
}
