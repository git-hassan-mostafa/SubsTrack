import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import type { Customer, MonthEntry } from "@/src/core/types";
import {
  formatDate,
  getCurrentYearMonth,
  getDateLocale,
} from "@/src/core/utils/date";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { MonthGrid } from "@/src/modules/payments/components/MonthGrid";
import { PaymentDetailSheet } from "@/src/modules/payments/components/PaymentDetailSheet";
import { PaymentFormSheet } from "@/src/modules/payments/components/PaymentFormSheet";
import { VoidSheet } from "@/src/modules/payments/components/VoidSheet";
import { usePaymentStore } from "@/src/modules/payments/store/paymentStore";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { useCustomerStore } from "../store/customerStore";
import { AVATAR_COLORS, DEFAULT_GRACE_DAYS } from "../../../shared/constants";

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function CustomerDetailScreen() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();

  const customerStore = useCustomerStore();
  const customer = useCustomerStore(
    (state) => state.customers.find((c) => c.id === id) ?? null,
  );
  const paymentStore = usePaymentStore();

  const [year, setYear] = useState(getCurrentYearMonth().year);
  const [editVisible, setEditVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<MonthEntry | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [voidVisible, setVoidVisible] = useState(false);
  const [toggleConfirmVisible, setToggleConfirmVisible] = useState(false);
  const [infoPopupMessage, setInfoPopupMessage] = useState<string | null>(null);

  useEffect(() => {
    getSelectedCustomer();
    return () => paymentStore.reset();
  }, [id]);

  useEffect(() => {
    if (customer) {
      paymentStore.fetchPayments(
        customer.id,
        year,
        customer,
        DEFAULT_GRACE_DAYS,
      );
    }
  }, [customer?.id, year]);

  async function getSelectedCustomer() {
    if (id) await customerStore.getCustomer(id);
  }
  async function fetchSelectedCustomer() {
    if (id) await customerStore.fetchCustomer(id);
  }

  function handleCellPress(entry: MonthEntry) {
    if (entry.status === "before_start") {
      setInfoPopupMessage(t("payments.before_start_date"));
      return;
    }

    const { year: cy, month: cm } = getCurrentYearMonth();
    const isFutureMonth =
      entry.year > cy || (entry.year === cy && entry.month > cm);
    if (!customer?.active && isFutureMonth) {
      setInfoPopupMessage(t("payments.inactive_future_blocked"));
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

  async function handleEditAmount(newAmount: number) {
    if (!selectedEntry?.payment) return;
    await paymentStore.updatePaymentAmount(
      selectedEntry.payment.id,
      newAmount,
      customer!,
      year,
      DEFAULT_GRACE_DAYS,
    );
    if (!usePaymentStore.getState().error) setDetailVisible(false);
  }

  async function handleToggleActiveConfirmed() {
    if (!customer) return;
    setToggleConfirmVisible(false);
    if (customer.active) {
      await customerStore.deactivateCustomer(customer.id);
    } else {
      await customerStore.reactivateCustomer(customer.id);
    }
  }

  const handleRefresh = useCallback(() => {
    fetchSelectedCustomer();
  }, [id]);

  // Current month unpaid banner
  const { year: cy, month: cm } = getCurrentYearMonth();
  const currentMonthEntry = paymentStore.monthGrid.find(
    (m) => m.year === cy && m.month === cm,
  );
  const showUnpaidBanner =
    currentMonthEntry?.status === "unpaid" && year === cy;
  const daysIntoMonth = new Date().getDate();

  // Year summary
  const paidCount = paymentStore.monthGrid.filter(
    (m) => m.status === "paid",
  ).length;
  const unpaidCount = paymentStore.monthGrid.filter(
    (m) => m.status === "unpaid",
  ).length;
  const collectedTotal = paymentStore.payments
    .filter((p) => !p.voidedAt && p.billingMonth.startsWith(String(year)))
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="me-3 p-1">
          <DirectionalIcon
            name="chevron-back"
            size={22}
            color={COLORS.primary}
          />
        </Pressable>
        {customer ? (
          <View
            className="w-10 h-10 rounded-xl items-center justify-center me-3"
            style={{ backgroundColor: getAvatarColor(customer.name) + "22" }}
          >
            <Text
              fontWeight="Bold"
              className="text-sm"
              style={{ color: getAvatarColor(customer.name) }}
            >
              {getInitials(customer.name)}
            </Text>
          </View>
        ) : null}
        <View className="flex-1">
          <Text
            fontWeight="Bold"
            className="text-base text-gray-900"
            numberOfLines={1}
          >
            {customer?.name ?? ""}
          </Text>
          {customer ? (
            <Text className="text-xs text-gray-400">
              {t("customers.plan_since", {
                plan: customer.plan?.name ?? t("common.no_plan"),
                date: new Date(customer.startDate).toLocaleDateString(locale, {
                  month: "short",
                  year: "numeric",
                }),
              })}
            </Text>
          ) : null}
        </View>
        {isAdmin ? (
          <Pressable
            onPress={() => setEditVisible(true)}
            className="ms-2 bg-primary rounded-full px-4 py-2"
          >
            <Text className="text-white font-semibold text-sm">
              {t("common.edit")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {customerStore.error || paymentStore.error ? (
        <View className="px-4 pt-4">
          {customerStore.error ? (
            <ErrorBanner
              message={customerStore.error}
              onDismiss={customerStore.clearError}
            />
          ) : null}
          {paymentStore.error ? (
            <ErrorBanner
              message={paymentStore.error}
              onDismiss={paymentStore.clearError}
            />
          ) : null}
        </View>
      ) : null}

      {customerStore.loading && !customer ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : customer ? (
        <ScrollView
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={customerStore.loading}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
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
                  className={`w-9 h-9 rounded-full items-center justify-center bg-gray-100 ${year <= new Date(customer.startDate).getFullYear() ? "opacity-30" : ""}`}
                >
                  <Text className="text-gray-700 font-semibold text-base">
                    ‹
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setYear((y) => y + 1)}
                  className="w-9 h-9 rounded-full items-center justify-center bg-gray-100"
                >
                  <Text className="text-gray-700 font-semibold text-base">
                    ›
                  </Text>
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
                  {customer.plan?.price != null
                    ? t("payments.amount_due")
                    : t("payments.amount_due")}{" "}
                  · {daysIntoMonth} days into the month
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

          {/* Details section */}
          <View className="mx-4 mt-4">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              {t("customers.details_section")}
            </Text>
            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {customer.phoneNumber ? (
                <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
                  <View className="flex-row items-center gap-3">
                    <Ionicons
                      name="call-outline"
                      size={16}
                      color={COLORS.gray400}
                    />
                    <Text className="text-sm text-gray-500">
                      {t("customers.phone_label")}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-gray-900">
                    {customer.phoneNumber}
                  </Text>
                </View>
              ) : null}

              {customer.address ? (
                <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
                  <View className="flex-row items-center gap-3">
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={COLORS.gray400}
                    />
                    <Text className="text-sm text-gray-500">
                      {t("customers.address_label")}
                    </Text>
                  </View>
                  <Text
                    className="text-sm font-semibold text-gray-900 flex-1 ms-4 text-right"
                    numberOfLines={2}
                  >
                    {customer.address}
                  </Text>
                </View>
              ) : null}

              <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
                <View className="flex-row items-center gap-3">
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={COLORS.gray400}
                  />
                  <Text className="text-sm text-gray-500">
                    {t("customers.started_label")}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-gray-900">
                  {formatDate(customer.startDate, locale)}
                </Text>
              </View>

              <Pressable
                onPress={() => setToggleConfirmVisible(true)}
                className="flex-row items-center justify-between px-4 py-3.5"
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className={`w-4 h-4 rounded-full items-center justify-center ${customer.active ? "bg-green-100" : "bg-gray-100"}`}
                  >
                    <View
                      className={`w-2 h-2 rounded-full ${customer.active ? "bg-success" : "bg-gray-400"}`}
                    />
                  </View>
                  <Text className="text-sm text-gray-500">
                    {t("customers.status_label")}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Text
                    className={`text-sm font-semibold ${customer.active ? "text-success" : "text-gray-400"}`}
                  >
                    {customer.active
                      ? t("common.active")
                      : t("common.inactive")}
                  </Text>
                  <Text className="text-xs text-primary">
                    ({t("common.tap")})
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View className="h-8" />
        </ScrollView>
      ) : null}

      {customer ? (
        <>
          <CustomerFormSheet
            visible={editVisible}
            customer={customer}
            onDismiss={() => setEditVisible(false)}
          />
          <PaymentFormSheet
            visible={formVisible}
            entry={selectedEntry}
            customer={customer}
            graceDays={DEFAULT_GRACE_DAYS}
            onDismiss={() => setFormVisible(false)}
          />
          <PaymentDetailSheet
            visible={detailVisible}
            entry={selectedEntry}
            onVoid={handleVoidPress}
            onEdit={
              !customer.plan || customer.plan.isCustomPrice
                ? handleEditAmount
                : undefined
            }
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
            visible={toggleConfirmVisible}
            title={
              customer.active
                ? t("customers.deactivate_title")
                : t("customers.reactivate_title")
            }
            message={
              customer.active
                ? t("customers.deactivate_message", { name: customer.name })
                : t("customers.reactivate_message", { name: customer.name })
            }
            destructive={customer.active}
            onConfirm={handleToggleActiveConfirmed}
            onCancel={() => setToggleConfirmVisible(false)}
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
      ) : null}
    </SafeAreaView>
  );
}
