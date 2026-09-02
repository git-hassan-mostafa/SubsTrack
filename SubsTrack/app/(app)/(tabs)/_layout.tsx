import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/src/modules/authentication/auth";
import { Feather, Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The icon carries the tab, so it is bigger than the 24 default.
const TAB_ICON_SIZE = 28;
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
        // Only the selected tab is named. `children` is the screen title, so one
        // renderer covers every tab; an unselected label is laid out but not painted,
        // which is what keeps all five icons on the same line.
        tabBarLabel: ({ focused, color, children }) => (
          <Text
            fontWeight="Bold"
            numberOfLines={1}
            style={{
              fontSize: 14,
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
          // GAP + icon + GAP-to-label + label + GAP, the padding above included.
          height:
            TAB_ICON_GAP * 2 +
            TAB_ICON_SIZE +
            TAB_LABEL_MARGIN +
            TAB_LABEL_HEIGHT +
            bottom,
        },
        // `auto` margins swallow the free space evenly, so the icon sits exactly
        // TAB_ICON_GAP below the top edge and TAB_LABEL_MARGIN above the label.
        // React Navigation pins it to the top otherwise (its tab item is
        // `justifyContent: flex-start`), and that pressable is not reachable from
        // `tabBarItemStyle` — which styles the item WRAPPER, not the icon.
        tabBarIconStyle: { marginVertical: "auto" },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray500,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("home.title"),
          href: isAdmin ? undefined : null,
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
      {/* Admin-only, like home — reports expose tenant-wide money and debt. */}
      <Tabs.Screen
        name="reports"
        options={{
          title: t("reports.title"),
          href: isAdmin ? undefined : null,
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
          href: isAdmin ? undefined : null,
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
