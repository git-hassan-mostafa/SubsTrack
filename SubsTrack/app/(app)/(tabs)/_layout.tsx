import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/src/modules/auth";
import { Feather, Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.gray200,
          paddingBottom: bottom + 8,
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
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings.title"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
