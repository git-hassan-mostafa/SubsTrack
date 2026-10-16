import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { ListGroup } from "@/src/shared/components/ListGroup";
import { ListRow } from "@/src/shared/components/ListRow";
import { COLORS } from "@/src/shared/constants";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  canOpenPage,
  type PageKey,
} from "@shared/modules/authentication/auth/utils/pageAccess";

type Tint = "primary" | "success" | "warning";

const TINTS: Record<Tint, { color: string; bg: string }> = {
  primary: { color: COLORS.primary, bg: "bg-primary-container" },
  success: { color: COLORS.success, bg: "bg-success-light" },
  warning: { color: COLORS.warning, bg: "bg-warning-light" },
};

interface AdminItem {
  labelKey: string;
  subtitleKey: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  tint: Tint;
  route: string;
  page: PageKey;
}

const ADMIN_ITEMS: AdminItem[] = [
  { labelKey: "users.title", subtitleKey: "admin.staff_sub", icon: "people-outline", tint: "success", route: "/(app)/(tabs)/more/users", page: "users" },
  { labelKey: "wallet.title", subtitleKey: "admin.wallets_sub", icon: "wallet-outline", tint: "primary", route: "/(app)/(tabs)/more/wallets", page: "wallets" },
  { labelKey: "plans.title", subtitleKey: "admin.plans_sub", icon: "pricetag-outline", tint: "warning", route: "/(app)/(tabs)/more/plans", page: "plans" },
  { labelKey: "products.title", subtitleKey: "admin.products_sub", icon: "cube-outline", tint: "success", route: "/(app)/(tabs)/more/products", page: "products" },
  { labelKey: "services.title", subtitleKey: "admin.services_sub", icon: "construct-outline", tint: "primary", route: "/(app)/(tabs)/more/services", page: "services" },
  { labelKey: "tenant_settings.currencies_section_title", subtitleKey: "admin.currencies_sub", icon: "cash-outline", tint: "warning", route: "/(app)/(tabs)/more/currencies", page: "currencies" },
  { labelKey: "branches.section_title", subtitleKey: "admin.branches_sub", icon: "business-outline", tint: "success", route: "/(app)/(tabs)/more/branches", page: "branches" },
  { labelKey: "tenant_settings.title", subtitleKey: "tenant_settings.menu_sub", icon: "settings-outline", tint: "primary", route: "/(app)/(tabs)/more/tenant-settings", page: "organization" },
  { labelKey: "audit.title", subtitleKey: "audit.menu_sub", icon: "time-outline", tint: "warning", route: "/(app)/(tabs)/more/audit", page: "audit" },
  { labelKey: "whatsapp.title", subtitleKey: "whatsapp.menu_sub", icon: "logo-whatsapp", tint: "success", route: "/(app)/(tabs)/more/whatsapp", page: "whatsapp" },
  { labelKey: "whatsapp.history_title", subtitleKey: "whatsapp.history_menu_sub", icon: "chatbubbles-outline", tint: "primary", route: "/(app)/(tabs)/more/whatsapp-history", page: "whatsapp_history" },
];

export function AdminSection() {
  const { t } = useTranslation();
  const viewer = useAuth();
  const items = ADMIN_ITEMS.filter((item) => canOpenPage(viewer, item.page));

  return (
    <ListGroup label={t("admin.title")}>
      {items.map((item) => (
        <ListRow
          key={item.route}
          icon={item.icon}
          iconColor={TINTS[item.tint].color}
          iconBgClassName={TINTS[item.tint].bg}
          title={t(item.labelKey)}
          subtitle={t(item.subtitleKey)}
          onPress={() => router.push(item.route as Href)}
        />
      ))}
    </ListGroup>
  );
}
