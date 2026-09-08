import { useMemo, useRef, useState } from "react";
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

type TransactionsTab = "sales" | "debts" | "expenses";

// The Transactions hub: a single bottom tab hosting Sales, Debts and Expenses as
// in-page segments. Owns the page chrome; each panel owns its body.
// (Payments history moved out to a quick-actions sheet — PaymentsHistorySheet.
// Services are not a segment: a service is a LINE ON A SALE, so the Sales tab
// already lists it, and its price list lives at Admin → Services.)
export function TransactionsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<TransactionsTab>("debts");
  const saleDetail = useSaleDetailSheet();

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const segments: Segment<TransactionsTab>[] = useMemo(
    () => [
      { key: "debts", label: t("transactions.tab_debts") },
      { key: "sales", label: t("transactions.tab_sales") },
      ...(isAdmin
        ? [{ key: "expenses" as const, label: t("transactions.tab_expenses") }]
        : []),
    ],
    [t, isAdmin],
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
      <PageHeader title={t("transactions.title")} />

      <ResponsiveContainer>
        <View className="px-4 py-3">
          <SegmentedTabs<TransactionsTab> {...tabsProps} />
        </View>
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
    </SafeAreaView>
  );
}
