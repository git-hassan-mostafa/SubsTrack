import { Tabs } from "expo-router/js-tabs";
import { useTranslation } from "react-i18next";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  canOpenPage,
  type PageKey,
} from "@shared/modules/authentication/auth/utils/pageAccess";
import { AppTabBar, type AppTab } from "@/src/shared/components/AppTabBar";

interface TabConfig {
  name: string;
  titleKey: string;
  icon: AppTab["icon"];
  iconOutline: AppTab["iconOutline"];
  page?: PageKey;
}

const TABS: TabConfig[] = [
  { name: "home", titleKey: "home.title", icon: "home", iconOutline: "home-outline", page: "dashboard" },
  { name: "customers", titleKey: "customers.title", icon: "people", iconOutline: "people-outline" },
  { name: "transactions", titleKey: "transactions.title", icon: "swap-horizontal", iconOutline: "swap-horizontal-outline" },
  { name: "reports", titleKey: "reports.title", icon: "stats-chart", iconOutline: "stats-chart-outline", page: "reports" },
  { name: "more", titleKey: "more.title", icon: "menu", iconOutline: "menu-outline" },
];

// Back follows visited pages, not tab order (#93); hidden tabs stay registered
export default function TabsLayout() {
  const viewer = useAuth();
  const { t } = useTranslation();

  const isVisible = (tab: TabConfig) => !tab.page || canOpenPage(viewer, tab.page);
  const visibleTabs: AppTab[] = TABS.filter(isVisible).map((tab) => ({
    name: tab.name,
    label: t(tab.titleKey),
    icon: tab.icon,
    iconOutline: tab.iconOutline,
  }));

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} tabs={visibleTabs} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            href: isVisible(tab) ? undefined : null,
          }}
        />
      ))}
    </Tabs>
  );
}
