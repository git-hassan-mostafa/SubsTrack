import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import { COLORS } from "@/src/shared/constants";
import type { Currency, Plan, PlanPriceChange } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import {
  planPriceSublabel,
  priceHistoryEffectiveLabel,
} from "@shared/modules/admin/plans/utils/planLabels";
import { canEditPriceStart } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { priceStartOptionsWith } from "@shared/modules/customer/customer-plans/utils/priceStartOptions";

interface Props {
  plan: Plan;
  currencies: Currency[];
  sortedHistory: PlanPriceChange[];
  activeChange: PlanPriceChange | null;
  loading: boolean;
  error?: string | null;
  clearError?: () => void;
  editingId: string | null;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  submitting: boolean;
  startEdit: (change: PlanPriceChange) => void;
  cancelEdit: () => void;
  saveEdit: (changeId: string) => Promise<boolean>;
}

export function PlanPriceHistorySection({
  plan,
  currencies,
  sortedHistory,
  activeChange,
  loading,
  error,
  clearError,
  editingId,
  selectedMonth,
  setSelectedMonth,
  submitting,
  startEdit,
  cancelEdit,
  saveEdit,
}: Props) {
  const { t } = useTranslation();
  const currentActiveId = activeChange?.id ?? null;

  return (
    <View className="border border-gray-200 rounded-2xl p-4 mb-4 bg-gray-50/50">
      <SectionLabel className="mb-3">{t("plans.price_history_title")}</SectionLabel>

      {error ? (
        <View className="mb-3">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading ? (
        <View className="py-2 items-center">
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : sortedHistory.length === 0 ? (
        <View className="p-3 bg-white rounded-xl border border-gray-200">
          <View className="flex-row items-center justify-between">
            <Text fontWeight="SemiBold" className="text-sm text-gray-900">
              {planPriceSublabel(
                plan,
                currencies,
                findCurrency(currencies, plan.currencyId),
                t,
              )}
            </Text>
            <View className="bg-primary/10 px-2 py-0.5 rounded-full">
              <Text
                fontWeight="SemiBold"
                className="text-xs text-primary"
              >
                {t("plans.current_price_badge")}
              </Text>
            </View>
          </View>
          <Text className="text-xs text-gray-400 mt-1">
            {t("plans.price_history_initial")} · {formatDate(plan.createdAt)}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {sortedHistory.map((item) => {
            const isEditing = editingId === item.id;
            const isCurrent = item.id === currentActiveId;
            const options = priceStartOptionsWith(item.fromMonth);

            return (
              <View
                key={item.id}
                className="p-3 bg-white rounded-xl border border-gray-200"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-2" style={{ gap: 6 }}>
                    <Text
                      fontWeight="SemiBold"
                      className="text-sm text-gray-900"
                    >
                      {planPriceSublabel(
                        item,
                        currencies,
                        findCurrency(currencies, item.currencyId),
                        t,
                      )}
                    </Text>
                    {isCurrent ? (
                      <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                        <Text
                          fontWeight="SemiBold"
                          className="text-xs text-primary"
                        >
                          {t("plans.current_price_badge")}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {canEditPriceStart(item, sortedHistory) && !isEditing ? (
                    <PressableOpacity
                      onPress={() => startEdit(item)}
                      containerClassName="rounded-lg bg-gray-100" className="px-2.5 py-1"
                    >
                      <Text
                        fontWeight="SemiBold"
                        className="text-xs text-primary"
                      >
                        {t("common.edit")}
                      </Text>
                    </PressableOpacity>
                  ) : null}
                </View>

                {!isEditing ? (
                  <Text className="text-xs text-gray-400 mt-1">
                    {priceHistoryEffectiveLabel(item, plan, t)}
                  </Text>
                ) : (
                  <View className="mt-3 pt-3 border-t border-gray-100">
                    <Dropdown<string>
                      label={t("plans.price_effective_from")}
                      options={options}
                      value={selectedMonth}
                      onChange={(v) => {
                        if (v) setSelectedMonth(v);
                      }}
                    />

                    <View className="flex-row items-center justify-end mt-2" style={{ gap: 8 }}>
                      <PressableOpacity
                        onPress={cancelEdit}
                        disabled={submitting}
                        containerClassName="rounded-lg bg-gray-100" className="px-3 py-1.5"
                      >
                        <Text
                          fontWeight="SemiBold"
                          className="text-xs text-gray-600"
                        >
                          {t("common.cancel")}
                        </Text>
                      </PressableOpacity>

                      <PressableOpacity
                        onPress={() => saveEdit(item.id)}
                        disabled={
                          submitting || selectedMonth === item.fromMonth
                        }
                        containerClassName={`rounded-lg ${
                          submitting || selectedMonth === item.fromMonth
                            ? "bg-primary/50"
                            : "bg-primary"
                        }`}
                        className="px-3 py-1.5"
                        rippleColor={COLORS.rippleOnDark}
                      >
                        <Text
                          fontWeight="SemiBold"
                          className="text-xs text-white"
                        >
                          {t("common.save")}
                        </Text>
                      </PressableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
