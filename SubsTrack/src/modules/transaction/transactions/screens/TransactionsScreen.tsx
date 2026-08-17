import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useHorizontalSwipe } from "@/src/shared/hooks/useHorizontalSwipe";
import {
  SegmentedTabs,
  type Segment,
} from "@/src/shared/components/SegmentedTabs";
import { SalesPanel } from "@/src/modules/transaction/sales";
import { DebtsPanel } from "@/src/modules/transaction/debts";
import { ExpensesPanel } from "@/src/modules/transaction/expenses";
import { ServicesPanel } from "./ServicesPanel";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { useAuth } from "@/src/modules/authentication/auth";

type TransactionsTab = "sales" | "debts" | "expenses" | "services";

// The Transactions hub: a single bottom tab hosting Sales, Debts, Expenses and
// (future) Services as in-page segments. Owns the page chrome; each panel owns
// its body. (Payments history moved out to a quick-actions sheet —
// PaymentsHistorySheet.)
export function TransactionsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<TransactionsTab>("debts");

  // Expenses are admin-only (rent/salaries), matching the RLS on the table —
  // dropping the segment is what keeps it off a collector's screen.
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const segments: Segment<TransactionsTab>[] = useMemo(
    () => [
      { key: "debts", label: t("transactions.tab_debts") },
      { key: "sales", label: t("transactions.tab_sales") },
      ...(isAdmin
        ? [{ key: "expenses" as const, label: t("transactions.tab_expenses") }]
        : []),
      { key: "services", label: t("transactions.tab_services") },
    ],
    [t, isAdmin],
  );

  // Swipe left/right moves to the neighbouring tab (clamped at the ends).
  const step = useCallback(
    (delta: number) =>
      setTab((current) => {
        const i = segments.findIndex((s) => s.key === current);
        const next = i + delta;
        if (next < 0 || next >= segments.length) return current;
        return segments[next].key;
      }),
    [segments],
  );
  const swipe = useHorizontalSwipe({
    onNext: () => step(1),
    onPrev: () => step(-1),
  });

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <PageHeader title={t("transactions.title")} />

      <ResponsiveContainer>
        <View className="px-4 py-3">
          <SegmentedTabs<TransactionsTab>
            value={tab}
            onChange={setTab}
            segments={segments}
          />
        </View>
      </ResponsiveContainer>

      <GestureDetector gesture={swipe}>
        <View className="flex-1">
          {tab === "sales" ? <SalesPanel /> : null}
          {tab === "debts" ? <DebtsPanel /> : null}
          {tab === "expenses" && isAdmin ? <ExpensesPanel /> : null}
          {tab === "services" ? <ServicesPanel /> : null}
        </View>
      </GestureDetector>
    </SafeAreaView>
  );
}
