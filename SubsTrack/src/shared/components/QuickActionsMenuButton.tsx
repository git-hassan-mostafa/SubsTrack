import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "@shared/shared/lib/uiStore";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { quickActionItems } from "@shared/shared/lib/quickActions";
import { toActionMenuItems } from "../lib/menuActions";
import { QUICK_ACTION_BADGES, QUICK_ACTION_ICONS } from "../lib/quickActionIcons";
import { IconButton } from "./IconButton";
import { ActionMenu } from "./ActionMenu";

// App-wide 3-dot menu — QuickActionSheets hosts the sheets these rows open.
export function QuickActionsMenuButton() {
  const { t } = useTranslation();
  const openQuickAction = useUiStore((s) => s.openQuickAction);
  const { isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const actions = toActionMenuItems(quickActionItems({ isAdmin }), t, {
    icons: QUICK_ACTION_ICONS,
    iconBadges: QUICK_ACTION_BADGES,
    run: {
      collect: () => openQuickAction("collect"),
      customer: () => openQuickAction("customer"),
      sale: () => openQuickAction("sale"),
      customDebt: () => openQuickAction("customDebt"),
      expense: () => openQuickAction("expense"),
      batchRestock: () => openQuickAction("batchRestock"),
      moneyReceived: () => openQuickAction("collectionsHistory"),
    },
  });

  return (
    <>
      <IconButton
        icon="ellipsis-vertical"
        onPress={() => setMenuOpen(true)}
        accessibilityLabel={t("quick_actions.title")}
      />
      <ActionMenu
        visible={menuOpen}
        title={t("quick_actions.title")}
        actions={actions}
        onDismiss={() => setMenuOpen(false)}
      />
    </>
  );
}
