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
import { SalesPanel } from "@/src/modules/sales";
import { PaymentsPanel } from "@/src/modules/customer-payments";
import { DebtsPanel } from "@/src/modules/debts";
import { ServicesPanel } from "./ServicesPanel";
import { PageHeader } from "@/src/shared/components/PageHeader";

type TransactionsTab = "sales" | "payments" | "debts" | "services";

// The Transactions hub: a single bottom tab hosting Sales, Payments, and (future)
// Services as in-page segments. Owns the page chrome; each panel owns its body.
export function TransactionsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TransactionsTab>("payments");

  const segments: Segment<TransactionsTab>[] = useMemo(
    () => [
      { key: "payments", label: t("transactions.tab_payments") },
      { key: "debts", label: t("transactions.tab_debts") },
      { key: "sales", label: t("transactions.tab_sales") },
      { key: "services", label: t("transactions.tab_services") },
    ],
    [t],
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
          {tab === "payments" ? <PaymentsPanel /> : null}
          {tab === "debts" ? <DebtsPanel /> : null}
          {tab === "services" ? <ServicesPanel /> : null}
        </View>
      </GestureDetector>
    </SafeAreaView>
  );
}
