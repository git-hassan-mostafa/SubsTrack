import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { canOpenPage } from "@shared/modules/authentication/auth/utils/pageAccess";
import { Feather, Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The icon carries the tab, so it is bigger than the 24 default.
const TAB_ICON_SIZE = 24;
// Only the SELECTED tab is named, but the label slot is reserved on every tab
// (an unselected one renders it invisible) — otherwise the selected icon would
// jump up while its neighbours stayed centred. A fixed line height keeps the bar
// height predictable instead of following the font metrics.
const TAB_LABEL_HEIGHT = 15;
// Equal space above the icon and below the label.
const TAB_ICON_GAP = 8;
// React Navigation's own padding on the tab item — the gap already includes it.
const TAB_ITEM_PADDING = 5;
// What we add on top of that padding: also the icon-to-label gap.
const TAB_LABEL_MARGIN = TAB_ICON_GAP - TAB_ITEM_PADDING;

export default function TabsLayout() {
  const viewer = useAuth();
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarLabel: ({ focused, color, children }) => (
          <Text
            fontWeight="Bold"
            numberOfLines={1}
            style={{
              fontSize: 12,
              lineHeight: TAB_LABEL_HEIGHT,
              marginBottom: TAB_LABEL_MARGIN,
              textAlign: "center",
              color,
              opacity: focused ? 1 : 0,
              overflow: "visible",
              width: 100,
            }}
          >
            {children}
          </Text>
        ),
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.gray200,
          paddingBottom: bottom,
          height:
            TAB_ICON_GAP * 2 +
            TAB_ICON_SIZE +
            TAB_LABEL_MARGIN +
            TAB_LABEL_HEIGHT +
            bottom,
        },
        tabBarIconStyle: { marginVertical: "auto" },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray500,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("home.title"),
          href: canOpenPage(viewer, "dashboard") ? undefined : null,
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: t("customers.title"),
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="people-outline"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t("transactions.title"),
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="swap-horizontal-outline"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t("reports.title"),
          href: canOpenPage(viewer, "reports") ? undefined : null,
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="stats-chart-outline"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: t("admin.title"),
          href: viewer.isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="shield-outline"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings.title"),
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="settings-outline"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
