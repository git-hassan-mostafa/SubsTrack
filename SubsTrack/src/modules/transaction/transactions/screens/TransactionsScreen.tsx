import { useCallback, useMemo, useRef, useState } from "react";
import { View, type ScrollView } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useSwipeableTabs } from "@/src/shared/hooks/useSwipeableTabs";
import {
  SegmentedTabs,
  type Segment,
} from "@/src/shared/components/SegmentedTabs";
import {
  SalesPanel,
  useSaleDetailSheet,
} from "@/src/modules/transaction/sales";
import { DebtsPanel } from "@/src/modules/transaction/debts";
import { ExpensesPanel } from "@/src/modules/transaction/expenses";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { useAuth } from "@/src/modules/authentication/auth";
import { useExportRows } from "@/src/shared/hooks/useExportRows";
import { loadAllPages } from "@/src/shared/hooks/loadAllPages";
import { getStore } from "@/src/state/globalStore";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useExpenseStore } from "@/src/modules/transaction/expenses/state/expenseStore";

type TransactionsTab = "sales" | "debts" | "expenses";

// The Transactions hub: a single bottom tab hosting Sales, Debts and Expenses as
// in-page segments. Owns the page chrome; each panel owns its body.
// (Payments history moved out to a quick-actions sheet — PaymentsHistorySheet.
// Services are not a segment: a service is a LINE ON A SALE, so the Sales tab
// already lists it, and its price list lives at Admin → Services.)
export function TransactionsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<TransactionsTab>("sales");
  const saleDetail = useSaleDetailSheet();

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const segments: Segment<TransactionsTab>[] = useMemo(
    () => [
      { key: "sales", label: t("transactions.tab_sales") },
      { key: "debts", label: t("transactions.tab_debts") },
      ...(isAdmin
        ? [{ key: "expenses" as const, label: t("transactions.tab_expenses") }]
        : []),
    ],
    [t, isAdmin],
  );

  // Each panel renders one of these slices, so reading them here exports the
  // rows that tab is showing without lifting three lists out of their panels.
  const sales = useSaleSlice((s) => s.items);
  const debtors = useLedgerSlice((s) => s.debts?.customers);
  const expenses = useExpenseStore((s) => s.items);
  const rowsByTab: Record<TransactionsTab, object[]> = {
    sales,
    debts: debtors ?? [],
    expenses,
  };
  const nameByTab: Record<TransactionsTab, string> = {
    sales: "sales.title",
    debts: "transactions.tab_debts",
    expenses: "expenses.title",
  };
  // Only Sales pages; Debts and Expenses already hold their whole list, so on
  // those tabs there is nothing more to fetch and no question to ask.
  const salesHasMore = useSaleSlice((s) => s.hasMore);
  const fetchMoreSales = useSaleSlice((s) => s.fetchMoreSales);
  const loadAllSales = useCallback(
    () =>
      loadAllPages(
        () => getStore().getState().sales.items,
        () => getStore().getState().sales.hasMore,
        fetchMoreSales,
      ),
    [fetchMoreSales],
  );

  const {
    iconActions: exportIconActions,
    exportError,
    clearExportError,
    exportSheet,
  } = useExportRows(
    nameByTab[tab],
    rowsByTab[tab],
    tab === "sales"
      ? { loadMore: { hasMore: salesHasMore, loadAll: loadAllSales } }
      : {},
  );

  const filterRowRef = useRef<ScrollView | null>(null);
  const blockedBy = useMemo(() => [filterRowRef], []);
  const { swipe, tabsProps } = useSwipeableTabs({
    segments,
    value: tab,
    onChange: setTab,
    blockedBy,
  });

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <PageHeader
        title={t("transactions.title")}
        iconActions={exportIconActions}
      />

      <ResponsiveContainer>
        <View className="px-4 py-3">
          <SegmentedTabs<TransactionsTab> {...tabsProps} />
        </View>
        {exportError ? (
          <View className="px-4 pb-3">
            <ErrorBanner message={exportError} onDismiss={clearExportError} />
          </View>
        ) : null}
      </ResponsiveContainer>

      <GestureDetector gesture={swipe}>
        <View className="flex-1">
          {tab === "sales" ? <SalesPanel filterRowRef={filterRowRef} /> : null}
          {tab === "debts" ? (
            <DebtsPanel onOpenSale={saleDetail.openSale} />
          ) : null}
          {tab === "expenses" && isAdmin ? (
            <ExpensesPanel filterRowRef={filterRowRef} />
          ) : null}
        </View>
      </GestureDetector>

      {saleDetail.sheet}
      {exportSheet}
    </SafeAreaView>
  );
}
