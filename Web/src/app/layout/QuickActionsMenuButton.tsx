import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import Tooltip from "@mui/material/Tooltip";
import { useTheme } from "@mui/material/styles";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { actionMenuItem } from "@/shared/table/actionMenuItem";
import type { TableAction } from "@/shared/table/tableAction";

interface QuickActionsMenuButtonProps {
  actions: TableAction[];
}

export function QuickActionsMenuButton({ actions }: QuickActionsMenuButtonProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const buttonId = useId();
  const menuId = useId();

  if (actions.length === 0) return null;

  const label = t("common.more_actions");
  const menuEdge = theme.direction === "rtl" ? "left" : "right";
  const run = (action: TableAction) => {
    setAnchor(null);
    action.onClick();
  };

  return (
    <>
      <Tooltip title={label}>
        <IconButton
          id={buttonId}
          aria-label={label}
          aria-haspopup="menu"
          aria-controls={anchor ? menuId : undefined}
          aria-expanded={anchor ? true : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <MoreVertIcon />
        </IconButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: menuEdge }}
        transformOrigin={{ vertical: "top", horizontal: menuEdge }}
        slotProps={{ list: { "aria-labelledby": buttonId } }}
      >
        {actions.map((action) => actionMenuItem(action, run))}
      </Menu>
    </>
  );
}
