import { useId, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import Tooltip from "@mui/material/Tooltip";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { actionMenuItem } from "@/shared/table/actionMenuItem";
import type { TableAction } from "@/shared/table/tableAction";

interface AddNewMenuButtonProps {
  actions: TableAction[];
  wide: boolean;
}

export function AddNewMenuButton({ actions, wide }: AddNewMenuButtonProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const buttonId = useId();
  const menuId = useId();

  if (actions.length === 0) return null;

  const label = t("common.add_new");
  const menuEdge = theme.direction === "rtl" ? "left" : "right";
  const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  const run = (action: TableAction) => {
    setAnchor(null);
    action.onClick();
  };
  const menuButtonProps = {
    id: buttonId,
    "aria-haspopup": "menu" as const,
    "aria-controls": anchor ? menuId : undefined,
    "aria-expanded": anchor ? true : undefined,
    onClick: open,
  };

  return (
    <>
      {wide ? (
        <Button variant="outlined" startIcon={<AddIcon />} endIcon={<ExpandMore />} {...menuButtonProps}>
          {label}
        </Button>
      ) : (
        <Tooltip title={label}>
          <IconButton aria-label={label} {...menuButtonProps}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      )}
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
