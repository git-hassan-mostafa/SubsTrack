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
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import { COLORS } from "@/src/shared/constants";
import { useGraceDays, useSubscriptionStore } from "@/src/modules/subscription/store/subscriptionStore";
import type { Customer } from "@/src/core/types";
import { CustomerCard } from "../components/CustomerCard";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { useCustomerStore } from "../store/customerStore";
import { usePaymentStore } from "../../customer-payments/store/paymentStore";
import { useCurrencyStore } from "../../currencies/store/currencyStore";
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
import { useEffectiveBranchFilter } from "@/src/shared/lib/branchFilter";
import { MONTHS } from "@/src/core/constants";

type FilterTab = "all" | "unpaid" | "active" | "inactive";

export function CustomerListScreen() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const graceDays = useGraceDays();
  const currentTier = useSubscriptionStore((s) => s.currentTier);
  const {
    customers,
    totalCount,
    loading,
    loadingMore,
    error,
    fetchCustomers,
    fetchMoreCustomers,
    setSearchQuery,
    clearError,
    deactivateCustomer,
    reactivateCustomer,
    deleteCustomer,
  } = useCustomerStore();
  const {
    currentMonthPaidIds,
    fetchCurrentMonthPaidIds,
    createPayment,
    createMultiMonthPayment,
    error: paymentError,
    clearError: clearPaymentError,
  } = usePaymentStore();
  const { currencies } = useCurrencyStore();
  const [formVisible, setFormVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("active");
  const [quickPayCustomerId, setQuickPayCustomerId] = useState<string | null>(
    null,
  );
  const [multiMonthConfirm, setMultiMonthConfirm] = useState<{
    customer: Customer;
    monthsLabel: string;
    amountLabel: string;
  } | null>(null);
  const [menuCustomer, setMenuCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(
    null,
  );
  const [toggleActiveCustomer, setToggleActiveCustomer] =
    useState<Customer | null>(null);
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();

  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch]);

  // Loads on mount AND re-fetches when the user switches the branch chip.
  useEffect(() => {
    fetchCustomers();
    fetchCurrentMonthPaidIds();
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
  }, [customers, currentMonthPaidIds, t]);

  const filtered = useMemo(() => {
    if (activeTab === "active") return customers.filter((c) => c.active);
    if (activeTab === "inactive") return customers.filter((c) => !c.active);
    if (activeTab === "unpaid")
      return customers.filter(
        (c) => c.active && c.isRegular && !currentMonthPaidIds.has(c.id),
      );
    return customers;
  }, [activeTab, customers, currentMonthPaidIds]);

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

  function handleQuickPay(customer: Customer) {
    if (!customer.plan || customer.plan.isCustomPrice) {
      router.push({
        pathname: "/(app)/(tabs)/customers/[id]",
        params: { id: customer.id, quickPay: "1" },
      });
      return;
    }
    if (customer.plan.durationMonths > 1) {
      if (customer.plan.price === null) return;
      const { year, month } = getCurrentYearMonth();
      const startMonth = toBillingMonth(year, month);
      const planCurrency = findCurrency(currencies, customer.plan.currencyId);
      setMultiMonthConfirm({
        customer,
        monthsLabel: getBlockRangeLabel(
          startMonth,
          customer.plan.durationMonths,
          t,
        ),
        amountLabel: formatMoney(
          customer.plan.price,
          planCurrency,
          planCurrency,
          locale,
        ),
      });
      return;
    }
    void recordSingleMonth(customer);
  }

  async function confirmMultiMonth() {
    if (!multiMonthConfirm || !user) return;
    const { customer } = multiMonthConfirm;
    if (!customer.plan || customer.plan.price === null) return;
    const { year, month } = getCurrentYearMonth();
    const startMonth = toBillingMonth(year, month);
    const planCurrency = findCurrency(currencies, customer.plan.currencyId);
    setQuickPayCustomerId(customer.id);
    try {
      if (!currentTier) return;
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
      setMultiMonthConfirm(null);
    }
  }

  function shouldShowQuickPay(customer: Customer): boolean {
    if (!customer.active || !customer.isRegular) return false;
    if (currentMonthPaidIds.has(customer.id)) return false;
    const { year, month } = getCurrentYearMonth();
    if (isBeforeStartDate(year, month, customer.startDate)) return false;
    return true;
  }

  const openMenu = useCallback((customer: Customer) => {
    setMenuCustomer(customer);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => (
      <CustomerCard
        customer={item}
        isPaidThisMonth={currentMonthPaidIds.has(item.id)}
        monthLabel={monthLabel}
        onPress={openDetail}
        onMenu={openMenu}
        menuLoading={quickPayCustomerId === item.id}
      />
    ),
    [currentMonthPaidIds, monthLabel, openDetail, openMenu, quickPayCustomerId],
  );

  async function confirmToggleActive() {
    if (!toggleActiveCustomer) return;
    const { id, active } = toggleActiveCustomer;
    if (active) {
      await deactivateCustomer(id);
    } else {
      await reactivateCustomer(id);
    }
    setToggleActiveCustomer(null);
  }

  async function confirmDeleteCustomer() {
    if (!deletingCustomer) return;
    await deleteCustomer(deletingCustomer.id);
    setDeletingCustomer(null);
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
        onPress: () => setToggleActiveCustomer(customer),
      });
      items.push({
        key: "delete",
        label: t("common.delete"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => setDeletingCustomer(customer),
      });
    }
    return items;
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("customers.title")}
        subtitle={t("customers.total_count", { count: totalCount })}
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
                fetchCurrentMonthPaidIds();
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

      <ConfirmDialog
        visible={multiMonthConfirm !== null}
        title={t("payments.quick_pay.confirm_multi_month_title")}
        message={
          multiMonthConfirm
            ? t("payments.quick_pay.confirm_multi_month_message", {
                amount: multiMonthConfirm.amountLabel,
                months: multiMonthConfirm.monthsLabel,
              })
            : ""
        }
        confirmLabel={t("payments.quick_pay.confirm")}
        onConfirm={confirmMultiMonth}
        onCancel={() => setMultiMonthConfirm(null)}
      />

      <ActionMenu
        visible={menuCustomer !== null}
        title={menuCustomer?.name}
        actions={buildMenuActions(menuCustomer)}
        onDismiss={() => setMenuCustomer(null)}
      />

      <ConfirmDialog
        visible={deletingCustomer !== null}
        title={t("customers.delete_title")}
        message={
          deletingCustomer
            ? t("customers.delete_message", { name: deletingCustomer.name })
            : ""
        }
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={confirmDeleteCustomer}
        onCancel={() => setDeletingCustomer(null)}
      />

      <ConfirmDialog
        visible={toggleActiveCustomer !== null}
        title={
          toggleActiveCustomer
            ? toggleActiveCustomer.active
              ? t("customers.deactivate_title")
              : t("customers.reactivate_title")
            : ""
        }
        message={
          toggleActiveCustomer
            ? toggleActiveCustomer.active
              ? t("customers.deactivate_message", {
                  name: toggleActiveCustomer.name,
                })
              : t("customers.reactivate_message", {
                  name: toggleActiveCustomer.name,
                })
            : ""
        }
        destructive={toggleActiveCustomer?.active ?? false}
        onConfirm={confirmToggleActive}
        onCancel={() => setToggleActiveCustomer(null)}
      />
    </SafeAreaView>
  );
}
