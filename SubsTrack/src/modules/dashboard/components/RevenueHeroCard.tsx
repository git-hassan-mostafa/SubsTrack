import { Fragment } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { MONTHS } from "@/src/core/constants";
import type { DashboardMetrics } from "@/src/core/types";

interface Props {
  metrics: DashboardMetrics | null;
  /** Formats a USD figure in the tenant's display currency. */
  fmt: (usd: number) => string;
  /** Money out + Net — admin-only, and pointless when nothing was spent. */
  showExpenses?: boolean;
  /** Opens the full report. Omitted → the card is not tappable. */
  onPress?: () => void;
}

// This month's money at a glance: cash collected, how it was earned, what is
// left after spending, and how much of the month has been collected.
export function RevenueHeroCard({
  metrics,
  fmt,
  showExpenses,
  onPress,
}: Props) {
  const { t } = useTranslation();

  const now = new Date();
  const monthLabel = t(`months.${MONTHS[now.getMonth()]}`);
  const year = now.getFullYear();

  const monthlyRevenue = metrics?.monthlyRevenue ?? 0;
  const monthlyExpenses = metrics?.monthlyExpenses ?? 0;
  const netIncome = metrics?.netIncome ?? 0;

  // Month-over-month change (null when there's no prior month to compare).
  const prevMonthRevenue = metrics?.prevMonthRevenue ?? 0;
  const momPct =
    prevMonthRevenue > 0
      ? Math.round(
          ((monthlyRevenue - prevMonthRevenue) / prevMonthRevenue) * 100,
        )
      : null;
  const momUp = (momPct ?? 0) >= 0;

  // Revenue mix, keeping only the streams that earned something. A single stream
  // needs no breakdown (it just repeats the total). Collected debts are
  // deliberately NOT listed: the only debt figure the card shows is what
  // customers still owe (the red chip below). They still count in the total.
  const revenueMix = [
    {
      key: "subscriptions",
      label: t("dashboard.subscriptions"),
      value: metrics?.subscriptionRevenue ?? 0,
    },
    {
      key: "sales",
      label: t("dashboard.sales_label"),
      value: metrics?.salesRevenue ?? 0,
    },
  ].filter((s) => s.value > 0);
  const showRevenueMix = revenueMix.length > 1;

  // Money never collected — not part of the headline, so it reads as a
  // separate red chip rather than another breakdown column.
  const totalDebt = metrics?.totalDebt ?? 0;

  // Progress is measured against the customers this month actually bills
  // (dueThisMonth) — never every active customer. A not-due-yet, skipped or
  // occasional customer owes nothing, so counting it would cap the bar below
  // 100% with nothing left to collect. Nothing due reads as fully collected.
  const dueCustomers = metrics?.dueThisMonth ?? 0;
  const paidCustomers = Math.max(
    0,
    dueCustomers - (metrics?.unpaidThisMonth ?? 0),
  );
  const collectedPct =
    dueCustomers > 0
      ? Math.min(100, Math.round((paidCustomers / dueCustomers) * 100))
      : 100;

  const Wrapper = onPress ? PressableOpacity : View;

  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      className="mx-4 mb-3 rounded-3xl bg-primary p-5"
    >
      {/* Month, and the way through to the full report */}
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

      {/* Total collected, with the month-over-month change beside it */}
      <View className="flex-row items-end flex-wrap gap-x-3 gap-y-1">
        <Text fontWeight="Bold" className="text-4xl text-white">
          {fmt(monthlyRevenue)}
        </Text>
        {momPct !== null ? (
          <View className="flex-row items-center gap-1.5 pb-1.5">
            <View
              className={`flex-row items-center gap-0.5 rounded-full px-2 py-0.5 ${
                momUp ? "bg-emerald-400/25" : "bg-red-400/25"
              }`}
            >
              <Ionicons
                name={momUp ? "arrow-up" : "arrow-down"}
                size={12}
                color={momUp ? "#6ee7b7" : "#fca5a5"}
              />
              <Text
                fontWeight="SemiBold"
                className={`text-xs ${momUp ? "text-emerald-200" : "text-red-200"}`}
              >
                {Math.abs(momPct)}%
              </Text>
            </View>
            <Text className="text-xs text-indigo-200">
              {t("dashboard.vs_last_month")}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Where the money came from — only when more than one stream earned */}
      {showRevenueMix ? (
        <View className="flex-row items-stretch rounded-2xl bg-white/10 px-4 py-3 mt-4">
          {revenueMix.map((stream, i) => (
            <Fragment key={stream.key}>
              {i > 0 ? <View className="w-px bg-white/20 mx-3" /> : null}
              <View className="flex-1">
                <Text
                  numberOfLines={1}
                  className="text-xs text-indigo-200 mb-0.5"
                >
                  {stream.label}
                </Text>
                <Text
                  fontWeight="Bold"
                  numberOfLines={1}
                  className="text-sm text-white"
                >
                  {fmt(stream.value)}
                </Text>
              </View>
            </Fragment>
          ))}
        </View>
      ) : null}

      {/* Money that is NOT in the headline: spent (orange) and still owed
          (red). Different meanings, so never the same colour. Each chip hugs
          its content instead of stretching. */}
      {showExpenses || totalDebt > 0 ? (
        <View className="flex-row flex-wrap gap-2 mt-3">
          {showExpenses ? (
            <OutflowChip
              icon="trending-down-outline"
              label={t("dashboard.expenses_label")}
              amount={fmt(Math.abs(monthlyExpenses))}
              className="bg-amber-400/20"
              textClassName="text-amber-100"
              iconColor="#fcd34d"
            />
          ) : null}
          {totalDebt > 0 ? (
            <OutflowChip
              icon="hourglass-outline"
              label={t("dashboard.owed_by_customers")}
              amount={`−${fmt(totalDebt)}`}
              className="bg-red-400/20"
              textClassName="text-red-100"
              iconColor="#fca5a5"
            />
          ) : null}
        </View>
      ) : null}

      {/* Net — collected minus spent. The only figure on the card that can go
          negative, so it says so in red. */}
      {showExpenses ? (
        <View className="flex-row items-center justify-between rounded-2xl bg-white/10 px-4 py-3 mt-3">
          <Text
            fontWeight="SemiBold"
            className="text-xs text-indigo-200 uppercase tracking-widest"
          >
            {t("dashboard.net_income")}
          </Text>
          <Text
            fontWeight="Bold"
            className={`text-xl ${netIncome < 0 ? "text-red-200" : "text-white"}`}
          >
            {netIncome < 0 ? `−${fmt(Math.abs(netIncome))}` : fmt(netIncome)}
          </Text>
        </View>
      ) : null}

      {/* How much of what this month bills has been collected */}
      <View className="mt-5">
        <View className="flex-row justify-between items-center mb-2">
          <Text
            fontWeight="SemiBold"
            className="text-xs text-indigo-200 uppercase tracking-widest"
          >
            {t("dashboard.collection_progress")}
          </Text>
          <Text fontWeight="Bold" className="text-sm text-white">
            {collectedPct}%
          </Text>
        </View>
        <View className="bg-white/20 rounded-full h-2 overflow-hidden">
          <View
            className="bg-white rounded-full h-full"
            style={{ width: `${collectedPct}%` }}
          />
        </View>
        <Text className="text-xs text-indigo-200 mt-2">
          {t("dashboard.paid_of_active", {
            paid: paidCustomers,
            total: dueCustomers,
          })}
        </Text>
      </View>
    </Wrapper>
  );
}

interface ChipProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Already formatted, sign included — the caller decides whether it carries one. */
  amount: string;
  className: string;
  textClassName: string;
  iconColor: string;
}

// One outflow figure on the hero: an icon, what it is, and the amount. Spending
// prints unsigned (matching the Expenses tab's outflowLabel); the owed figure
// keeps its minus, because it is the one number the card never collected.
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
