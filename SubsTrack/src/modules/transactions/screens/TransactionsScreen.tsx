import { useMemo, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { BranchSelector } from "@/src/shared/components/BranchSelector";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import {
  SegmentedTabs,
  type Segment,
} from "@/src/shared/components/SegmentedTabs";
import { SalesPanel } from "@/src/modules/sales";
import { PaymentsPanel } from "@/src/modules/customer-payments";
import { DebtsPanel } from "@/src/modules/debts";
import { ServicesPanel } from "./ServicesPanel";

type TransactionsTab = "sales" | "payments" | "debts" | "services";

// The Transactions hub: a single bottom tab hosting Sales, Payments, and (future)
// Services as in-page segments. Owns the page chrome; each panel owns its body.
export function TransactionsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TransactionsTab>("sales");

  const segments: Segment<TransactionsTab>[] = useMemo(
    () => [
      { key: "sales", label: t("transactions.tab_sales") },
      { key: "payments", label: t("transactions.tab_payments") },
      { key: "debts", label: t("transactions.tab_debts") },
      { key: "services", label: t("transactions.tab_services") },
    ],
    [t],
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 bg-white border-b border-gray-100 gap-2">
        <Text fontWeight="Bold" className="text-2xl text-gray-900 flex-1">
          {t("transactions.title")}
        </Text>
        <BranchSelector className="self-start" />
      </View>

      <ResponsiveContainer>
        <View className="px-4 py-3">
          <SegmentedTabs<TransactionsTab>
            value={tab}
            onChange={setTab}
            segments={segments}
          />
        </View>
      </ResponsiveContainer>

      <View className="flex-1">
        {tab === "sales" ? <SalesPanel /> : null}
        {tab === "payments" ? <PaymentsPanel /> : null}
        {tab === "debts" ? <DebtsPanel /> : null}
        {tab === "services" ? <ServicesPanel /> : null}
      </View>
    </SafeAreaView>
  );
}
