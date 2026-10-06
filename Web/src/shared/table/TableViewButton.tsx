import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Check from "@mui/icons-material/Check";
import DensityLarge from "@mui/icons-material/DensityLarge";
import DensityMedium from "@mui/icons-material/DensityMedium";
import DensitySmall from "@mui/icons-material/DensitySmall";
import RestartAlt from "@mui/icons-material/RestartAlt";
import type { GridDensity } from "@mui/x-data-grid";
import { useTableDensity } from "./tableViews";

const DENSITIES: readonly { value: GridDensity; labelKey: string; Icon: typeof DensityMedium }[] = [
  { value: "compact", labelKey: "web.table.density_compact", Icon: DensitySmall },
  { value: "standard", labelKey: "web.table.density_standard", Icon: DensityMedium },
  { value: "comfortable", labelKey: "web.table.density_comfortable", Icon: DensityLarge },
];

export function TableViewButton({ onResetColumns }: { onResetColumns: () => void }) {
  const { t } = useTranslation();
  const { density, setDensity } = useTableDensity();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const label = t("web.table.table_view");
  const CurrentIcon = DENSITIES.find((d) => d.value === density)?.Icon ?? DensityMedium;

  return (
    <>
      <Tooltip title={label}>
        <IconButton
          aria-label={label}
          aria-haspopup="menu"
          aria-controls={anchor ? menuId : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <CurrentIcon />
        </IconButton>
      </Tooltip>
      <Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <ListSubheader>{t("web.table.row_height")}</ListSubheader>
        {DENSITIES.map((option) => (
          <MenuItem
            key={option.value}
            selected={option.value === density}
            onClick={() => {
              setDensity(option.value);
              setAnchor(null);
            }}
          >
            <ListItemIcon>{option.value === density ? <Check fontSize="small" /> : null}</ListItemIcon>
            <ListItemText>{t(option.labelKey)}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            onResetColumns();
            setAnchor(null);
          }}
        >
          <ListItemIcon>
            <RestartAlt fontSize="small" />
          </ListItemIcon>
          <ListItemText secondary={t("web.table.reset_columns_hint")}>
            {t("web.table.reset_columns")}
          </ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
