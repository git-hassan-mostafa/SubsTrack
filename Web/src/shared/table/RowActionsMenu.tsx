import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import Tooltip from "@mui/material/Tooltip";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { sortActions } from "@shared/shared/lib/actionOrder";
import { actionMenuItem } from "./actionMenuItem";
import type { TableAction } from "./tableAction";

interface RowActionsMenuProps {
  rowLabel: string;
  actions: TableAction[];
  tabIndex?: 0 | -1;
  busy?: boolean;
}

// Rows come in the same band order as the phone menu (actionOrder).
export function RowActionsMenu({ rowLabel, actions, tabIndex, busy = false }: RowActionsMenuProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const sorted = sortActions(actions);
  if (sorted.length === 0) return null;
  const label = t("web.table.actions_for", { name: rowLabel });

  if (busy) {
    return <CircularProgress size={20} aria-label={t("web.table.working_on", { name: rowLabel })} />;
  }

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
        {sorted.map((action) => actionMenuItem(action, run))}
      </Menu>
    </>
  );
}
