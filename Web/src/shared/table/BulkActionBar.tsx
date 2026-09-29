import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { sortActions } from "@shared/shared/lib/actionOrder";
import type { TableAction } from "./tableAction";

interface BulkActionBarProps {
  count: number;
  actions: TableAction[];
  onClear: () => void;
}

export function BulkActionBar({ count, actions, onClear }: BulkActionBarProps) {
  const { t } = useTranslation();
  return (
    <Stack
      direction="row"
      spacing={1}
      role="toolbar"
      aria-label={t("common.selected_count", { count })}
      sx={{
        alignItems: "center",
        flexWrap: "wrap",
        rowGap: 1,
        px: 1.5,
        py: 1,
        minHeight: 56,
        borderRadius: 1,
        bgcolor: "primary.light",
      }}
    >
      <Tooltip title={t("web.table.clear_selection")}>
        <IconButton size="small" aria-label={t("web.table.clear_selection")} onClick={onClear}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Typography sx={{ fontWeight: 600, paddingInlineEnd: 1 }}>
        {t("common.selected_count", { count })}
      </Typography>
      {sortActions(actions).map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.key}
            size="small"
            variant="outlined"
            color={action.destructive ? "error" : "primary"}
            startIcon={<Icon fontSize="small" />}
            disabled={action.disabled}
            onClick={action.onClick}
            sx={{ bgcolor: "background.paper" }}
          >
            {action.label}
          </Button>
        );
      })}
    </Stack>
  );
}
