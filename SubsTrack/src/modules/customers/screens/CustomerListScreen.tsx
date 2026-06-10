import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { confirm } from "@/src/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import { COLORS } from "@/src/shared/constants";
import {
  useGraceDays,
  useSubscriptionSlice,
} from "@/src/state/hooks/useSubscriptionSlice";
import type { Customer } from "@/src/core/types";
import { CustomerCard } from "../components/CustomerCard";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { useCustomerSlice } from "@/src/state/hooks/useCustomerSlice";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useAuth } from "../../auth/hooks/useAuth";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import {
  getCurrentYearMonth,
  getDateLocale,
  isBeforeStartDate,
  toBillingMonth,
} from "@/src/core/utils/date";
import { getBlockRangeLabel } from "../../customer-payments/utils/blockRangeLabel";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { MONTHS } from "@/src/core/constants";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";

type FilterTab = "all" | "unpaid" | "active" | "inactive";

export function CustomerListScreen() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const graceDays = useGraceDays();
  const currentTier = useSubscriptionSlice((s) => s.currentTier);
  const customers = useCustomerSlice((s) => s.items);
  const activeCount = useCustomerSlice((s) => s.activeCount);
  const loading = useCustomerSlice((s) => s.loading);
  const loadingMore = useCustomerSlice((s) => s.loadingMore);
  const error = useCustomerSlice((s) => s.error);
  const fetchCustomers = useCustomerSlice((s) => s.fetchCustomers);
  const fetchMoreCustomers = useCustomerSlice((s) => s.fetchMoreCustomers);
  const setSearchQuery = useCustomerSlice((s) => s.setSearchQuery);
  const clearError = useCustomerSlice((s) => s.clearError);
  const deactivateCustomer = useCustomerSlice((s) => s.deactivateCustomer);
  const reactivateCustomer = useCustomerSlice((s) => s.reactivateCustomer);
  const deleteCustomer = useCustomerSlice((s) => s.deleteCustomer);
  const currentMonthFullyPaidIds = usePaymentSlice(
    (s) => s.currentMonthFullyPaidIds,
  );
  const currentMonthPartialIds = usePaymentSlice(
    (s) => s.currentMonthPartialIds,
  );
  const fetchCurrentMonthPaymentStatus = usePaymentSlice(
    (s) => s.fetchCurrentMonthPaymentStatus,
  );
  const createPayment = usePaymentSlice((s) => s.createPayment);
  const createMultiMonthPayment = usePaymentSlice(
    (s) => s.createMultiMonthPayment,
  );
  const paymentError = usePaymentSlice((s) => s.error);
  const clearPaymentError = usePaymentSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const [formVisible, setFormVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("active");
  const [quickPayCustomerId, setQuickPayCustomerId] = useState<string | null>(
    null,
  );
  const [menuCustomer, setMenuCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();

  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch]);

  // Loads on mount AND re-fetches when the user switches the branch chip.
  useEffect(() => {
    fetchCustomers();
    fetchCurrentMonthPaymentStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return `${t(`months.${MONTHS[now.getMonth()]}`)} ${now.getFullYear()}`;
  }, [t]);

  const tabs = useMemo(() => {
    return [
      { key: "active" as FilterTab, label: t("common.active") },
      { key: "unpaid" as FilterTab, label: t("dashboard.unpaid") },
      { key: "all" as FilterTab, label: t("customers.all") },
      { key: "inactive" as FilterTab, label: t("common.inactive") },
    ];
  }, [t]);

  // A customer has *any* payment record for the current month when either set holds them.
  // Used by the unpaid tab + Quick Pay gating to mean "already has a record this month."
  const hasCurrentMonthPayment = useCallback(
    (id: string) =>
      currentMonthFullyPaidIds.has(id) || currentMonthPartialIds.has(id),
    [currentMonthFullyPaidIds, currentMonthPartialIds],
  );

  const filtered = useMemo(() => {
    if (activeTab === "active") return customers.filter((c) => c.active);
    if (activeTab === "inactive") return customers.filter((c) => !c.active);
    if (activeTab === "unpaid")
      return customers.filter(
        (c) => c.active && c.isRegular && !hasCurrentMonthPayment(c.id),
      );
    return customers;
  }, [activeTab, customers, hasCurrentMonthPayment]);

  const openDetail = useCallback(
    (customer: Customer) => {
      router.push(`/(app)/(tabs)/customers/${customer.id}`);
    },
    [router],
  );

  async function recordSingleMonth(customer: Customer) {
    if (!customer.plan || customer.plan.price === null || !user) return;
    setQuickPayCustomerId(customer.id);
    try {
      const { year, month } = getCurrentYearMonth();
      const planCurrency = findCurrency(currencies, customer.plan.currencyId);
      await createPayment(
        {
          billingMonth: toBillingMonth(year, month),
          amountDue: customer.plan.price,
          amountPaid: customer.plan.price,
          durationMonths: 1,
          currencyId: customer.plan.currencyId,
          customerId: customer.id,
          planId: customer.plan.id,
          receivedByUserId: user.id,
          tenantId: user.tenantId,
          notes: null,
        },
        planCurrency,
        customer,
        graceDays,
      );
    } finally {
      setQuickPayCustomerId(null);
    }
  }

  async function handleMultiMonthQuickPay(customer: Customer) {
    if (!customer.plan || customer.plan.price === null || !user || !currentTier)
      return;
    const { year, month } = getCurrentYearMonth();
    const startMonth = toBillingMonth(year, month);
    const planCurrency = findCurrency(currencies, customer.plan.currencyId);
    const ok = await confirm({
      title: t("payments.quick_pay.confirm_multi_month_title"),
      message: t("payments.quick_pay.confirm_multi_month_message", {
        amount: formatMoney(customer.plan.price, planCurrency, planCurrency),
        months: getBlockRangeLabel(startMonth, customer.plan.durationMonths, t),
      }),
      confirmLabel: t("payments.quick_pay.confirm"),
    });
    if (!ok) return;
    setQuickPayCustomerId(customer.id);
    try {
      await createMultiMonthPayment(
        startMonth,
        customer,
        customer.plan,
        planCurrency,
        customer.plan.price,
        user.id,
        null,
        user.tenantId,
        false,
        year,
        graceDays,
        currentTier,
      );
    } finally {
      setQuickPayCustomerId(null);
    }
  }

  function handleQuickPay(customer: Customer) {
    if (!customer.plan || customer.plan.isCustomPrice) {
      router.push({
        pathname: "/(app)/(tabs)/customers/[id]",
        params: { id: customer.id, quickPay: "1" },
      });
      return;
    }
    if (customer.plan.durationMonths > 1) {
      void handleMultiMonthQuickPay(customer);
      return;
    }
    void recordSingleMonth(customer);
  }

  function shouldShowQuickPay(customer: Customer): boolean {
    if (!customer.active || !customer.isRegular) return false;
    if (hasCurrentMonthPayment(customer.id)) return false;
    const { year, month } = getCurrentYearMonth();
    if (isBeforeStartDate(year, month, customer.startDate)) return false;
    return true;
  }

  const openMenu = useCallback((customer: Customer) => {
    setMenuCustomer(customer);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => {
      const paymentStatus: "paid" | "partial" | "unpaid" =
        currentMonthFullyPaidIds.has(item.id)
          ? "paid"
          : currentMonthPartialIds.has(item.id)
            ? "partial"
            : "unpaid";
      return (
        <CustomerCard
          customer={item}
          paymentStatus={paymentStatus}
          monthLabel={monthLabel}
          onPress={openDetail}
          onMenu={openMenu}
          menuLoading={quickPayCustomerId === item.id}
        />
      );
    },
    [
      currentMonthFullyPaidIds,
      currentMonthPartialIds,
      monthLabel,
      openDetail,
      openMenu,
      quickPayCustomerId,
    ],
  );

  async function handleToggleActiveCustomer(customer: Customer) {
    const ok = await confirm({
      title: customer.active
        ? t("customers.deactivate_title")
        : t("customers.reactivate_title"),
      message: customer.active
        ? t("customers.deactivate_message", { name: customer.name })
        : t("customers.reactivate_message", { name: customer.name }),
      destructive: customer.active,
    });
    if (!ok) return;
    if (customer.active) {
      await deactivateCustomer(customer.id);
    } else {
      await reactivateCustomer(customer.id);
    }
  }

  async function handleDeleteCustomer(customer: Customer) {
    const ok = await confirm({
      title: t("customers.delete_title"),
      message: t("customers.delete_message", { name: customer.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    await deleteCustomer(customer.id);
  }

  function buildMenuActions(customer: Customer | null): ActionMenuItem[] {
    if (!customer) return [];
    const items: ActionMenuItem[] = [];
    if (shouldShowQuickPay(customer)) {
      items.push({
        key: "quick-pay",
        label: t("payments.quick_pay.pay_now"),
        icon: "flash-outline",
        onPress: () => handleQuickPay(customer),
      });
    }
    items.push({
      key: "edit",
      label: t("common.edit"),
      icon: "create-outline",
      onPress: () => setEditingCustomer(customer),
    });
    if (isAdmin) {
      items.push({
        key: "toggle-active",
        label: customer.active
          ? t("customers.deactivate")
          : t("customers.activate"),
        icon: customer.active ? "pause-circle-outline" : "play-circle-outline",
        destructive: customer.active,
        onPress: () => void handleToggleActiveCustomer(customer),
      });
      items.push({
        key: "delete",
        label: t("common.delete"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => void handleDeleteCustomer(customer),
      });
    }
    return items;
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("customers.title")}
        subtitle={t("customers.active_count", { count: activeCount })}
        actionLabel={t("common.add")}
        onAction={() => setFormVisible(true)}
      />

      <View className="px-4 pt-4">
        {/* Search */}
        <SearchTextBox
          searchText={searchText}
          setSearchText={setSearchText}
          placeholder={t("customers.search_hint")}
        />
        {/* Filter tabs */}
        <View className="flex-row gap-2 mt-4">
          {tabs.map((tab) => (
            <PressableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`rounded-full px-3 py-1.5 ${activeTab === tab.key ? "bg-gray-900" : "bg-gray-100"}`}
            >
              <Text
                className={`text-xs font-semibold ${activeTab === tab.key ? "text-white" : "text-gray-600"}`}
              >
                {tab.label}
              </Text>
            </PressableOpacity>
          ))}
        </View>
      </View>
      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}
      {paymentError ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={paymentError} onDismiss={clearPaymentError} />
        </View>
      ) : null}

      {loading && customers.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                fetchCustomers();
                fetchCurrentMonthPaymentStatus();
              }}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={() => fetchMoreCustomers()}
          onEndReachedThreshold={0.3}
          renderItem={renderItem}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={COLORS.primary} className="py-4" />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              message={t("customers.no_customers")}
              subMessage={
                debouncedSearch
                  ? t("customers.no_search_results")
                  : t("customers.no_customers_hint")
              }
              actionLabel={
                !debouncedSearch && customers.length === 0
                  ? t("customers.create_first_customer")
                  : undefined
              }
              onAction={
                !debouncedSearch && customers.length === 0
                  ? () => setFormVisible(true)
                  : undefined
              }
            />
          }
        />
      )}

      {formVisible && (
        <CustomerFormSheet onDismiss={() => setFormVisible(false)} />
      )}

      {editingCustomer && (
        <CustomerFormSheet
          customer={editingCustomer}
          onDismiss={() => setEditingCustomer(null)}
        />
      )}

      <ActionMenu
        visible={menuCustomer !== null}
        title={menuCustomer?.name}
        actions={buildMenuActions(menuCustomer)}
        onDismiss={() => setMenuCustomer(null)}
      />
    </SafeAreaView>
  );
}
