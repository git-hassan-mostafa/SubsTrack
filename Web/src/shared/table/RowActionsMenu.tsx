import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { sortActions } from "@shared/shared/lib/actionOrder";
import type { TableAction } from "./tableAction";

interface RowActionsMenuProps {
  rowLabel: string;
  actions: TableAction[];
  tabIndex?: 0 | -1;
}

// Rows come in the same band order as the phone menu (actionOrder).
export function RowActionsMenu({ rowLabel, actions, tabIndex }: RowActionsMenuProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const sorted = sortActions(actions);
  if (sorted.length === 0) return null;
  const label = t("web.table.actions_for", { name: rowLabel });

  const run = (action: TableAction) => {
    setAnchor(null);
    action.onClick();
  };

  return (
    <>
      <Tooltip title={t("common.more_actions")}>
        <IconButton
          size="small"
          tabIndex={tabIndex}
          aria-label={label}
          aria-haspopup="menu"
          aria-controls={anchor ? menuId : undefined}
          aria-expanded={anchor ? true : undefined}
          onClick={(event) => {
            event.stopPropagation();
            setAnchor(event.currentTarget);
          }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        onClick={(event) => event.stopPropagation()}
      >
        {sorted.map((action) => {
          const Icon = action.icon;
          const color = action.destructive ? "error.main" : undefined;
          return (
            <MenuItem
              key={action.key}
              disabled={action.disabled}
              onClick={() => run(action)}
            >
              <ListItemIcon sx={{ color }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText slotProps={{ primary: { sx: { color } } }}>
                {action.label}
              </ListItemText>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
