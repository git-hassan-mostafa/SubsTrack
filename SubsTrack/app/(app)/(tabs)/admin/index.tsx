import { Ionicons } from "@expo/vector-icons";
import { Href, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
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
    labelKey: "users.title",
    subtitleKey: "admin.staff_sub",
    icon: "people-outline",
    iconBg: COLORS.successLight,
    iconColor: COLORS.success,
    route: "/(app)/(tabs)/admin/users",
  },
  {
    labelKey: "wallet.title",
    subtitleKey: "admin.wallets_sub",
    icon: "wallet-outline",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    route: "/(app)/(tabs)/admin/wallets",
  },
  {
    labelKey: "plans.title",
    subtitleKey: "admin.plans_sub",
    icon: "pricetag-outline",
    iconBg: COLORS.warningLight,
    iconColor: COLORS.warning,
    route: "/(app)/(tabs)/admin/plans",
  },
  {
    labelKey: "products.title",
    subtitleKey: "admin.products_sub",
    icon: "cube-outline",
    iconBg: COLORS.successLight,
    iconColor: COLORS.success,
    route: "/(app)/(tabs)/admin/products",
  },
  {
    labelKey: "services.title",
    subtitleKey: "admin.services_sub",
    icon: "construct-outline",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    route: "/(app)/(tabs)/admin/services",
  },
  {
    labelKey: "tenant_settings.currencies_section_title",
    subtitleKey: "admin.currencies_sub",
    icon: "cash-outline",
    iconBg: COLORS.warningLight,
    iconColor: COLORS.warning,
    route: "/(app)/(tabs)/admin/currencies",
  },
  {
    labelKey: "branches.section_title",
    subtitleKey: "admin.branches_sub",
    icon: "business-outline",
    iconBg: COLORS.successLight,
    iconColor: COLORS.success,
    route: "/(app)/(tabs)/admin/branches",
  },
  {
    labelKey: "tenant_settings.title",
    subtitleKey: "tenant_settings.menu_sub",
    icon: "settings-outline",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    route: "/(app)/(tabs)/admin/tenant-settings",
  },
  {
    labelKey: "audit.title",
    subtitleKey: "audit.menu_sub",
    icon: "time-outline",
    iconBg: COLORS.warningLight,
    iconColor: COLORS.warning,
    route: "/(app)/(tabs)/admin/audit",
  },
];

export default function AdminMenuScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView>
        <View className="px-5 pt-5 pb-4">
          <Text fontWeight="Bold" className="text-2xl text-gray-900">
            {t("admin.title")}
          </Text>
          <Text className="text-sm text-gray-400 mt-0.5">
            {t("admin.description")}
          </Text>
        </View>

        {/* Manage section */}
        <View className="mx-4 mb-16">
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
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={item.iconColor}
                    />
                  </View>
                  <View>
                    <Text className="text-base font-semibold text-gray-900">
                      {t(item.labelKey)}
                    </Text>
                    <Text className="text-xs text-gray-400 mt-0.5">
                      {t(item.subtitleKey)}
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
      </ScrollView>
    </SafeAreaView>
  );
}
