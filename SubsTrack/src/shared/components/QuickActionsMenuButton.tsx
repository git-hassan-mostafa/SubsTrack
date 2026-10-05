import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { useUiStore } from "@shared/shared/lib/uiStore";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { quickActionItems, type QuickActionKey } from "@shared/shared/lib/quickActions";
import { toActionMenuItems, type Glyph } from "../lib/menuActions";
import { PressableOpacity } from "./PressableOpacity";
import { ActionMenu } from "./ActionMenu";

const QUICK_ACTION_ICONS: Record<QuickActionKey, Glyph> = {
  collect: "cash-outline",
  customer: "person-add-outline",
  sale: "receipt-outline",
  customDebt: "document-text-outline",
  expense: "trending-down-outline",
  batchRestock: "cube-outline",
  moneyReceived: "time-outline",
};

const QUICK_ACTION_BADGES: Partial<Record<QuickActionKey, Glyph>> = {
  collect: "add",
  sale: "add",
  customDebt: "add",
  expense: "add",
  batchRestock: "add",
};

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
