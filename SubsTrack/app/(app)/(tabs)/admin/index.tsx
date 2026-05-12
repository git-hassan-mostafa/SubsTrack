import { useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Href, router } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDashboardStore } from "@/src/modules/dashboard/store/dashboardStore";
import { COLORS } from "@/src/shared/constants";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";

type MenuItem = {
  labelKey: string;
  subtitleKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  route: string;
};

const MENU_ITEMS: MenuItem[] = [
  {
    labelKey: "dashboard.title",
    subtitleKey: "admin.dashboard_sub",
    icon: "bar-chart-outline",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    route: "/(app)/(tabs)/admin/dashboard",
  },
  {
    labelKey: "users.title",
    subtitleKey: "admin.staff_sub",
    icon: "people-outline",
    iconBg: COLORS.successLight,
    iconColor: COLORS.success,
    route: "/(app)/(tabs)/admin/users",
  },
  {
    labelKey: "plans.title",
    subtitleKey: "admin.plans_sub",
    icon: "pricetag-outline",
    iconBg: COLORS.warningLight,
    iconColor: COLORS.warning,
    route: "/(app)/(tabs)/admin/plans",
  },
];

function formatCompact(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

export default function AdminMenuScreen() {
  const { t } = useTranslation();
  const { metrics, loading, fetchMetrics } = useDashboardStore();

  useFocusEffect(
    useCallback(() => {
      fetchMetrics();
    }, []),
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-5 pt-5 pb-4">
        <Text fontWeight="Bold" className="text-2xl text-gray-900">
          {t("admin.title")}
        </Text>
        <Text className="text-sm text-gray-400 mt-0.5">
          {t("admin.description")}
        </Text>
      </View>

      {/* Stats card */}
      <View className="mx-4 mb-5 bg-white rounded-2xl border border-gray-100 flex-row">
        <View className="flex-1 items-center py-4 border-r border-gray-100">
          {loading && !metrics ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <>
              <Text fontWeight="Bold" className="text-xl text-gray-900">
                {formatCompact(metrics?.monthlyRevenue ?? 0)}
              </Text>
              <Text className="text-xs text-gray-400 mt-0.5">
                {t("admin.collected")}
              </Text>
            </>
          )}
        </View>
        <View className="flex-1 items-center py-4 border-r border-gray-100">
          <Text fontWeight="Bold" className="text-xl text-red-500">
            {metrics?.unpaidThisMonth ?? 0}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {t("dashboard.unpaid")}
          </Text>
        </View>
        <View className="flex-1 items-center py-4">
          <Text fontWeight="Bold" className="text-xl text-gray-900">
            {metrics?.totalCustomers ?? 0}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {t("dashboard.customers_section")}
          </Text>
        </View>
      </View>

      {/* Manage section */}
      <View className="mx-4">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
          {t("admin.manage_section")}
        </Text>
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {MENU_ITEMS.map((item, index) => (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route as Href)}
              className={`flex-row items-center justify-between px-4 py-4 ${index < MENU_ITEMS.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="w-10 h-10 rounded-xl items-center justify-center"
                  style={{ backgroundColor: item.iconBg }}
                >
                  <Ionicons name={item.icon} size={20} color={item.iconColor} />
                </View>
                <View>
                  <Text className="text-base font-semibold text-gray-900">
                    {t(item.labelKey)}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {t(item.subtitleKey, {
                      count:
                        item.labelKey === "users.title"
                          ? (metrics?.totalUsers ?? 0)
                          : item.labelKey === "plans.title"
                            ? (metrics?.totalPlans ?? 0)
                            : undefined,
                    })}
                  </Text>
                </View>
              </View>
              <DirectionalIcon
                name="chevron-forward"
                size={16}
                color={COLORS.gray300}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
