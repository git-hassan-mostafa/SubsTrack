import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/src/modules/authentication/auth";
import { Feather, Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Mobile browsers (e.g. Android Chrome) report a phantom safe-area-inset-bottom
  // for their own gesture bar, which the browser chrome already accounts for.
  // Adding it again here left a dead empty gap below the tab bar on web.
  const bottom = Platform.OS === "web" ? 0 : insets.bottom;

  return (
    <Tabs
      // Back follows the pages actually visited, not the tab order. React
      // Navigation defaults to `firstRoute`, so Back from ANY tab jumped to Home
      // (and, for a non-admin, to the admin-only dashboard). See gotcha #93.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.gray200,
          paddingBottom: bottom,
          paddingTop: 4,
          height: 64 + bottom,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray500,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
          fontFamily: "Cairo",
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("home.title"),
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: t("customers.title"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t("transactions.title"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Admin-only, like home — reports expose tenant-wide money and debt. */}
      <Tabs.Screen
        name="reports"
        options={{
          title: t("reports.title"),
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: t("admin.title"),
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Reachable only from the header's settings button (`href: null` keeps the
          route navigable but drops it from the tab bar). */}
      <Tabs.Screen
        name="settings"
        options={{ title: t("settings.title"), href: null }}
      />
    </Tabs>
  );
}
