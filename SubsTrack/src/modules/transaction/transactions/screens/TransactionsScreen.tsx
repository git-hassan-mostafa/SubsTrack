import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Screen } from "@/src/shared/components/Screen";
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
import { ToCollectPanel } from "@/src/modules/transaction/to-collect";
import { ExpensesPanel } from "@/src/modules/transaction/expenses";
import {
  PageHeader,
  type PageHeaderTools,
} from "@/src/shared/components/PageHeader";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useExportRows } from "@/src/shared/hooks/useExportRows";
import { loadAllPages } from "@shared/shared/hooks/loadAllPages";
import { getStore } from "@shared/state/globalStore";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useSaleSlice } from "@shared/state/hooks/useSaleSlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useExpenseStore } from "@shared/modules/transaction/expenses/state/expenseStore";

type TransactionsTab = "sales" | "debts" | "expenses";

// Each panel draws `header` itself so its search, filters and selection reach it.
export function TransactionsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<TransactionsTab>("sales");
  const saleDetail = useSaleDetailSheet();

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const segments: Segment<TransactionsTab>[] = useMemo(
    () => [
      { key: "sales", label: t("transactions.tab_sales") },
      { key: "debts", label: t("transactions.tab_to_collect") },
      ...(isAdmin
        ? [{ key: "expenses" as const, label: t("transactions.tab_expenses") }]
        : []),
    ],
    [t, isAdmin],
  );

  const sales = useSaleSlice((s) => s.items);
  const debtors = useLedgerSlice((s) => s.toCollect?.customers);
  const expenses = useExpenseStore((s) => s.items);
  const rowsByTab: Record<TransactionsTab, object[]> = {
    sales,
    debts: debtors ?? [],
    expenses,
  };
  const nameByTab: Record<TransactionsTab, string> = {
    sales: "sales.title",
    debts: "transactions.tab_to_collect",
    expenses: "expenses.title",
  };
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

  const { swipe, tabsProps } = useSwipeableTabs({
    segments,
    value: tab,
    onChange: setTab,
  });

  const header = (tools: PageHeaderTools) => (
    <>
      <PageHeader
        title={t("transactions.title")}
        iconActions={exportIconActions}
        {...tools}
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
    </>
  );

  return (
    <Screen edges={[]}>
      <GestureDetector gesture={swipe}>
        <View className="flex-1">
          {tab === "sales" ? <SalesPanel header={header} /> : null}
          {tab === "debts" ? (
            <ToCollectPanel header={header} onOpenSale={saleDetail.openSale} />
          ) : null}
          {tab === "expenses" && isAdmin ? (
            <ExpensesPanel header={header} />
          ) : null}
        </View>
      </GestureDetector>

      {saleDetail.sheet}
      {exportSheet}
    </Screen>
  );
}
