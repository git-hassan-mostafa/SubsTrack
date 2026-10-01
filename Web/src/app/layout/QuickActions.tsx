import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { SvgIconComponent } from "@mui/icons-material";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import MoveToInboxOutlined from "@mui/icons-material/MoveToInboxOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { sortActions, type ActionGroup } from "@shared/shared/lib/actionOrder";
import { useUiStore } from "@shared/shared/lib/uiStore";

export interface QuickAction {
  key: string;
  group: ActionGroup;
  labelKey: string;
  icon: SvgIconComponent;
  onClick: () => void;
}

// Only actions whose dialog or page already works on the web belong here.
function useQuickActions(): QuickAction[] {
  const { isAdmin } = useAuth();
  const openQuickAction = useUiStore((s) => s.openQuickAction);
  const navigate = useNavigate();
  const actions: QuickAction[] = [
    {
      key: "collect",
      group: "money",
      labelKey: "ledger.collect_money",
      icon: PaymentsOutlined,
      onClick: () => openQuickAction("collect"),
    },
    {
      key: "customer",
      group: "create",
      labelKey: "customers.add",
      icon: PersonAddOutlined,
      onClick: () => openQuickAction("customer"),
    },
    {
      key: "moneyReceived",
      group: "history",
      labelKey: "ledger.history_title",
      icon: HistoryOutlined,
      onClick: () => void navigate("/money-received"),
    },
  ];
  if (isAdmin) {
    actions.push({
      key: "batchRestock",
      group: "create",
      labelKey: "products.batch_restock_title",
      icon: MoveToInboxOutlined,
      onClick: () => openQuickAction("batchRestock"),
    });
  }
  return actions;
}

export function QuickActions() {
  const { t } = useTranslation();
  const actions = sortActions(useQuickActions());
  return actions.map((action) => {
    const Icon = action.icon;
    const label = t(action.labelKey);
    return (
      <Tooltip key={action.key} title={label}>
        <IconButton aria-label={label} onClick={action.onClick}>
          <Icon />
        </IconButton>
      </Tooltip>
    );
  });
}
