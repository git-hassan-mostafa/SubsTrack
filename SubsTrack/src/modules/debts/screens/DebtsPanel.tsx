import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { FAB } from "@/src/shared/components/FAB";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { Dropdown, type DropdownOption } from "@/src/shared/components/Dropdown";
import { CustomerPicker } from "@/src/modules/customers";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { useAuth } from "@/src/modules/auth";
import { confirm } from "@/src/shared/lib/confirm";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useDebtSlice } from "@/src/state/hooks/useDebtSlice";
import type { DebtViewFilter } from "@/src/state/slices/debts/debtSlice";
import type { DebtItem, DebtPaymentItem } from "@/src/core/types";
import { DebtItemCard } from "../components/DebtItemCard";
import { DebtPaymentCard } from "../components/DebtPaymentCard";
import { CustomDebtFormSheet } from "../components/CustomDebtFormSheet";
import { DebtPaymentFormSheet } from "../components/DebtPaymentFormSheet";

type Row =
  | { kind: "item"; item: DebtItem }
  | { kind: "payment"; payment: DebtPaymentItem };

// The Debts segment of the Transactions hub: a flat list of every debt item
// (partial months, partial sales, custom debts) across customers, filterable by
// category + customer, with a net summary header. The "Payments" chip switches
// the list to the debt-payment rows. Add via the FAB menu.
export function DebtsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();

  const items = useDebtSlice((s) => s.items);
  const payments = useDebtSlice((s) => s.payments);
  const summary = useDebtSlice((s) => s.summary);
  const loading = useDebtSlice((s) => s.loading);
  const error = useDebtSlice((s) => s.error);
  const customerFilter = useDebtSlice((s) => s.customerFilter);
  const categoryFilter = useDebtSlice((s) => s.categoryFilter);
  const fetchDebts = useDebtSlice((s) => s.fetchDebts);
  const setCustomerFilter = useDebtSlice((s) => s.setCustomerFilter);
  const setCategoryFilter = useDebtSlice((s) => s.setCategoryFilter);
  const clearFilters = useDebtSlice((s) => s.clearFilters);
  const addDebtPayment = useDebtSlice((s) => s.addDebtPayment);
  const voidCustomDebt = useDebtSlice((s) => s.voidCustomDebt);
  const voidDebtPayment = useDebtSlice((s) => s.voidDebtPayment);
  const clearError = useDebtSlice((s) => s.clearError);

  const branchFilter = useEffectiveBranchFilter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  useEffect(() => {
    fetchDebts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  const target = findCurrency(currencies, displayCurrencyId);
  const showingPayments = categoryFilter === "payments";

  const rows: Row[] = useMemo(() => {
    if (showingPayments) return payments.map((p) => ({ kind: "payment", payment: p }));
    const filtered =
      categoryFilter === "all" ? items : items.filter((i) => i.category === categoryFilter);
    return filtered.map((i) => ({ kind: "item", item: i }));
  }, [showingPayments, payments, items, categoryFilter]);

  const categoryOptions: DropdownOption<DebtViewFilter>[] = [
    { label: t("debts.category_all"), value: "all" },
    { label: t("debts.category_months"), value: "months" },
    { label: t("debts.category_sales"), value: "sales" },
    { label: t("debts.category_custom"), value: "custom" },
    { label: t("debts.category_payments"), value: "payments" },
  ];

  const hasActiveFilters = !!customerFilter || categoryFilter !== "all";
  const net = summary.netUsd;
  const isCredit = net < -1e-9;
  const netLabel = formatMoney(Math.abs(net), null, target);

  // Pay off a debt row by recording a debt payment equal to its remaining
  // amount, in the row's own currency. This never touches the underlying
  // payment/sale — it only offsets the customer's runtime debt total.
  async function handlePayItem(item: DebtItem) {
    if (!user) return;
    const source = findCurrency(currencies, item.currencyId);
    const ok = await confirm({
      title: t("debts.pay_title"),
      message: t("debts.pay_message", {
        amount: formatMoney(item.remaining, source, target),
        customer: item.customerName,
      }),
      confirmLabel: t("debts.pay"),
    });
    if (!ok) return;
    await addDebtPayment({
      customerId: item.customerId,
      amount: item.remaining,
      notes: null,
      currency: source,
      receivedByUserId: user.id,
      tenantId: user.tenantId,
    });
  }

  async function handleVoidItem(item: DebtItem) {
    if (!user || item.category !== "custom") return;
    const ok = await confirm({
      title: t("debts.void_custom_title"),
      message: t("debts.void_custom_message"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (ok) await voidCustomDebt(item.id, user.id, null);
  }

  async function handleVoidPayment(p: DebtPaymentItem) {
    if (!user) return;
    const ok = await confirm({
      title: t("debts.void_payment_title"),
      message: t("debts.void_payment_message"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (ok) await voidDebtPayment(p.id, user.id, null);
  }

  return (
    <View className="flex-1">
      <ResponsiveContainer className="flex-1">
        {/* Net summary header */}
        <View className="px-4 pt-4">
          <View className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex-row items-center justify-between">
            <View className="flex-1 pe-2">
              <Text className="text-xs text-gray-500 uppercase tracking-wide" numberOfLines={1}>
                {customerFilter ? customerFilter.name : t("debts.total_outstanding")}
              </Text>
              <Text className="text-[11px] text-gray-400 mt-0.5" numberOfLines={1}>
                {t("debts.summary_breakdown", {
                  debts: formatMoney(summary.grossUsd, null, target),
                  paid: formatMoney(summary.paymentsUsd, null, target),
                })}
              </Text>
            </View>
            <View className="items-end">
              <Text fontWeight="Bold" className={`text-xl ${isCredit ? "text-green-600" : "text-gray-900"}`}>
                {isCredit ? `- ${netLabel}` : netLabel}
              </Text>
              {isCredit ? (
                <Text className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">
                  {t("debts.credit")}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Filters */}
        <View className="px-4 pt-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            className="-mx-4"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}
          >
            <Dropdown<DebtViewFilter>
              options={categoryOptions}
              value={categoryFilter}
              onChange={(v) => setCategoryFilter(v ?? "all")}
              triggerStyle="chip"
            />
            <CustomerPicker
              placeholder={t("debts.filter_by_customer")}
              value={customerFilter}
              onChange={setCustomerFilter}
              nullable
              nullLabel={t("debts.all_customers")}
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

        {error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}

        {loading && rows.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => (r.kind === "item" ? `i-${r.item.id}` : `p-${r.payment.id}`)}
            contentContainerStyle={{ padding: 16, paddingBottom: 96, flexGrow: 1 }}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={fetchDebts} tintColor={COLORS.primary} />
            }
            renderItem={({ item: row }) =>
              row.kind === "payment" ? (
                <DebtPaymentCard payment={row.payment} onVoid={handleVoidPayment} />
              ) : (
                <DebtItemCard
                  item={row.item}
                  onPay={handlePayItem}
                  onVoid={row.item.category === "custom" ? handleVoidItem : undefined}
                />
              )
            }
            ListEmptyComponent={
              <EmptyState
                message={showingPayments ? t("debts.no_payments") : t("debts.no_debts")}
                subMessage={showingPayments ? t("debts.no_payments_hint") : t("debts.no_debts_hint")}
              />
            }
          />
        )}

        <FAB onPress={() => setMenuOpen(true)} accessibilityLabel={t("debts.add")} />
      </ResponsiveContainer>

      <ActionMenu
        visible={menuOpen}
        title={t("debts.add")}
        onDismiss={() => setMenuOpen(false)}
        actions={[
          {
            key: "custom_debt",
            label: t("debts.add_custom_debt"),
            icon: "document-text-outline",
            onPress: () => setCustomDebtOpen(true),
          },
          {
            key: "payment",
            label: t("debts.record_debt_payment"),
            icon: "cash-outline",
            onPress: () => setPaymentOpen(true),
          },
        ]}
      />

      {customDebtOpen && (
        <CustomDebtFormSheet
          initialCustomer={customerFilter}
          onDismiss={() => setCustomDebtOpen(false)}
        />
      )}
      {paymentOpen && (
        <DebtPaymentFormSheet
          initialCustomer={customerFilter}
          onDismiss={() => setPaymentOpen(false)}
        />
      )}
    </View>
  );
}
