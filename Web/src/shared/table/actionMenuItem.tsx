import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import type { TableAction } from "./tableAction";

// Not a component: MenuList must see MenuItem as its direct child.
export function actionMenuItem(action: TableAction, run: (action: TableAction) => void) {
  const Icon = action.icon;
  const color = action.destructive ? "error.main" : undefined;
  return (
    <MenuItem key={action.key} disabled={action.disabled} onClick={() => run(action)}>
      <ListItemIcon sx={{ color }}>
        <Icon fontSize="small" />
      </ListItemIcon>
      <ListItemText
        primary={action.label}
        secondary={action.caption}
        slotProps={{ primary: { sx: { color } } }}
      />
    </MenuItem>
  );
}
