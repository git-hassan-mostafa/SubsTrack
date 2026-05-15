import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import type { Customer, MonthEntry } from "@/src/core/types";
import { getCurrentYearMonth, getDateLocale } from "@/src/core/utils/date";
import { COLORS, DEFAULT_GRACE_DAYS } from "@/src/shared/constants";
import { MonthGrid } from "./MonthGrid";
import { PaymentDetailSheet } from "./PaymentDetailSheet";
import { PaymentFormSheet } from "./PaymentFormSheet";
import { VoidSheet } from "./VoidSheet";
import { usePaymentStore } from "../store/paymentStore";

interface CustomerPaymentPanelProps {
  customer: Customer;
}

export function CustomerPaymentPanel({ customer }: CustomerPaymentPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const paymentStore = usePaymentStore();

  const [year, setYear] = useState(getCurrentYearMonth().year);
  const [selectedEntry, setSelectedEntry] = useState<MonthEntry | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [voidVisible, setVoidVisible] = useState(false);
  const [infoPopupMessage, setInfoPopupMessage] = useState<string | null>(null);

  useEffect(() => {
    paymentStore.fetchPayments(customer.id, year, customer, DEFAULT_GRACE_DAYS);
  }, [customer.id, year]);

  useEffect(() => {
    return () => paymentStore.reset();
  }, []);

  function handleCellPress(entry: MonthEntry) {
    if (entry.status === "before_start") {
      setInfoPopupMessage(t("payments.before_start_date"));
      return;
    }

    const { year: cy, month: cm } = getCurrentYearMonth();
    const isFutureMonth =
      entry.year > cy || (entry.year === cy && entry.month > cm);
    if (!customer.active && isFutureMonth) {
      setInfoPopupMessage(t("payments.inactive_future_blocked"));
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

  async function handleEditAmount(newAmount: number) {
    if (!selectedEntry?.payment) return;
    await paymentStore.updatePaymentAmount(
      selectedEntry.payment.id,
      newAmount,
      customer,
      year,
      DEFAULT_GRACE_DAYS,
    );
    if (!usePaymentStore.getState().error) setDetailVisible(false);
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
  const collectedTotal = paymentStore.payments
    .filter((p) => !p.voidedAt && p.billingMonth.startsWith(String(year)))
    .reduce((sum, p) => sum + p.amount, 0);

  // Edit amount is only available for non-multi-month, non-fixed-price payments.
  const canEditAmount =
    selectedEntry?.payment &&
    selectedEntry.payment.durationMonths === 1 &&
    (!customer.plan || customer.plan.isCustomPrice);

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
                collectedTotal: collectedTotal.toFixed(0),
              })}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable
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
            </Pressable>
            <Pressable
              onPress={() => setYear((y) => y + 1)}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: COLORS.primaryLight }}
            >
              <DirectionalIcon
                name="chevron-forward"
                size={20}
                color={COLORS.primary}
              />
            </Pressable>
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
          <Pressable
            onPress={() => handleCellPress(currentMonthEntry)}
            className="bg-red-500 rounded-xl px-3 py-2 ms-2"
          >
            <Text className="text-white text-sm font-semibold">
              {t("payments.collect")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <PaymentFormSheet
        visible={formVisible}
        entry={selectedEntry}
        customer={customer}
        graceDays={DEFAULT_GRACE_DAYS}
        monthGrid={paymentStore.monthGrid}
        onDismiss={() => setFormVisible(false)}
      />
      <PaymentDetailSheet
        visible={detailVisible}
        entry={selectedEntry}
        onVoid={handleVoidPress}
        onEdit={canEditAmount ? handleEditAmount : undefined}
        editLoading={paymentStore.loadingUpdate}
        onDismiss={() => setDetailVisible(false)}
      />
      <VoidSheet
        visible={voidVisible}
        entry={selectedEntry}
        customer={customer}
        year={year}
        graceDays={DEFAULT_GRACE_DAYS}
        onDismiss={() => {
          setDetailVisible(false);
          setVoidVisible(false);
        }}
      />
      <ConfirmDialog
        visible={infoPopupMessage !== null}
        title={t("common.not_available")}
        message={infoPopupMessage ?? ""}
        confirmLabel={t("common.close")}
        hideCancel
        onConfirm={() => setInfoPopupMessage(null)}
        onCancel={() => setInfoPopupMessage(null)}
      />
    </>
  );
}
