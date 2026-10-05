import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { SvgIconComponent } from "@mui/icons-material";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import MoveToInboxOutlined from "@mui/icons-material/MoveToInboxOutlined";
import NoteAddOutlined from "@mui/icons-material/NoteAddOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import PointOfSaleOutlined from "@mui/icons-material/PointOfSaleOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { sortActions } from "@shared/shared/lib/actionOrder";
import { quickActionItems, type QuickActionKey } from "@shared/shared/lib/quickActions";
import { useUiStore } from "@shared/shared/lib/uiStore";
import { toTableActions } from "@/shared/table/tableAction";

const QUICK_ACTION_ICONS: Record<QuickActionKey, SvgIconComponent> = {
  collect: PaymentsOutlined,
  customer: PersonAddOutlined,
  sale: PointOfSaleOutlined,
  customDebt: NoteAddOutlined,
  expense: TrendingDownOutlined,
  batchRestock: MoveToInboxOutlined,
  moneyReceived: HistoryOutlined,
};

// Only actions whose dialog or page already works on the web get a handler.
export function QuickActions() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const openQuickAction = useUiStore((s) => s.openQuickAction);
  const navigate = useNavigate();
  const actions = toTableActions(quickActionItems({ isAdmin }), t, {
    icons: QUICK_ACTION_ICONS,
    run: {
      collect: () => openQuickAction("collect"),
      customer: () => openQuickAction("customer"),
      sale: () => openQuickAction("sale"),
      customDebt: () => openQuickAction("customDebt"),
      expense: () => openQuickAction("expense"),
      batchRestock: () => openQuickAction("batchRestock"),
      moneyReceived: () => void navigate("/money-received"),
    },
  });
  return sortActions(actions).map((action) => {
    const Icon = action.icon;
    return (
      <Tooltip key={action.key} title={action.label}>
        <IconButton aria-label={action.label} onClick={action.onClick}>
          <Icon />
        </IconButton>
      </Tooltip>
    );
  });
}
