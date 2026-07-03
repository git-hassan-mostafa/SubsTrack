import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import type { RevenuePoint } from "@/src/core/types";
import { MONTHS } from "@/src/core/constants";

const CHART_HEIGHT = 130; // px, tallest bar
const MIN_BAR = 3; // px, so an empty month still shows a sliver

interface Props {
  data: RevenuePoint[]; // every month of the current year, Jan → Dec
  format: (usd: number) => string; // USD → display currency
}

// A minimal stacked bar chart of the current year's revenue, one bar per month.
// Each bar splits subscription (indigo) vs sales (emerald) so the mix reads at a glance.
// The current month is emphasized; other months are muted.
export function RevenueTrendChart({ data, format }: Props) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.total));

  // The current month is the last month with any activity, or the newest overall.
  // (The trend spans the whole year, so later months may still be empty/future.)
  const currentIndex = data.reduce(
    (best, d, i) => (d.total > 0 ? i : best),
    data.length - 1,
  );
  const hasSales = data.some((d) => d.sales > 0);

  return (
    <View className="mx-4 mb-3 bg-white border border-gray-100 rounded-2xl p-4">
      <View className="flex-row items-baseline justify-between mb-1">
        <Text className="text-sm text-gray-500 uppercase tracking-wide">
          {t("dashboard.revenue_trend")}
        </Text>
        <Text className="text-xs text-gray-400">
          {t("dashboard.trend_months", { months: data.length })}
        </Text>
      </View>

      {/* Legend — only when both revenue streams are present */}
      {hasSales ? (
        <View className="flex-row items-center gap-4 mb-3">
          <View className="flex-row items-center gap-1.5">
            <View className="w-3 h-3 rounded-sm bg-primary" />
            <Text className="text-xs text-gray-500">
              {t("dashboard.subscriptions")}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="w-3 h-3 rounded-sm bg-emerald-400" />
            <Text className="text-xs text-gray-500">
              {t("dashboard.sales_label")}
            </Text>
          </View>
        </View>
      ) : (
        <View className="mb-3" />
      )}

      {/* Plot area — bars sit on a baseline, with a faint max reference line on top */}
      <View style={{ height: CHART_HEIGHT }} className="justify-end">
        {/* Max reference line */}
        <View className="absolute top-0 left-0 right-0 border-t border-dashed border-gray-100" />

        <View className="flex-row items-end">
          {data.map((point, i) => {
            const isCurrent = i === currentIndex;
            const totalH = Math.max(
              MIN_BAR,
              Math.round((point.total / max) * CHART_HEIGHT),
            );
            // Split the bar height by revenue mix; sales stacks on top of subscriptions.
            const salesH =
              point.total > 0
                ? Math.round((point.sales / point.total) * totalH)
                : 0;
            const subH = totalH - salesH;
            // Every month that actually earned something gets its amount above the bar.
            const showLabel = point.total > 0;

            return (
              <View
                key={point.month}
                className="flex-1 items-center justify-end px-[2px]"
              >
                {showLabel ? (
                  // A fixed centered width lets the full amount overflow its narrow
                  // column without wrapping or clipping (no ancestor clips it).
                  <Text
                    fontWeight={isCurrent ? "SemiBold" : "Regular"}
                    numberOfLines={1}
                    style={{ width: 80, textAlign: "center" }}
                    className={`text-[11px] mb-1 ${
                      isCurrent ? "text-primary" : "text-gray-400"
                    }`}
                  >
                    {format(point.total)}
                  </Text>
                ) : null}

                {/* Stacked bar: subscription (bottom) + sales (top). The bar fills
                    its column; the flex cell's horizontal padding is the gap. */}
                <View
                  style={{ height: totalH }}
                  className="w-full overflow-hidden rounded-md justify-end"
                >
                  {salesH > 0 ? (
                    <View style={{ height: salesH }} className="bg-emerald-400" />
                  ) : null}
                  <View
                    style={{ height: subH }}
                    className={isCurrent ? "bg-primary" : "bg-indigo-200"}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Baseline */}
      <View className="h-px bg-gray-100 mt-1.5 mb-2" />

      {/* Month labels — short names; they shrink to fit so all 12 stay on one row */}
      <View className="flex-row">
        {data.map((point, i) => (
          <View key={point.month} className="flex-1 items-center px-[1px]">
            <Text
              fontWeight={i === currentIndex ? "SemiBold" : "Regular"}
              numberOfLines={1}
              adjustsFontSizeToFit
              className={`text-xs ${
                i === currentIndex ? "text-gray-700" : "text-gray-400"
              }`}
            >
              {t(`months.${MONTHS[point.monthIndex]}`)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
