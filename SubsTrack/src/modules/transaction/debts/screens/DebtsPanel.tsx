import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { FAB } from "@/src/shared/components/FAB";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { useAuth } from "@/src/modules/authentication/auth";
import { confirm } from "@/src/shared/lib/confirm";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useDebtSlice } from "@/src/state/hooks/useDebtSlice";
import type { DebtItem, DebtPaymentItem } from "@/src/core/types";
import { groupDebtors, sumDebtNetUsd, type Debtor } from "../utils/debtAggregations";
import { DebtorCard } from "../components/DebtorCard";
import { DebtorDetailSheet } from "../components/DebtorDetailSheet";
import { CustomDebtFormSheet } from "../components/CustomDebtFormSheet";
import { DebtPaymentFormSheet } from "../components/DebtPaymentFormSheet";

// The Debts segment of the Transactions hub: a single debtors list — one row per
// customer who still owes money; tap → detail modal (debts history + debt
// payments history, plus add/pay/void actions). The slice holds the full branch
// dataset; the net summary is derived here client-side (no re-fetch on search).
export function DebtsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();

  const items = useDebtSlice((s) => s.items);
  const payments = useDebtSlice((s) => s.payments);
  const loading = useDebtSlice((s) => s.loading);
  const error = useDebtSlice((s) => s.error);
  const fetchDebts = useDebtSlice((s) => s.fetchDebts);
  const addDebtPayment = useDebtSlice((s) => s.addDebtPayment);
  const voidCustomDebt = useDebtSlice((s) => s.voidCustomDebt);
  const voidDebtPayment = useDebtSlice((s) => s.voidDebtPayment);
  const clearError = useDebtSlice((s) => s.clearError);

  const branchFilter = useEffectiveBranchFilter();
  const [debtorSearch, setDebtorSearch] = useState("");
  const debouncedDebtorSearch = useDebounce(debtorSearch);
  const [openDebtorId, setOpenDebtorId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [menuDebtor, setMenuDebtor] = useState<Debtor | null>(null);

  useEffect(() => {
    fetchDebts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  const target = findCurrency(currencies, displayCurrencyId);

  const debtors = useMemo(
    () => groupDebtors(items, payments),
    [items, payments],
  );

  // Debtors search is client-side, by customer name only.
  const visibleDebtors = useMemo(() => {
    const q = debouncedDebtorSearch.trim().toLowerCase();
    if (!q) return debtors;
    return debtors.filter((d) => d.customerName.toLowerCase().includes(q));
  }, [debtors, debouncedDebtorSearch]);

  // Branch-wide net summary across every debtor.
  const summary = useMemo(
    () => sumDebtNetUsd(items, payments),
    [items, payments],
  );

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

  // Pay off a debtor's WHOLE net in one shot: a single debt payment equal to
  // their net debt, recorded in USD (the net is USD-canonical, so this clears
  // the total exactly — the service caps at the net owed either way).
  async function handlePayDebtor(debtor: Debtor) {
    if (!user) return;
    const ok = await confirm({
      title: t("debts.pay_full_title"),
      message: t("debts.pay_full_message", {
        amount: formatMoney(debtor.netUsd, null, target),
        customer: debtor.customerName,
      }),
      confirmLabel: t("debts.pay"),
    });
    if (!ok) return;
    await addDebtPayment({
      customerId: debtor.customerId,
      amount: debtor.netUsd,
      notes: null,
      currency: null,
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

  // Re-derived from the slice each render so a pay/void/add in the modal reflects
  // live. Name falls back to the row data so the title survives after the
  // customer is fully paid off and drops out of the debtors list.
  const openDebtor = useMemo(() => {
    if (!openDebtorId) return null;
    const di = items.filter((i) => i.customerId === openDebtorId);
    const dp = payments.filter((p) => p.customerId === openDebtorId);
    const name =
      debtors.find((d) => d.customerId === openDebtorId)?.customerName ??
      di[0]?.customerName ??
      dp[0]?.customerName ??
      "";
    return { items: di, payments: dp, name };
  }, [openDebtorId, items, payments, debtors]);

  return (
    <View className="flex-1">
      <ResponsiveContainer className="flex-1">
        {/* Net summary header */}
        <View className="px-4 pt-3">
          <View className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex-row items-center justify-between">
            <View className="flex-1 pe-2">
              <Text
                className="text-xs text-gray-500 uppercase tracking-wide"
                numberOfLines={1}
              >
                {t("debts.total_outstanding")}
              </Text>
              <Text
                className="text-[11px] text-gray-400 mt-0.5"
                numberOfLines={1}
              >
                {t("debts.summary_breakdown", {
                  debts: formatMoney(summary.grossUsd, null, target),
                  paid: formatMoney(summary.paymentsUsd, null, target),
                })}
              </Text>
            </View>
            <View className="items-end">
              <Text
                fontWeight="Bold"
                className={`text-xl ${isCredit ? "text-green-600" : "text-gray-900"}`}
              >
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

        {/* Search — by customer name. */}
        <View className="px-4 pt-3">
          <SearchTextBox
            searchText={debtorSearch}
            setSearchText={setDebtorSearch}
            placeholder={t("debts.search_debtors_hint")}
          />
        </View>

        {error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}

        {/* Body */}
        {loading && debtors.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={visibleDebtors}
            keyExtractor={(d) => d.customerId}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 96,
              flexGrow: 1,
            }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={fetchDebts}
                tintColor={COLORS.primary}
              />
            }
            renderItem={({ item: d }) => (
              <DebtorCard
                debtor={d}
                onPress={() => setOpenDebtorId(d.customerId)}
                onMenu={() => setMenuDebtor(d)}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                message={t("debts.no_debtors")}
                subMessage={
                  debouncedDebtorSearch.trim()
                    ? t("debts.no_debtors_search")
                    : t("debts.no_debtors_hint")
                }
              />
            }
          />
        )}

        <FAB
          onPress={() => setMenuOpen(true)}
          accessibilityLabel={t("debts.add")}
        />
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

      <ActionMenu
        visible={!!menuDebtor}
        title={menuDebtor?.customerName}
        onDismiss={() => setMenuDebtor(null)}
        actions={[
          {
            key: "pay_full",
            label: t("debts.pay_full"),
            icon: "cash-outline",
            onPress: () => {
              const d = menuDebtor;
              if (d) void handlePayDebtor(d);
            },
          },
        ]}
      />

      {openDebtor && openDebtorId && (
        <DebtorDetailSheet
          customerId={openDebtorId}
          customerName={openDebtor.name}
          items={openDebtor.items}
          payments={openDebtor.payments}
          onDismiss={() => setOpenDebtorId(null)}
          onPay={handlePayItem}
          onVoidItem={handleVoidItem}
          onVoidPayment={handleVoidPayment}
        />
      )}

      {customDebtOpen && (
        <CustomDebtFormSheet onDismiss={() => setCustomDebtOpen(false)} />
      )}
      {paymentOpen && (
        <DebtPaymentFormSheet onDismiss={() => setPaymentOpen(false)} />
      )}
    </View>
  );
}
