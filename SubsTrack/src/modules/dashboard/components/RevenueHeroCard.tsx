import { Fragment } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { MONTHS } from "@shared/core/constants";
import type { Currency, DashboardMetrics } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { revenueHero } from "@shared/modules/dashboard/utils/dashboardView";
import { formatKpiValue, money } from "@shared/modules/reports/utils/reportKpis";

interface Props {
  metrics: DashboardMetrics;
  isAdmin: boolean;
  displayCurrency: Currency | null;
  onPress?: () => void;
}

// This month's cash at a glance; the figures and what shows come from revenueHero.
export function RevenueHeroCard({ metrics, isAdmin, displayCurrency, onPress }: Props) {
  const { t } = useTranslation();
  const hero = revenueHero(metrics, isAdmin);
  const fmt = (usd: number) => formatMoney(usd, null, displayCurrency);

  const now = new Date();
  const monthLabel = t(`months.${MONTHS[now.getMonth()]}`);
  const year = now.getFullYear();
  const changeUp = (hero.changePct ?? 0) >= 0;

  const Wrapper = onPress ? PressableOpacity : View;

  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      className="mx-4 mb-3 rounded-3xl bg-primary p-5"
    >
      <View className="flex-row items-center gap-2 mb-4">
        <Text
          fontWeight="SemiBold"
          numberOfLines={1}
          className="flex-1 text-xs text-indigo-200 uppercase tracking-widest"
        >
          {t("dashboard.monthly_collected", { month: monthLabel, year })}
        </Text>
        {onPress ? (
          <View className="flex-row items-center gap-1 rounded-full bg-white/15 py-1 ps-2.5 pe-1.5">
            <Text fontWeight="SemiBold" className="text-xs text-white">
              {t("reports.title")}
            </Text>
            <DirectionalIcon name="chevron-forward" size={12} color="white" />
          </View>
        ) : null}
      </View>

      <View className="flex-row items-end flex-wrap gap-x-3 gap-y-1">
        <Text fontWeight="Bold" className="text-4xl text-white">
          {fmt(hero.revenueUsd)}
        </Text>
        {hero.changePct !== null ? (
          <View className="flex-row items-center gap-1.5 pb-1.5">
            <View
              className={`flex-row items-center gap-0.5 rounded-full px-2 py-0.5 ${
                changeUp ? "bg-emerald-400/25" : "bg-red-400/25"
              }`}
            >
              <Ionicons
                name={changeUp ? "arrow-up" : "arrow-down"}
                size={12}
                color={changeUp ? "#6ee7b7" : "#fca5a5"}
              />
              <Text
                fontWeight="SemiBold"
                className={`text-xs ${changeUp ? "text-emerald-200" : "text-red-200"}`}
              >
                {Math.abs(hero.changePct)}%
              </Text>
            </View>
            <Text className="text-xs text-indigo-200">
              {t("dashboard.vs_last_month")}
            </Text>
          </View>
        ) : null}
      </View>

      {hero.mix.length > 0 ? (
        <View className="flex-row items-stretch rounded-2xl bg-white/10 px-4 py-3 mt-4">
          {hero.mix.map((part, i) => (
            <Fragment key={part.key}>
              {i > 0 ? <View className="w-px bg-white/20 mx-3" /> : null}
              <View className="flex-1">
                <Text
                  numberOfLines={1}
                  className="text-xs text-indigo-200 mb-0.5"
                >
                  {t(part.labelKey)}
                </Text>
                <Text
                  fontWeight="Bold"
                  numberOfLines={1}
                  className="text-sm text-white"
                >
                  {fmt(part.usd)}
                </Text>
              </View>
            </Fragment>
          ))}
        </View>
      ) : null}

      {hero.showExpenses || hero.showToCollect ? (
        <View className="flex-row flex-wrap gap-2 mt-3">
          {hero.showExpenses ? (
            <OutflowChip
              icon="trending-down-outline"
              label={t("dashboard.expenses_label")}
              amount={fmt(Math.abs(hero.expensesUsd))}
              className="bg-amber-400/20"
              textClassName="text-amber-100"
              iconColor="#fcd34d"
            />
          ) : null}
          {hero.showToCollect ? (
            <OutflowChip
              icon="hourglass-outline"
              label={t("dashboard.total_to_collect")}
              amount={fmt(hero.toCollectUsd)}
              className="bg-red-400/20"
              textClassName="text-red-100"
              iconColor="#fca5a5"
            />
          ) : null}
        </View>
      ) : null}

      {hero.toCollectMix.length > 0 ? (
        <Text className="text-xs text-red-100 mt-2">
          {hero.toCollectMix
            .map((part) => `${t(part.labelKey)} ${fmt(part.usd)}`)
            .join(" · ")}
        </Text>
      ) : null}

      {hero.unpricedLines > 0 ? (
        <Text className="text-xs text-indigo-200 mt-2">
          {t("dashboard.unpriced_not_counted", { count: hero.unpricedLines })}
        </Text>
      ) : null}

      {hero.showExpenses ? (
        <View className="flex-row items-center justify-between rounded-2xl bg-white/10 px-4 py-3 mt-3">
          <Text
            fontWeight="SemiBold"
            className="text-xs text-indigo-200 uppercase tracking-widest"
          >
            {t("dashboard.net_income")}
          </Text>
          <Text
            fontWeight="Bold"
            className={`text-xl ${hero.netUsd < 0 ? "text-red-200" : "text-white"}`}
          >
            {formatKpiValue(money(hero.netUsd), displayCurrency)}
          </Text>
        </View>
      ) : null}

      <View className="mt-5">
        <View className="flex-row justify-between items-center mb-2">
          <Text
            fontWeight="SemiBold"
            className="text-xs text-indigo-200 uppercase tracking-widest"
          >
            {t("dashboard.collection_progress")}
          </Text>
          <Text fontWeight="Bold" className="text-sm text-white">
            {hero.collectedPct}%
          </Text>
        </View>
        <View className="bg-white/20 rounded-full h-2 overflow-hidden">
          <View
            className="bg-white rounded-full h-full"
            style={{ width: `${hero.collectedPct}%` }}
          />
        </View>
        <Text className="text-xs text-indigo-200 mt-2">
          {t("dashboard.paid_of_active", {
            paid: hero.paid,
            total: hero.due,
          })}
        </Text>
      </View>
    </Wrapper>
  );
}

interface ChipProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  amount: string;
  className: string;
  textClassName: string;
  iconColor: string;
}

// Spending prints unsigned, matching the Expenses tab's outflowLabel.
function OutflowChip({
  icon,
  label,
  amount,
  className,
  textClassName,
  iconColor,
}: ChipProps) {
  return (
    <View
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${className}`}
    >
      <Ionicons name={icon} size={12} color={iconColor} />
      <Text className={`text-xs ${textClassName}`}>{label}</Text>
      <Text fontWeight="Bold" className={`text-xs ${textClassName}`}>
        {amount}
      </Text>
    </View>
  );
}
