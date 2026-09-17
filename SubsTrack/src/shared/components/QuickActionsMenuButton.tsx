import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { useUiStore } from "@/src/shared/lib/uiStore";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { PressableOpacity } from "./PressableOpacity";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";

// App-wide 3-dot menu — QuickActionSheets hosts the sheets these rows open.
export function QuickActionsMenuButton() {
  const { t } = useTranslation();
  const openQuickAction = useUiStore((s) => s.openQuickAction);
  const role = useAuthSlice((s) => s.user?.role);
  const isAdmin = role === "admin" || role === "superadmin";
  const [menuOpen, setMenuOpen] = useState(false);

  const actions: ActionMenuItem[] = [
    {
      key: "collect",
      group: "money",
      label: t("ledger.collect_money"),
      icon: "cash-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("collect"),
    },
    {
      key: "customer",
      group: "create",
      label: t("customers.add"),
      icon: "person-add-outline",
      onPress: () => openQuickAction("customer"),
    },
    {
      key: "sale",
      group: "create",
      label: t("sales.record_button"),
      icon: "receipt-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("sale"),
    },
    {
      key: "customDebt",
      group: "create",
      label: t("debts.add_custom_debt"),
      icon: "document-text-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("customDebt"),
    },
  ];

  if (isAdmin) {
    actions.push({
      key: "expense",
      group: "create",
      label: t("expenses.add_title"),
      icon: "trending-down-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("expense"),
    });
    actions.push({
      key: "batchRestock",
      group: "create",
      label: t("products.batch_restock_title"),
      icon: "cube-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("batchRestock"),
    });
  }

  actions.push({
    key: "collectionsHistory",
    group: "history",
    label: t("ledger.history_title"),
    icon: "time-outline",
    onPress: () => openQuickAction("collectionsHistory"),
  });

  return (
    <>
      <PressableOpacity
        onPress={() => setMenuOpen(true)}
        className="p-1"
        accessibilityLabel={t("quick_actions.title")}
      >
        <Ionicons name="ellipsis-vertical" size={22} color={COLORS.gray700} />
      </PressableOpacity>
      <ActionMenu
        visible={menuOpen}
        title={t("quick_actions.title")}
        actions={actions}
        onDismiss={() => setMenuOpen(false)}
      />
    </>
  );
}
