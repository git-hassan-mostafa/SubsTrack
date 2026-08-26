import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
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
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useDebtSlice } from "@/src/state/hooks/useDebtSlice";
import {
  groupDebtors,
  sumDebtNetUsd,
  type Debtor,
} from "../utils/debtAggregations";
import { useDebtRowActions } from "../hooks/useDebtRowActions";
import { DebtorCard } from "../components/DebtorCard";
import { DebtorDetailSheet } from "../components/DebtorDetailSheet";
import { CustomDebtFormSheet } from "../components/CustomDebtFormSheet";
import { DebtPaymentFormSheet } from "../components/DebtPaymentFormSheet";
import { DebtHistorySheet } from "../components/DebtHistorySheet";

// The Debts segment of the Transactions hub: a single debtors list — one row per
// customer who still owes money; tap → detail modal (debts history + debt
// payments history, plus add/pay/void actions). The slice holds the full branch
// dataset; the net summary is derived here client-side (no re-fetch on search).
export function DebtsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  const items = useDebtSlice((s) => s.items);
  const payments = useDebtSlice((s) => s.payments);
  const loading = useDebtSlice((s) => s.loading);
  const error = useDebtSlice((s) => s.error);
  const fetchDebts = useDebtSlice((s) => s.fetchDebts);
  const addDebtPayment = useDebtSlice((s) => s.addDebtPayment);
  const clearError = useDebtSlice((s) => s.clearError);

  // The per-row actions are shared with the customer-detail panel.
  const { payItem, completeItem, voidItem, voidPayment } = useDebtRowActions();

  const branchFilter = useEffectiveBranchFilter();
  const [debtorSearch, setDebtorSearch] = useState("");
  const debouncedDebtorSearch = useDebounce(debtorSearch);
  const [openDebtorId, setOpenDebtorId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customDebtOpen, setCustomDebtOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuDebtor, setMenuDebtor] = useState<Debtor | null>(null);

  useEffect(() => {
    fetchDebts();
  }, [branchFilter, fetchDebts]);

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
        {/* Net summary — amount only; the clock opens the branch-wide history. */}
        <View className="px-4 pt-3 flex-row items-center justify-between">
          <Text
            fontWeight="Bold"
            accessibilityLabel={t("debts.total_outstanding")}
            className={`text-2xl ${isCredit ? "text-green-600" : "text-gray-900"}`}
            numberOfLines={1}
          >
            {isCredit ? `- ${netLabel}` : netLabel}
          </Text>
          <PressableOpacity
            onPress={() => setHistoryOpen(true)}
            accessibilityLabel={t("debts.history_hint")}
            className="w-9 h-9 rounded-full bg-indigo-50 items-center justify-center"
          >
            <Ionicons name="time-outline" size={18} color={COLORS.primary} />
          </PressableOpacity>
        </View>

        {/* Search — by customer name. */}
        <View className="px-4 pt-2">
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
            iconBadge: "add",
            onPress: () => setCustomDebtOpen(true),
          },
          {
            key: "payment",
            label: t("debts.record_debt_payment"),
            icon: "cash-outline",
            iconBadge: "add",
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
            icon: "checkmark-done-outline",
            onPress: () => menuDebtor && void handlePayDebtor(menuDebtor),
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
          onPay={payItem}
          onComplete={completeItem}
          onVoidItem={voidItem}
          onVoidPayment={voidPayment}
        />
      )}

      {customDebtOpen && (
        <CustomDebtFormSheet onDismiss={() => setCustomDebtOpen(false)} />
      )}
      {paymentOpen && (
        <DebtPaymentFormSheet onDismiss={() => setPaymentOpen(false)} />
      )}

      {historyOpen && (
        <DebtHistorySheet
          items={items}
          payments={payments}
          onDismiss={() => setHistoryOpen(false)}
          onPay={payItem}
          onComplete={completeItem}
          onVoidItem={voidItem}
          onVoidPayment={voidPayment}
        />
      )}
    </View>
  );
}
