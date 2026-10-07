import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { SvgIconComponent } from "@mui/icons-material";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
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
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { AddNewMenuButton } from "./AddNewMenuButton";
import { QuickActionsMenuButton } from "./QuickActionsMenuButton";

const QUICK_ACTION_ICONS: Record<QuickActionKey, SvgIconComponent> = {
  collect: PaymentsOutlined,
  customer: PersonAddOutlined,
  sale: PointOfSaleOutlined,
  customDebt: NoteAddOutlined,
  expense: TrendingDownOutlined,
  batchRestock: MoveToInboxOutlined,
  moneyReceived: HistoryOutlined,
};

// Phone = one ⋮ menu; else money = labelled button, "create" = menu, rest = icons.
export function QuickActions() {
  const { t } = useTranslation();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("lg"));
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
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
  const sorted = sortActions(actions);
  if (phone) return <QuickActionsMenuButton actions={sorted} />;
  const createActions = sorted.filter((action) => action.group === "create");

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
      {sorted
        .filter((action) => action.group === "money")
        .map((action) => (
          <MainActionButton key={action.key} action={action} wide={wide} />
        ))}
      <AddNewMenuButton actions={createActions} wide={wide} />
      {sorted
        .filter((action) => action.group !== "money" && action.group !== "create")
        .map((action) => (
          <IconActionButton key={action.key} action={action} />
        ))}
    </Stack>
  );
}

function MainActionButton({ action, wide }: { action: TableAction; wide: boolean }) {
  const Icon = action.icon;
  if (!wide) return <IconActionButton action={action} color="primary" />;
  return (
    <Button variant="contained" disableElevation startIcon={<Icon />} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

function IconActionButton({ action, color }: { action: TableAction; color?: "primary" }) {
  const Icon = action.icon;
  return (
    <Tooltip title={action.label}>
      <IconButton aria-label={action.label} color={color} onClick={action.onClick}>
        <Icon />
      </IconButton>
    </Tooltip>
  );
}
