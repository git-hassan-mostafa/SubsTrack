import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { Currency, PlanPriceChange, PlanUsage } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { usageMonthPriceLabel } from "@shared/modules/admin/plans/utils/planLabels";
import { usageMonthPriceRows } from "@shared/modules/admin/plans/utils/usageMonthPrices";

interface Props {
  usage: PlanUsage;
  currencies: Currency[];
  sortedHistory: PlanPriceChange[];
  loading: boolean;
  error?: string | null;
  clearError?: () => void;
}

export function UsagePriceHistorySection({
  usage,
  currencies,
  sortedHistory,
  loading,
  error,
  clearError,
}: Props) {
  const { t } = useTranslation();
  const rows = usageMonthPriceRows(sortedHistory);

  return (
    <View className="border border-gray-200 rounded-2xl p-4 mb-4 bg-gray-50/50">
      <SectionLabel className="mb-1">{t("plans.month_prices_title")}</SectionLabel>
      <Text className="text-xs text-gray-400 mb-3">{t("plans.usage_prices_hint")}</Text>

      {error ? (
        <View className="mb-3">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading ? (
        <View className="py-2 items-center">
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : rows.length === 0 ? (
        <Text className="text-sm text-gray-500">{t("plans.month_prices_history_empty")}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {rows.map((row) => (
            <View key={row.month} className="p-3 bg-white rounded-xl border border-gray-200">
              <Text fontWeight="SemiBold" className="text-sm text-gray-900">
                {billingMonthLabel(row.month, true)}
              </Text>
              <Text className="text-xs text-gray-500 mt-1">
                {usageMonthPriceLabel(row.price, usage, currencies, t)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
