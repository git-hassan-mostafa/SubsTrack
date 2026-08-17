import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { useUiSlice } from "@/src/state/hooks/useUiSlice";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";

// The top-right 3-dot menu: a global "quick add" shortcut list available on every
// screen. Items only flip the `ui` slice; the sheets are hosted once by
// QuickActionSheets (mounted in the app layout).
//
// Lives here rather than inside PageHeader because the dashboard hand-rolls its
// own header and needs the same menu — one implementation, two callers.
export function QuickActionsMenuButton() {
  const { t } = useTranslation();
  const openQuickAction = useUiSlice((s) => s.openQuickAction);
  const role = useAuthSlice((s) => s.user?.role);
  const isAdmin = role === "admin" || role === "superadmin";
  const [menuOpen, setMenuOpen] = useState(false);

  const actions: ActionMenuItem[] = [
    {
      key: "paymentsHistory",
      label: t("payments.history"),
      icon: "time-outline",
      onPress: () => openQuickAction("paymentsHistory"),
    },
    {
      key: "customer",
      label: t("customers.add"),
      icon: "person-add-outline",
      onPress: () => openQuickAction("customer"),
    },
    {
      key: "sale",
      label: t("sales.record_button"),
      // Same glyph as the dashboard's "Record sale" tile.
      icon: "receipt-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("sale"),
    },
    {
      key: "customDebt",
      label: t("debts.add_custom_debt"),
      icon: "document-text-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("customDebt"),
    },
    {
      key: "debtPayment",
      label: t("debts.record_debt_payment"),
      icon: "cash-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("debtPayment"),
    },
  ];

  // Products are managed from the admin tab, which non-admins never see — so the
  // restock shortcut stays admin-only too. Expenses are admin-only for a
  // stronger reason: rent and salaries are not staff business (RLS enforces it).
  if (isAdmin) {
    actions.push({
      key: "expense",
      label: t("expenses.add_title"),
      icon: "trending-down-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("expense"),
    });
    actions.push({
      key: "batchRestock",
      label: t("products.batch_restock_title"),
      icon: "cube-outline",
      iconBadge: "add",
      onPress: () => openQuickAction("batchRestock"),
    });
  }

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
